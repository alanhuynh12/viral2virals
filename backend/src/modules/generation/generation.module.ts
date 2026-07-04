import { Module } from '@nestjs/common';
import { GenerationController } from './generation.controller';
import { GenerationService } from './generation.service';
import { VeoService } from './veo.service';
import { VideoStitchingService } from './video-stitching.service';
import { StorageModule } from '../storage/storage.module';

/**
 * GenerationModule handles video generation operations (Google Veo 3/3.1)
 */
@Module({
  imports: [StorageModule],
  controllers: [GenerationController],
  providers: [GenerationService, VeoService, VideoStitchingService],
  exports: [GenerationService],
})
export class GenerationModule {}
