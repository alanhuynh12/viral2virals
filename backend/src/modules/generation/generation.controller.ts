import {
  Controller,
  Post,
  Get,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { GenerationService } from './generation.service';
import { GenerateVideoResponseDto } from './dto/generate-video-response.dto';
import { GetVideoStatusResponseDto } from './dto/get-video-status-response.dto';
import { v4 as uuidv4 } from 'uuid';

/**
 * GenerationController handles video generation endpoints
 */
@Controller('sessions/:sessionId')
export class GenerationController {
  constructor(private readonly generationService: GenerationService) {}

  /**
   * POST /sessions/:sessionId/generate
   * Batch-generate multi-clip Veo videos for every approved prompt variant
   */
  @Post('generate')
  @HttpCode(HttpStatus.ACCEPTED)
  async generateVideos(
    @Param('sessionId') sessionId: string,
  ): Promise<GenerateVideoResponseDto> {
    const generatedVideos =
      await this.generationService.generateVideos(sessionId);

    return {
      success: true,
      data: generatedVideos,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: `req_${uuidv4()}`,
      },
    };
  }

  /**
   * GET /sessions/:sessionId/generate
   * Get video generation status (and download URLs when complete) for every variant
   */
  @Get('generate')
  async getVideoStatus(
    @Param('sessionId') sessionId: string,
  ): Promise<GetVideoStatusResponseDto> {
    const generatedVideos =
      await this.generationService.getVideoStatus(sessionId);

    return {
      success: true,
      data: generatedVideos,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: `req_${uuidv4()}`,
      },
    };
  }
}
