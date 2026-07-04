/**
 * Approve Prompt Response DTO
 *
 * Response for prompt variant approval endpoint
 */

import { GenerationPromptVariant } from '../../../common/types/prompt.types';

/**
 * Response for POST /sessions/:sessionId/prompt/variants/:variantId/approve
 */
export interface ApprovePromptResponseDto {
  success: boolean;
  data: GenerationPromptVariant;
  meta: {
    timestamp: string;
    requestId: string;
  };
}
