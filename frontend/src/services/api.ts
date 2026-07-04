/**
 * API Client Service
 *
 * Centralized HTTP client for backend API communication.
 * Provides base configuration and error handling.
 */

import axios, { AxiosInstance, AxiosError, AxiosProgressEvent } from 'axios';
import {
  AnalysisStructuredData,
  GenerationPromptVariant,
  GeneratedVideoVariant,
} from '../types';

/**
 * API response wrapper
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
  meta: {
    timestamp: string;
    requestId: string;
  };
}

/**
 * API Client class
 */
class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api',
      timeout: 120000, // 120 seconds - allows for long-running AI operations
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response) {
          // Server responded with error status
          console.error('API Error:', error.response.data);
        } else if (error.request) {
          // No response received
          console.error('Network Error:', error.message);
        } else {
          // Request setup error
          console.error('Request Error:', error.message);
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * GET request
   */
  async get<T>(url: string): Promise<ApiResponse<T>> {
    const response = await this.client.get<ApiResponse<T>>(url);
    return response.data;
  }

  /**
   * POST request
   */
  async post<T>(url: string, data?: unknown): Promise<ApiResponse<T>> {
    const response = await this.client.post<ApiResponse<T>>(url, data);
    return response.data;
  }

  /**
   * PATCH request
   */
  async patch<T>(url: string, data?: unknown): Promise<ApiResponse<T>> {
    const response = await this.client.patch<ApiResponse<T>>(url, data);
    return response.data;
  }

  /**
   * PUT request for file upload
   */
  async put(url: string, data: Blob, contentType: string): Promise<void> {
    await axios.put(url, data, {
      headers: {
        'Content-Type': contentType,
      },
    });
  }

  /**
   * Upload file to presigned URL using native fetch for better S3 compatibility
   */
  async uploadFile(
    presignedUrl: string,
    file: File,
    onProgress?: (progress: number) => void
  ): Promise<void> {
    // Use XMLHttpRequest for progress tracking with fetch-like behavior
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      // Track upload progress
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && onProgress) {
          const progress = (e.loaded / e.total) * 100;
          onProgress(Math.round(progress));
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('Upload failed'));
      });

      xhr.addEventListener('abort', () => {
        reject(new Error('Upload aborted'));
      });

      // Open PUT request to presigned URL
      xhr.open('PUT', presignedUrl);

      // Set Content-Type header - this is part of the presigned URL signature
      xhr.setRequestHeader('Content-Type', file.type);

      // Send the file
      xhr.send(file);
    });
  }
}

// Export singleton instance
export const api = new ApiClient();

// ============================================================================
// Session API Methods
// ============================================================================

export interface Session {
  sessionId: string;
  createdAt: string;
  lastActivityAt: string;
  status: string;
}

/**
 * Create a new session
 */
export async function createSession(): Promise<Session> {
  const response = await api.post<{ sessionId: string; session: Session }>(
    '/sessions'
  );

  if (!response.data) {
    throw new Error('Failed to create session');
  }

  // Handle double-wrapped response
  const data =
    'data' in response.data && typeof response.data.data === 'object'
      ? (response.data.data as { sessionId: string; session: Session })
      : response.data;

  return data.session;
}

// ============================================================================
// Video API Methods
// ============================================================================

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

/**
 * Upload video file to backend (which proxies to S3)
 */
export async function uploadVideo(
  sessionId: string,
  file: File,
  onProgress?: (progress: number) => void
): Promise<void> {
  const formData = new FormData();
  formData.append('video', file);

  await axios.post(
    `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api'}/sessions/${sessionId}/video/upload`,
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const progress = (progressEvent.loaded / progressEvent.total) * 100;
          onProgress(Math.round(progress));
        }
      },
    }
  );
}

// ============================================================================
// Analysis API Methods
// ============================================================================

export interface VideoAnalysis {
  analysisId: string;
  analyzedAt: string;
  status: 'pending' | 'processing' | 'complete' | 'failed';
  sceneBreakdown: string;
  structuredData?: AnalysisStructuredData;
  userEdits?: string;
  error?: {
    code: string;
    message: string;
    timestamp: string;
  };
}

/**
 * Trigger video analysis
 */
export async function triggerAnalysis(
  sessionId: string
): Promise<{ analysisId: string; status: string }> {
  const response = await api.post<{ analysisId: string; status: string }>(
    `/sessions/${sessionId}/analysis`
  );

  if (!response.data) {
    throw new Error('Failed to trigger analysis');
  }

  // Handle double-wrapped response
  const data =
    'data' in response.data && typeof response.data.data === 'object'
      ? (response.data.data as { analysisId: string; status: string })
      : response.data;

  return data;
}

/**
 * Get analysis status and results (for polling)
 */
export async function getAnalysisStatus(
  sessionId: string
): Promise<VideoAnalysis> {
  const response = await api.get<VideoAnalysis>(
    `/sessions/${sessionId}/analysis`
  );

  if (!response.data) {
    throw new Error('Failed to get analysis status');
  }

  // Handle double-wrapped response
  const data =
    'data' in response.data && typeof response.data.data === 'object'
      ? (response.data.data as VideoAnalysis)
      : response.data;

  return data;
}

/**
 * Update analysis with user edits
 */
