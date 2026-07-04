import { GeneratedVideoVariant } from '../../../common/types/generation.types';

/**
 * DTO for batch video generation initiation response
 */
export class GenerateVideoResponseDto {
  success!: boolean;
  data!: GeneratedVideoVariant[];
  meta!: {
    timestamp: string;
    requestId: string;
  };
}
