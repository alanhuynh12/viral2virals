/**
 * Frontend TypeScript Interfaces
 *
 * Type definitions matching backend API structures.
 */

// Session types
export enum SessionStatus {
  CREATED = 'created',
  VIDEO_UPLOADED = 'video_uploaded',
  ANALYZING = 'analyzing',
  ANALYSIS_COMPLETE = 'analysis_complete',
  PRODUCT_INFO_ADDED = 'product_info_added',
  PROMPT_GENERATED = 'prompt_generated',
  GENERATING_VIDEO = 'generating_video',
  VIDEO_COMPLETE = 'video_complete',
  ERROR = 'error',
}

export interface Session {
  sessionId: string;
  createdAt: string;
  lastActivityAt: string;
  status: SessionStatus;
  originalVideo?: OriginalVideo;
  videoAnalysis?: VideoAnalysis;
  productInformation?: ProductInformation;
  promptVariants?: GenerationPromptVariant[];
  generatedVideoVariants?: GeneratedVideoVariant[];
}

// Video types
export interface OriginalVideo {
  s3Key: string;
  s3Bucket: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: string;
  duration?: number;
  thumbnailS3Key?: string;
  downloadUrl?: string;
}

// Analysis types
export enum AnalysisStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETE = 'complete',
  FAILED = 'failed',
}

export enum HookType {
  PATTERN_INTERRUPT = 'pattern_interrupt',
  BOLD_CLAIM = 'bold_claim',
  QUESTION = 'question',
  RELATABLE_PROBLEM = 'relatable_problem',
  VISUAL_SHOCK = 'visual_shock',
  SOCIAL_PROOF = 'social_proof',
  OTHER = 'other',
}

export interface SceneCaption {
  text: string;
  position: 'top' | 'center' | 'bottom';
  style?: string;
  startTime?: number;
  endTime?: number;
}

export interface Scene {
  sceneIndex: number;
  timestamp: string;
  startTimeSeconds?: number;
  duration: number;
  purpose: string;
  hookType?: HookType;
  visualDetails: {
    cameraAngle?: string;
    movement?: string;
    lighting?: string;
    colorPalette?: string;
    onScreenElements?: string;
  };
  cinematicDetails: {
    shotType?: string;
    pacing?: string;
    style?: string;
    cutCount?: number;
  };
  audioDetails: {
    dialogue?: string;
    soundDesign?: string;
    timing?: string;
  };
  captions?: SceneCaption[];
}

export interface AnalysisStructuredData {
  scenes: Scene[];
  hook?: {
    type: HookType;
    text: string;
    durationSeconds: number;
  };
  overallAesthetic?: string;
  dominantColors?: string[];
  pacing?: string;
  audioStyle?: string;
  musicStyle?: string;
  captionStyle?: {
    fontFamily?: string;
    textColor?: string;
    backgroundStyle?: string;
    position?: 'top' | 'center' | 'bottom';
    animation?: string;
  };
  recommendedAspectRatio?: '9:16' | '16:9' | '1:1';
  totalDurationSeconds?: number;
  cutCount?: number;
  averageShotDurationSeconds?: number;
}

export interface VideoAnalysis {
  analysisId: string;
  analyzedAt: string;
  status: AnalysisStatus;
  sceneBreakdown: string;
  structuredData?: AnalysisStructuredData;
  userEdits?: string;
  error?: {
    code: string;
    message: string;
    timestamp: string;
  };
}

// Product types
export interface ProductInformation {
  productName: string;
  productDescription: string;
  productImageS3Key?: string;
  productImageMimeType?: string;
  addedAt: string;
  downloadUrl?: string;
}

// Prompt variant types
export enum ModerationStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  FLAGGED = 'flagged',
  BYPASSED = 'bypassed',
}

export interface ScenePrompt {
  sceneIndex: number;
  purpose: string;
  durationSeconds: number;
  text: string;
}

export interface GenerationPromptVariant {
  variantId: string;
  hookLabel: string;
  hookType: HookType;
  scenePrompts: ScenePrompt[];
  summaryText: string;
  userEditedSummaryText?: string;
  finalSummaryText: string;
  characterCount: number;
  generatedAt: string;
  approvedAt?: string;
  moderationStatus: ModerationStatus;
  moderationFlags?: string[];
}

// Generation types
export enum GenerationStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETE = 'complete',
  FAILED = 'failed',
}

export interface SceneClipStatus {
  sceneIndex: number;
  purpose: string;
  status: GenerationStatus;
  error?: string;
}

export interface GeneratedVideoVariant {
  variantId: string;
  promptVariantId: string;
  hookLabel: string;
  s3Key: string;
  s3Bucket: string;
  fileName: string;
  fileSize?: number;
  mimeType: string;
  status: GenerationStatus;
  sceneClips: SceneClipStatus[];
  initiatedAt: string;
  completedAt?: string;
  downloadUrl?: string;
  error?: {
    code: string;
    message: string;
    timestamp: string;
    retryable: boolean;
  };
}

// API Request/Response types
export interface UploadVideoRequest {
  fileName: string;
  fileSize: number;
  mimeType: string;
}

export interface UploadVideoResponse {
  uploadUrl: string;
  uploadFields: Record<string, string>;
  s3Key: string;
}

export interface UploadProductImageRequest {
  fileName: string;
  fileSize: number;
  mimeType: string;
}

export interface SubmitProductInfoRequest {
  productName: string;
  productDescription: string;
}

export interface UpdateAnalysisRequest {
  editedText: string;
}

export interface UpdatePromptRequest {
  editedText: string;
}
