/**
 * VeoService
 *
 * Wraps Google's Veo 3 / 3.1 video generation models (via the @google/genai
 * SDK) behind a simple generate-and-wait interface. Handles the
 * long-running-operation polling required by the Veo API and returns raw
 * mp4 bytes ready for stitching.
 *
 * Replaces the previous Sora 2 (via laozhang.ai) integration.
 */

import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { loadConfiguration } from '../../config/configuration';
import {
  runFfmpeg,
  resolveVideoDimensions,
} from '../../common/utils/ffmpeg.util';
import { snapToVeoDuration } from '../../common/utils/scene-analysis.util';

export interface VeoImageInput {
  /** Base64-encoded image bytes (no data: prefix) */
  imageBytes: string;
  mimeType: string;
}

export interface VeoGenerateOptions {
  /** Text prompt for this scene (subject, action, style, camera, dialogue in quotes, SFX) */
  prompt: string;
  /** Target scene duration in seconds - will be snapped to 4/6/8 */
  durationSeconds: number;
  /** Optional first-frame image, used to anchor the product's appearance in a scene */
  image?: VeoImageInput;
  /** Optional negative prompt (things to avoid) */
  negativePrompt?: string;
}

const POLL_INTERVAL_MS = 10_000;
const MAX_WAIT_MS = 10 * 60 * 1000; // 10 minutes safety cap per clip

@Injectable()
export class VeoService {
  private readonly logger = new Logger(VeoService.name);
  private readonly ai?: GoogleGenAI;
  private readonly model: string;
  private readonly aspectRatio: string;
  private readonly resolution: string;
  private readonly mock: boolean;

  constructor() {
    const config = loadConfiguration();
    this.model = config.veo.model;
    this.aspectRatio = config.veo.aspectRatio;
    this.resolution = config.veo.resolution;
    this.mock = config.veo.mock;

    if (!this.mock) {
      if (!config.veo.apiKey) {
        throw new Error(
          'GOOGLE_GEMINI_API_KEY, GEMINI_API_KEY, or VEO_API_KEY environment variable is required for Veo video generation',
        );
      }
      this.ai = new GoogleGenAI({ apiKey: config.veo.apiKey });
    }
  }

  /**
   * Generate a single short scene clip with Veo and return the raw mp4 bytes.
   */
  async generateClip(options: VeoGenerateOptions): Promise<Buffer> {
    const durationSeconds = snapToVeoDuration(options.durationSeconds);

    if (this.mock) {
      this.logger.log(
        `MOCK_VIDEO_GENERATION enabled, synthesizing placeholder clip (${durationSeconds}s)`,
      );
      return this.generateMockClip(options.prompt, durationSeconds);
    }

    this.logger.log(
      `Requesting Veo clip (model=${this.model}, duration=${durationSeconds}s, aspectRatio=${this.aspectRatio})`,
    );

    let operation = await this.ai!.models.generateVideos({
      model: this.model,
      prompt: options.prompt,
      image: options.image,
      config: {
        aspectRatio: this.aspectRatio,
        resolution: this.resolution,
        durationSeconds,
        negativePrompt: options.negativePrompt,
        personGeneration: 'allow_adult',
        generateAudio: true,
      },
    });

    const startedAt = Date.now();
    while (!operation.done) {
      if (Date.now() - startedAt > MAX_WAIT_MS) {
        throw new Error('Veo video generation timed out after 10 minutes');
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      operation = await this.ai!.operations.getVideosOperation({ operation });
    }

    if (operation.error) {
      throw new Error(
        `Veo video generation failed: ${JSON.stringify(operation.error)}`,
      );
    }

    const generatedVideos = operation.response?.generatedVideos;
    if (!generatedVideos || generatedVideos.length === 0) {
      throw new Error(
        'Veo returned no generated videos (the clip may have been blocked by safety filters)',
      );
    }

    const video = generatedVideos[0].video;
    if (!video) {
      throw new Error('Veo response did not include a video payload');
    }

    if (video.videoBytes) {
      return Buffer.from(video.videoBytes, 'base64');
    }

    // Some responses only include a URI - fetch it through the Files API.
    const tempPath = path.join(
      os.tmpdir(),
      `veo-clip-${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`,
    );
    await this.ai!.files.download({ file: video, downloadPath: tempPath });
    try {
      return await fs.readFile(tempPath);
    } finally {
      await fs.unlink(tempPath).catch(() => {
        /* best-effort cleanup */
      });
    }
  }

  /**
   * Synthesize a short placeholder clip with ffmpeg (color background +
   * the scene prompt as burned-in text) so the full multi-clip + stitching
   * pipeline can be exercised end-to-end without any billed API calls.
   */
  private async generateMockClip(
    prompt: string,
    durationSeconds: number,
  ): Promise<Buffer> {
    const { width, height } = resolveVideoDimensions(
      this.aspectRatio,
      this.resolution,
    );

    const workDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'viral2viral-mock-clip-'),
    );

    try {
      const outputPath = path.join(workDir, 'mock.mp4');
      const colors = ['0x1f2937', '0x065f46', '0x7c2d12', '0x1e3a8a'];
      const bgColor = colors[Math.floor(Math.random() * colors.length)];

      const label = prompt
        .replace(/['"\\:,[\]]/g, '')
        .slice(0, 60)
        .replace(/\n/g, ' ');

      await runFfmpeg([
        '-y',
        '-f',
        'lavfi',
        '-i',
        `color=c=${bgColor}:s=${width}x${height}:d=${durationSeconds}:r=24`,
        '-f',
        'lavfi',
        '-i',
        `anullsrc=r=48000:cl=stereo:d=${durationSeconds}`,
        '-vf',
        `drawtext=text='${label}':fontcolor=white:fontsize=${Math.round(width / 18)}:x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.4:boxborderw=20`,
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-c:a',
        'aac',
        '-shortest',
        outputPath,
      ]);

      return await fs.readFile(outputPath);
    } finally {
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => {
        /* best-effort cleanup */
      });
    }
  }
}
