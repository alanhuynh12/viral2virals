/**
 * Update Prompt Request DTO
 *
 * Validation for prompt update requests
 */

import { IsString, IsNotEmpty, Length } from 'class-validator';

/**
 * Request body for PATCH /sessions/:sessionId/prompt/variants/:variantId
 */
export class UpdatePromptRequestDto {
  /**
   * User's edited prompt variant text (JSON array of per-scene prompts, or free text)
   * Must be between 1 and 10000 characters
   */
  @IsString()
  @IsNotEmpty({ message: 'Edited text is required' })
  @Length(1, 10000, {
    message: 'Prompt must be between 1 and 10000 characters',
  })
  editedText!: string;
}
