/**
 * ffmpeg Utility
 *
 * Thin wrapper around the system `ffmpeg` binary (available in this
 * container) used for normalizing and stitching AI-generated scene clips
 * into a single fast-paced video, and for synthesizing placeholder clips
 * in mock/dev mode.
 */

import { spawn } from 'child_process';
import { Logger } from '@nestjs/common';

const logger = new Logger('ffmpeg');

/**
 * Run ffmpeg with the given arguments, rejecting on a non-zero exit code.
 */
export function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';

    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to start ffmpeg: ${err.message}`));
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        // Only keep the tail of stderr - ffmpeg logs are verbose
        const tail = stderr.split('\n').slice(-20).join('\n');
        logger.error(`ffmpeg exited with code ${code}:\n${tail}`);
        reject(new Error(`ffmpeg exited with code ${code}: ${tail}`));
      }
    });
  });
}

export interface VideoDimensions {
  width: number;
  height: number;
}

/**
 * Resolve pixel dimensions for a given Veo aspectRatio/resolution combination.
 */
export function resolveVideoDimensions(
  aspectRatio: string,
  resolution: string,
): VideoDimensions {
  const isPortrait = aspectRatio === '9:16';

  const shortSide =
    resolution === '4k' ? 2160 : resolution === '1080p' ? 1080 : 720;
  const longSide = Math.round((shortSide * 16) / 9);

  return isPortrait
    ? { width: shortSide, height: longSide }
    : { width: longSide, height: shortSide };
}