export async function updateAnalysis(
  sessionId: string,
  editedText: string
): Promise<VideoAnalysis> {
  const response = await api.patch<VideoAnalysis>(
    `/sessions/${sessionId}/analysis`,
    { editedText }
  );

  if (!response.data) {
    throw new Error('Failed to update analysis');
  }

  // Handle double-wrapped response
  const data =
    'data' in response.data && typeof response.data.data === 'object'
      ? (response.data.data as VideoAnalysis)
      : response.data;

  return data;
}

// ============================================================================
// Product API Methods
// ============================================================================

export interface ProductInformation {
  productName: string;
  productDescription: string;
}

export interface SubmitProductInfoResponse {
  sessionId: string;
  productName: string;
  productDescription: string;
  status: string;
}

/**
 * Submit product information
 */
export async function submitProductInfo(
  sessionId: string,
  productName: string,
  productDescription: string
): Promise<SubmitProductInfoResponse> {
  const response = await api.post<SubmitProductInfoResponse>(
    `/sessions/${sessionId}/product`,
    { productName, productDescription }
  );

  if (!response.data) {
    throw new Error('Failed to submit product information');
  }

  // Handle double-wrapped response
  const data =
    'data' in response.data && typeof response.data.data === 'object'
      ? (response.data.data as SubmitProductInfoResponse)
      : response.data;

  return data;
}

// ============================================================================
// Prompt Variant API Methods
// ============================================================================

/**
 * Generate a batch of hook/prompt variants from analysis and product info
 */
export async function generatePromptVariants(
  sessionId: string,
  count?: number
): Promise<GenerationPromptVariant[]> {
  const response = await api.post<GenerationPromptVariant[]>(
    `/sessions/${sessionId}/prompt/variants`,
    count ? { count } : {}
  );

  if (!response.data) {
    throw new Error('Failed to generate prompt variants');
  }

  // Handle double-wrapped response
  const data =
    'data' in response.data && typeof response.data.data === 'object'
      ? (response.data.data as unknown as GenerationPromptVariant[])
      : (response.data as unknown as GenerationPromptVariant[]);

  return data;
}

/**
 * Update a single prompt variant with user edits
 */
export async function updatePromptVariant(
  sessionId: string,
  variantId: string,
  editedText: string
): Promise<GenerationPromptVariant> {
  const response = await api.patch<GenerationPromptVariant>(
    `/sessions/${sessionId}/prompt/variants/${variantId}`,
    { editedText }
  );

  if (!response.data) {
    throw new Error('Failed to update prompt variant');
  }

  const data =
    'data' in response.data && typeof response.data.data === 'object'
      ? (response.data.data as GenerationPromptVariant)
      : response.data;

  return data;
}

/**
 * Approve a single prompt variant for video generation
 */
export async function approvePromptVariant(
  sessionId: string,
  variantId: string
): Promise<GenerationPromptVariant> {
  const response = await api.post<GenerationPromptVariant>(
    `/sessions/${sessionId}/prompt/variants/${variantId}/approve`
  );

  if (!response.data) {
    throw new Error('Failed to approve prompt variant');
  }

  const data =
    'data' in response.data && typeof response.data.data === 'object'
      ? (response.data.data as GenerationPromptVariant)
      : response.data;

  return data;
}

// ============================================================================
// Product Image Upload API Methods
// ============================================================================

export interface UploadProductImageRequest {
  fileName: string;
  fileSize: number;
  mimeType: string;
}

export interface UploadProductImageResponse {
  uploadUrl: string;
  uploadFields: Record<string, string>;
  s3Key: string;
}

/**
 * Upload product image file directly to backend (bypasses S3 CORS)
 */
export async function uploadProductImage(
  sessionId: string,
  file: File,
  onProgress?: (progress: number) => void
): Promise<void> {
  // Create form data for multipart upload
  const formData = new FormData();
  formData.append('image', file);

  const baseURL =
    import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

  // Upload directly to backend using axios for progress tracking
  await axios.post(
    `${baseURL}/sessions/${sessionId}/product/image/upload`,
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent: AxiosProgressEvent) => {
        if (onProgress && progressEvent.total) {
          const progress = (progressEvent.loaded / progressEvent.total) * 100;
          onProgress(Math.round(progress));
        }
      },
    }
  );
}

// ============================================================================
// Video Generation API Methods (Google Veo 3 / 3.1, batch multi-clip)
// ============================================================================

/**
 * Batch-generate multi-clip Veo videos for every approved prompt variant
 */
export async function generateVideos(
  sessionId: string
): Promise<GeneratedVideoVariant[]> {
  const response = await api.post<GeneratedVideoVariant[]>(
    `/sessions/${sessionId}/generate`
  );

  if (!response.data) {
    throw new Error('Failed to start video generation');
  }

  // Handle double-wrapped response
  const data =
    'data' in response.data && typeof response.data.data === 'object'
      ? (response.data.data as unknown as GeneratedVideoVariant[])
      : (response.data as unknown as GeneratedVideoVariant[]);

  return data;
}

/**
 * Get video generation status for every variant (for polling)
 */
export async function getVideoStatuses(
  sessionId: string
): Promise<GeneratedVideoVariant[]> {
  const response = await api.get<GeneratedVideoVariant[]>(
    `/sessions/${sessionId}/generate`
  );

  if (!response.data) {
    throw new Error('Failed to get video status');
  }

  // Handle double-wrapped response
  const data =
    'data' in response.data && typeof response.data.data === 'object'
      ? (response.data.data as unknown as GeneratedVideoVariant[])
      : (response.data as unknown as GeneratedVideoVariant[]);

  return data;
}
