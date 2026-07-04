import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { SessionService } from '../../common/session.service';
import { S3Service } from '../storage/s3.service';
import { VeoService, VeoImageInput } from './veo.service';
import { VideoStitchingService } from './video-stitching.service';
import {
  GeneratedVideoVariant,
  GenerationStatus,
  GenerationError,
  SceneClipStatus,
} from '../../common/types/generation.types';
import { ScenePrompt } from '../../common/types/prompt.types';
import { SessionStatus } from '../../common/types/session.types';
import { loadConfiguration } from '../../config/configuration';
import { resolveVideoDimensions } from '../../common/utils/ffmpeg.util';
import { v4 as uuidv4 } from 'uuid';

/**
 * GenerationService orchestrates fast-paced, multi-clip advertisement
 * video generation using Google Veo 3 / 3.1.
 *
 * For every approved prompt variant, each scene is rendered as its own
 * short Veo clip (so cut timing, per-scene pacing, and dialogue stay
 * tightly controlled), then all clips are stitched into a single vertical
 * video with ffmpeg and uploaded to S3. Multiple variants can be
 * generated and rendered in the same batch so different hook angles can
 * be compared side-by-side.
 */
@Injectable()
export class GenerationService {
  private readonly logger = new Logger(GenerationService.name);
  private readonly aspectRatio: string;
  private readonly resolution: string;

  constructor(
    private readonly sessionService: SessionService,
    private readonly s3Service: S3Service,
    private readonly veoService: VeoService,
    private readonly stitchingService: VideoStitchingService,
  ) {
    const config = loadConfiguration();
    this.aspectRatio = config.veo.aspectRatio;
    this.resolution = config.veo.resolution;
  }

  /**
   * Kick off video generation for every approved prompt variant that
   * doesn't already have a video in progress/complete.
   * @param sessionId - Session UUID
   * @returns The set of generated video variants (including ones already in progress)
   */
  async generateVideos(sessionId: string): Promise<GeneratedVideoVariant[]> {
    const session = this.sessionService.getSession(sessionId);
    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }

    const approvedVariants = (session.promptVariants || []).filter(
      (v) => !!v.approvedAt,
    );

    if (approvedVariants.length === 0) {
      throw new BadRequestException(
        'At least one prompt variant must be approved before generating video',
      );
    }

    const existingVideos = session.generatedVideoVariants || [];
    const videosToKeep = existingVideos.filter(
      (video) =>
        !approvedVariants.some((v) => v.variantId === video.promptVariantId) ||
        video.status === GenerationStatus.COMPLETE,
    );

    const newVideos: GeneratedVideoVariant[] = [];

    for (const variant of approvedVariants) {
      const alreadyComplete = existingVideos.find(
        (video) =>
          video.promptVariantId === variant.variantId &&
          video.status === GenerationStatus.COMPLETE,
      );
      if (alreadyComplete) {
        continue;
      }

      const generatedVideoId = uuidv4();
      const s3Key = this.s3Service.generateGeneratedVideoKey(
        sessionId,
        generatedVideoId,
      );

      const sceneClips: SceneClipStatus[] = variant.scenePrompts.map((sp) => ({
        sceneIndex: sp.sceneIndex,
        purpose: sp.purpose,
        status: GenerationStatus.PENDING,
      }));

      const video: GeneratedVideoVariant = {
        variantId: generatedVideoId,
        promptVariantId: variant.variantId,
        hookLabel: variant.hookLabel,
        s3Key,
        s3Bucket: 'viral2viral-videos',
        fileName: `generated-${variant.hookLabel.toLowerCase().replace(/\s+/g, '-')}.mp4`,
        mimeType: 'video/mp4',
        status: GenerationStatus.PENDING,
        sceneClips,
        initiatedAt: new Date(),
      };

      newVideos.push(video);
    }

    const allVideos = [...videosToKeep, ...newVideos];
    this.sessionService.updateSession(sessionId, {
      generatedVideoVariants: allVideos,
      status: SessionStatus.GENERATING_VIDEO,
    });

