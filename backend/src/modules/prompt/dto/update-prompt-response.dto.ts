/**
 * Update Prompt Response DTO
 *
 * Response for prompt variant update endpoint
 */

import { GenerationPromptVariant } from '../../../common/types/prompt.types';

/**
 * Response for PATCH /sessions/:sessionId/prompt/variants/:variantId
 */
export interface UpdatePromptResponseDto {
  success: boolean;
  data: GenerationPromptVariant;
  meta: {
    timestamp: string;
    requestId: string;
  };
}
