import { GeneratedVideoVariant } from '../../../common/types/generation.types';

/**
 * DTO for batch video generation status polling response
 */
export class GetVideoStatusResponseDto {
  success!: boolean;
  data!: GeneratedVideoVariant[];
  meta!: {
    timestamp: string;
    requestId: string;
  };
}