    // Process variants sequentially to stay within API rate limits/cost
    // controls; scenes within a variant are also rendered sequentially so
    // per-scene progress can be reported reliably.
    this.processBatch(
      sessionId,
      newVideos.map((v) => v.variantId),
    ).catch((error) => {
      this.logger.error(
        `Unexpected error while processing video batch for session ${sessionId}:`,
        error,
      );
    });

    return allVideos;
  }

  /**
   * Get the status of all generated video variants for a session
   * @param sessionId - Session UUID
   * @returns Current video generation statuses, with download URLs for completed ones
   */
  async getVideoStatus(sessionId: string): Promise<GeneratedVideoVariant[]> {
    const session = this.sessionService.getSession(sessionId);
    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }

    const videos = session.generatedVideoVariants || [];
    if (videos.length === 0) {
      throw new NotFoundException('Video generation has not been initiated');
    }

    return Promise.all(
      videos.map(async (video) => {
        if (video.status === GenerationStatus.COMPLETE) {
          const downloadUrl = await this.s3Service.generatePresignedDownloadUrl(
            video.s3Key,
            3600,
          );
          return { ...video, downloadUrl };
        }
        return video;
      }),
    );
  }

  /**
   * Sequentially process a batch of newly-created video variants.
   */
  private async processBatch(
    sessionId: string,
    variantIds: string[],
  ): Promise<void> {
    for (const variantId of variantIds) {
      try {
        await this.processVariant(sessionId, variantId);
      } catch (error) {
        this.logger.error(
          `Video generation failed for variant ${variantId} (session ${sessionId}):`,
          error,
        );
        this.markVariantFailed(sessionId, variantId, error);
      }
    }
  }

  /**
   * Render every scene clip for a single variant with Veo, stitch them
   * together, and upload the final video to S3.
   */
  private async processVariant(
    sessionId: string,
    generatedVideoId: string,
  ): Promise<void> {
    const session = this.sessionService.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const video = session.generatedVideoVariants?.find(
      (v) => v.variantId === generatedVideoId,
    );
    if (!video) {
      throw new Error('Generated video record not found');
    }

    const promptVariant = session.promptVariants?.find(
      (v) => v.variantId === video.promptVariantId,
    );
    if (!promptVariant || promptVariant.scenePrompts.length === 0) {
      throw new Error('Approved prompt variant not found');
    }

    this.updateVideoRecord(sessionId, generatedVideoId, {
      status: GenerationStatus.PROCESSING,
    });

    // Optionally anchor the first scene with the uploaded product image so
    // the product's real appearance carries through the whole video.
    let firstSceneImage: VeoImageInput | undefined;
    const imageS3Key = session.productInformation?.productImageS3Key;
    if (imageS3Key) {
      try {
        const imageBuffer = await this.s3Service.downloadBuffer(imageS3Key);
        firstSceneImage = {
          imageBytes: imageBuffer.toString('base64'),
          mimeType:
            session.productInformation?.productImageMimeType || 'image/png',
        };
      } catch (error) {
        this.logger.warn(
          `Could not load product image for session ${sessionId}, continuing text-only: ${error}`,
        );
      }
    }

    const clipBuffers: Buffer[] = [];

    for (let i = 0; i < promptVariant.scenePrompts.length; i++) {
      const scenePrompt: ScenePrompt = promptVariant.scenePrompts[i];

      this.updateSceneClipStatus(
        sessionId,
        generatedVideoId,
        scenePrompt.sceneIndex,
        GenerationStatus.PROCESSING,
      );

      try {
        const clipBuffer = await this.veoService.generateClip({
          prompt: scenePrompt.text,
          durationSeconds: scenePrompt.durationSeconds,
          image: i === 0 ? firstSceneImage : undefined,
        });

        clipBuffers.push(clipBuffer);

        this.updateSceneClipStatus(
          sessionId,
          generatedVideoId,
          scenePrompt.sceneIndex,
          GenerationStatus.COMPLETE,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.updateSceneClipStatus(
          sessionId,
          generatedVideoId,
          scenePrompt.sceneIndex,
          GenerationStatus.FAILED,
          message,
        );
        throw new Error(
          `Scene ${scenePrompt.sceneIndex + 1}/${promptVariant.scenePrompts.length} failed to render: ${message}`,
        );
      }
    }

    this.logger.log(
      `All ${clipBuffers.length} scene clips rendered for variant ${generatedVideoId}, stitching...`,
    );

    const dimensions = resolveVideoDimensions(
      this.aspectRatio,
      this.resolution,
    );
    const stitchedBuffer = await this.stitchingService.stitchClips(
      clipBuffers,
      dimensions,
    );

    const currentVideo = this.getVideoRecord(sessionId, generatedVideoId);
    if (!currentVideo) {
      throw new Error('Generated video record disappeared during processing');
    }

    await this.s3Service.uploadBuffer(
      currentVideo.s3Key,
      stitchedBuffer,
      'video/mp4',
    );

    this.updateVideoRecord(sessionId, generatedVideoId, {
      status: GenerationStatus.COMPLETE,
      completedAt: new Date(),
      fileSize: stitchedBuffer.length,
    });

    this.maybeMarkSessionComplete(sessionId);

    this.logger.log(
      `Video generation complete for variant ${generatedVideoId} (session ${sessionId})`,
    );
  }

  private markVariantFailed(
    sessionId: string,
    generatedVideoId: string,
    error: unknown,
  ): void {
    const errorDetail: GenerationError = {
      code: 'VIDEO_GENERATION_FAILED',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date(),
      retryable: true,
    };

    this.updateVideoRecord(sessionId, generatedVideoId, {
      status: GenerationStatus.FAILED,
      error: errorDetail,
    });

    this.maybeMarkSessionComplete(sessionId);
  }

  private getVideoRecord(
    sessionId: string,
    variantId: string,
  ): GeneratedVideoVariant | undefined {
    const session = this.sessionService.getSession(sessionId);
    return session?.generatedVideoVariants?.find(
      (v) => v.variantId === variantId,
    );
  }

  private updateVideoRecord(
    sessionId: string,
    variantId: string,
    updates: Partial<GeneratedVideoVariant>,
  ): void {
    const session = this.sessionService.getSession(sessionId);
    if (!session?.generatedVideoVariants) return;

    const videos = session.generatedVideoVariants.map((v) =>
      v.variantId === variantId ? { ...v, ...updates } : v,
    );

    this.sessionService.updateSession(sessionId, {
      generatedVideoVariants: videos,
    });
  }

  private updateSceneClipStatus(
    sessionId: string,
    variantId: string,
    sceneIndex: number,
    status: GenerationStatus,
    error?: string,
  ): void {
    const session = this.sessionService.getSession(sessionId);
    if (!session?.generatedVideoVariants) return;

    const videos = session.generatedVideoVariants.map((v) => {
      if (v.variantId !== variantId) return v;
      return {
        ...v,
        sceneClips: v.sceneClips.map((clip) =>
          clip.sceneIndex === sceneIndex ? { ...clip, status, error } : clip,
        ),
      };
    });

    this.sessionService.updateSession(sessionId, {
      generatedVideoVariants: videos,
    });
  }

  /**
   * Flip the overall session status to VIDEO_COMPLETE once every generated
   * video variant has reached a terminal state (complete or failed).
   */
  private maybeMarkSessionComplete(sessionId: string): void {
    const session = this.sessionService.getSession(sessionId);
    if (!session?.generatedVideoVariants) return;

    const allTerminal = session.generatedVideoVariants.every(
      (v) =>
        v.status === GenerationStatus.COMPLETE ||
        v.status === GenerationStatus.FAILED,
    );

    if (allTerminal) {
      const anyComplete = session.generatedVideoVariants.some(
        (v) => v.status === GenerationStatus.COMPLETE,
      );
      this.sessionService.updateSession(sessionId, {
        status: anyComplete
          ? SessionStatus.VIDEO_COMPLETE
          : SessionStatus.ERROR,
      });
    }
  }
}
