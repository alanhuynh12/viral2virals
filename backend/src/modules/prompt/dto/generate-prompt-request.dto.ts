/**
 * Generate Prompt (Variants) Request DTO
 *
 * Validation for batch prompt variant generation requests
 */

import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Request body for POST /sessions/:sessionId/prompt/variants
 */
export class GeneratePromptRequestDto {
  /**
   * Number of distinct hook/prompt variants to generate.
   * Optional - defaults to the server's DEFAULT_VARIANT_COUNT.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(6)
  count?: number;
}
