/**
 * VideoStitchingService
 *
 * Concatenates several independently-generated scene clips into a single
 * fast-paced advertisement video. Each clip is first normalized to a
 * common resolution/framerate/codec so that ffmpeg's concat demuxer can
 * join them with a simple stream copy (fast, no re-encode on the second pass).
 */

import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { runFfmpeg, VideoDimensions } from '../../common/utils/ffmpeg.util';

@Injectable()
export class VideoStitchingService {
  private readonly logger = new Logger(VideoStitchingService.name);

  /**
   * Normalize and concatenate a sequence of mp4 clip buffers into one video.
   *
   * @param clips - Ordered clip buffers (scene 0 first)
   * @param dimensions - Target output resolution
   * @param fps - Target output frame rate
   * @returns Buffer containing the stitched mp4
   */
  async stitchClips(
    clips: Buffer[],
    dimensions: VideoDimensions,
    fps = 24,
  ): Promise<Buffer> {
    if (clips.length === 0) {
      throw new Error('No clips provided to stitch');
    }

    if (clips.length === 1) {
      // Still normalize a single clip so output format is always consistent.
      return this.normalizeClip(clips[0], dimensions, fps);
    }

    const workDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'viral2viral-stitch-'),
    );

    try {
      const normalizedPaths: string[] = [];

      for (let i = 0; i < clips.length; i++) {
        this.logger.log(`Normalizing scene clip ${i + 1}/${clips.length}`);
        const rawPath = path.join(workDir, `raw-${i}.mp4`);
        await fs.writeFile(rawPath, clips[i]);

        const normPath = path.join(workDir, `norm-${i}.mp4`);
        await runFfmpeg([
          '-y',
          '-i',
          rawPath,
          '-vf',
          `scale=${dimensions.width}:${dimensions.height}:force_original_aspect_ratio=decrease,pad=${dimensions.width}:${dimensions.height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps}`,
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          '20',
          '-c:a',
          'aac',
          '-ar',
          '48000',
          '-ac',
          '2',
          '-movflags',
          '+faststart',
          normPath,
        ]);
        normalizedPaths.push(normPath);
      }

      const listPath = path.join(workDir, 'concat-list.txt');
      const listContent = normalizedPaths
        .map((p) => `file '${p.replace(/'/g, "'\\''")}'`)
        .join('\n');
      await fs.writeFile(listPath, listContent);

      const outputPath = path.join(workDir, 'stitched.mp4');
      this.logger.log(`Concatenating ${normalizedPaths.length} clips`);
      await runFfmpeg([
        '-y',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        listPath,
        '-c',
        'copy',
        outputPath,
      ]);

      return await fs.readFile(outputPath);
    } finally {
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => {
        /* best-effort cleanup */
      });
    }
  }

  /**
   * Normalize a single clip to the target resolution/fps/codec without
   * concatenation (used when a variant only has one scene).
   */
  private async normalizeClip(
    clip: Buffer,
    dimensions: VideoDimensions,
    fps: number,
  ): Promise<Buffer> {
    const workDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'viral2viral-normalize-'),
    );

    try {
      const rawPath = path.join(workDir, 'raw.mp4');
      await fs.writeFile(rawPath, clip);

      const outputPath = path.join(workDir, 'normalized.mp4');
      await runFfmpeg([
        '-y',
        '-i',
        rawPath,
        '-vf',
        `scale=${dimensions.width}:${dimensions.height}:force_original_aspect_ratio=decrease,pad=${dimensions.width}:${dimensions.height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps}`,
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '20',
        '-c:a',
        'aac',
        '-ar',
        '48000',
        '-ac',
        '2',
        '-movflags',
        '+faststart',
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
