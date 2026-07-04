/**
 * Generate Prompt Response DTO
 *
 * Response for prompt variant batch generation endpoint
 */

import { GenerationPromptVariant } from '../../../common/types/prompt.types';

/**
 * Response for POST /sessions/:sessionId/prompt/variants
 */
export interface GeneratePromptResponseDto {
  success: boolean;
  data: GenerationPromptVariant[];
  meta: {
    timestamp: string;
    requestId: string;
  };
}
