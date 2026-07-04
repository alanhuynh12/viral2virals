/**
 * Prompt Controller
 *
 * Handles HTTP endpoints for batch text-to-video prompt variant
 * generation, editing, and approval.
 */

import {
  Controller,
  Post,
  Patch,
  Get,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { PromptService } from './prompt.service';
import { GeneratePromptRequestDto } from './dto/generate-prompt-request.dto';
import { UpdatePromptRequestDto } from './dto/update-prompt-request.dto';
import { GeneratePromptResponseDto } from './dto/generate-prompt-response.dto';
import { UpdatePromptResponseDto } from './dto/update-prompt-response.dto';
import { ApprovePromptResponseDto } from './dto/approve-prompt-response.dto';
import { v4 as uuidv4 } from 'uuid';

/**
 * PromptController handles prompt variant generation and management endpoints
 * Base path: /sessions/:sessionId/prompt
 */
@Controller('sessions/:sessionId/prompt')
export class PromptController {
  private readonly logger = new Logger(PromptController.name);

  constructor(private readonly promptService: PromptService) {}

  /**
   * POST /sessions/:sessionId/prompt/variants
   * Generate a batch of hook/prompt variants from video analysis and product info
   *
   * @param sessionId - Session identifier
   * @param dto - Optional variant count
   * @returns Generated prompt variants with moderation status
   */
  @Post('variants')
  @HttpCode(HttpStatus.OK)
  async generatePromptVariants(
    @Param('sessionId') sessionId: string,
    @Body() dto: GeneratePromptRequestDto,
  ): Promise<GeneratePromptResponseDto> {
    this.logger.log(`POST /sessions/${sessionId}/prompt/variants`);

    const variants = await this.promptService.generatePromptVariants(
      sessionId,
      dto.count,
    );

    return {
      success: true,
      data: variants,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: uuidv4(),
      },
    };
  }

  /**
   * GET /sessions/:sessionId/prompt/variants
   * Retrieve the currently stored prompt variants (for polling/refresh)
   */
  @Get('variants')
  @HttpCode(HttpStatus.OK)
  async getPromptVariants(
    @Param('sessionId') sessionId: string,
  ): Promise<GeneratePromptResponseDto> {
    const variants = await this.promptService.getPromptVariants(sessionId);

    return {
      success: true,
      data: variants,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: uuidv4(),
      },
    };
  }

  /**
   * PATCH /sessions/:sessionId/prompt/variants/:variantId
   * Update a single prompt variant with user edits
   */
  @Patch('variants/:variantId')
  @HttpCode(HttpStatus.OK)
  async updatePromptVariant(
    @Param('sessionId') sessionId: string,
    @Param('variantId') variantId: string,
    @Body() dto: UpdatePromptRequestDto,
  ): Promise<UpdatePromptResponseDto> {
    this.logger.log(
      `PATCH /sessions/${sessionId}/prompt/variants/${variantId}`,
    );

    const variant = await this.promptService.updatePromptVariant(
      sessionId,
      variantId,
      dto.editedText,
    );

    return {
      success: true,
      data: variant,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: uuidv4(),
      },
    };
  }

  /**
   * POST /sessions/:sessionId/prompt/variants/:variantId/approve
   * Approve a single prompt variant for video generation
   */
  @Post('variants/:variantId/approve')
  @HttpCode(HttpStatus.OK)
  async approvePromptVariant(
    @Param('sessionId') sessionId: string,
    @Param('variantId') variantId: string,
  ): Promise<ApprovePromptResponseDto> {
    this.logger.log(
      `POST /sessions/${sessionId}/prompt/variants/${variantId}/approve`,
    );

    const variant = await this.promptService.approvePromptVariant(
      sessionId,
      variantId,
    );

    return {
      success: true,
      data: variant,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: uuidv4(),
      },
    };
  }
}
