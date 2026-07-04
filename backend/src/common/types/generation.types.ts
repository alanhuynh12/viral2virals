/**
 * Generation Types
 *
 * Defines generated video structures and processing status.
 * Video generation happens per prompt variant: each variant is rendered
 * as several short Veo clips (one per scene) which are then stitched
 * into a single fast-paced vertical video.
 */

/**
 * Video generation status
 */
export enum GenerationStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETE = 'complete',
  FAILED = 'failed',
}

/**
 * Generation error details
 */
export interface GenerationError {
  /** Error code */
  code: string;

  /** Error message */
  message: string;

  /** Error timestamp */
  timestamp: Date;

  /** Whether user can retry */
  retryable: boolean;
}

/**
 * Tracks the render status of a single scene clip within a variant.
 */
export interface SceneClipStatus {
  /** Zero-based index matching the source ScenePrompt */
  sceneIndex: number;

  /** Scene purpose label, for progress display */
  purpose: string;

  /** Render status of this individual clip */
  status: GenerationStatus;

  /** Error message if this clip failed to render */
  error?: string;
}

/**
 * GeneratedVideoVariant represents one fully rendered advertisement video
 * (a stitched sequence of scene clips) produced from an approved prompt variant.
 */
export interface GeneratedVideoVariant {
  /** Unique identifier (UUID) */
  variantId: string;

  /** ID of the GenerationPromptVariant this video was rendered from */
  promptVariantId: string;

  /** Human-readable hook label, copied from the prompt variant for display */
  hookLabel: string;

  /** S3 object key for the final stitched video */
  s3Key: string;

  /** S3 bucket name */
  s3Bucket: string;

  /** Generated filename */
  fileName: string;

  /** File size in bytes (unknown until complete, optional) */
  fileSize?: number;

  /** MIME type (typically video/mp4) */
  mimeType: string;

  /** Overall processing status for this variant */
  status: GenerationStatus;

  /** Per-scene clip render progress */
  sceneClips: SceneClipStatus[];

  /** When generation was started */
  initiatedAt: Date;

  /** When generation finished (optional) */
  completedAt?: Date;

  /** Presigned download URL (temporary, generated on request, optional) */
  downloadUrl?: string;

  /** Error details if generation failed (optional) */
  error?: GenerationError;
}
