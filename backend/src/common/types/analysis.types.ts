/**
 * Analysis Types
 *
 * Defines AI-generated video analysis structures using Google Gemini.
 * The schema is optimized for recreating fast-paced, TikTok/Reels-style
 * UGC ads: it captures per-scene cut timing, on-screen captions, and an
 * explicit hook classification in addition to the original cinematic
 * breakdown fields.
 */

/**
 * Analysis processing status
 */
export enum AnalysisStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETE = 'complete',
  FAILED = 'failed',
}

/**
 * Scene purpose in video narrative
 */
export enum ScenePurpose {
  HOOK = 'hook',
  PROBLEM = 'problem',
  SOLUTION = 'solution',
  BENEFIT = 'benefit',
  CTA = 'cta',
}

/**
 * Hook archetypes commonly used by high-performing short-form ads.
 * Used to drive batch variant generation (each variant tries a different hook).
 */
export enum HookType {
  PATTERN_INTERRUPT = 'pattern_interrupt',
  BOLD_CLAIM = 'bold_claim',
  QUESTION = 'question',
  RELATABLE_PROBLEM = 'relatable_problem',
  VISUAL_SHOCK = 'visual_shock',
  SOCIAL_PROOF = 'social_proof',
  OTHER = 'other',
}

/**
 * An on-screen caption/text-overlay detected within a scene.
 * Captured separately from prose so it can later be re-rendered
 * (burned-in captions) instead of just described to a video model.
 */
export interface SceneCaption {
  /** Caption copy exactly as shown on screen */
  text: string;

  /** Where the caption sits in frame */
  position: 'top' | 'center' | 'bottom';

  /** Short style description (font weight, color, animation, emphasis) */
  style?: string;

  /** Seconds from the start of the scene when the caption appears */
  startTime?: number;

  /** Seconds from the start of the scene when the caption disappears */
  endTime?: number;
}

/**
 * Individual scene analysis
 */
export interface Scene {
  /** Zero-based index of the scene within the video */
  sceneIndex: number;

  /** Original timestamp (e.g., "0:00-0:02") */
  timestamp: string;

  /** Scene start time in seconds from the beginning of the source video */
  startTimeSeconds?: number;

  /** Duration in seconds */
  duration: number;

  /** Scene purpose in narrative */
  purpose: ScenePurpose;

  /** Hook classification (only meaningful when purpose === 'hook') */
  hookType?: HookType;

  /** Visual details */
  visualDetails: {
    cameraAngle?: string;
    movement?: string;
    lighting?: string;
    colorPalette?: string;
    onScreenElements?: string;
  };

  /** Cinematic details */
  cinematicDetails: {
    shotType?: string;
    pacing?: string;
    style?: string;
    /** Approximate number of hard cuts within this scene */
    cutCount?: number;
  };

  /** Audio details */
  audioDetails: {
    dialogue?: string;
    soundDesign?: string;
    timing?: string;
  };

  /** On-screen captions/text-overlays that appear during this scene */
  captions?: SceneCaption[];
}

/**
 * Global caption styling detected across the source video, used to keep
 * a consistent look when captions are later re-rendered.
 */
export interface CaptionStyle {
  fontFamily?: string;
  textColor?: string;
  backgroundStyle?: string;
  position?: 'top' | 'center' | 'bottom';
  animation?: string;
}

/**
 * Structured analysis data parsed from AI response
 */
export interface AnalysisStructuredData {
  /** Scene-by-scene breakdown */
  scenes: Scene[];

  /** Explicit hook classification for the opening 1-2 seconds */
  hook?: {
    type: HookType;
    text: string;
    durationSeconds: number;
  };

  /** Overall aesthetic description */
  overallAesthetic?: string;

  /** Dominant colors identified */
  dominantColors?: string[];

  /** Pacing description */
  pacing?: string;

  /** Audio style description */
  audioStyle?: string;

  /** Recommended music style/genre to replicate the energy of the source */
  musicStyle?: string;

  /** Consistent caption styling used throughout the source video */
  captionStyle?: CaptionStyle;

  /** Recommended aspect ratio for the platform this was designed for */
  recommendedAspectRatio?: '9:16' | '16:9' | '1:1';

  /** Total duration of the analyzed video in seconds */
  totalDurationSeconds?: number;

  /** Total number of hard cuts detected across the whole video */
  cutCount?: number;

  /** Average shot length in seconds (totalDurationSeconds / cutCount) - an objective pacing metric */
  averageShotDurationSeconds?: number;
}

/**
 * Analysis error details
 */
export interface AnalysisError {
  /** Error code */
  code: string;

  /** Error message */
  message: string;

  /** Error timestamp */
  timestamp: Date;
}

/**
 * VideoAnalysis represents AI-generated insights from the original video
 */
export interface VideoAnalysis {
  /** Unique identifier (UUID) */
  analysisId: string;

  /** Analysis timestamp */
  analyzedAt: Date;

  /** Processing status */
  status: AnalysisStatus;

  /** Raw scene-by-scene breakdown, pretty-printed JSON (can be edited by user) */
  sceneBreakdown: string;

  /** Parsed structured insights, derived from sceneBreakdown/userEdits */
  structuredData?: AnalysisStructuredData;

  /** User's edited version of scene breakdown (optional) */
  userEdits?: string;

  /** Error details if analysis failed (optional) */
  error?: AnalysisError;
}
