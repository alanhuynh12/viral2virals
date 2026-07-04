import { Controller, Get } from '@nestjs/common';

/**
 * Simple health check endpoint used by deployment platforms
 * (Railway, Render, Fly.io, load balancers, etc.) to verify the
 * backend process is up and responding.
 */
@Controller('health')
export class HealthController {
  @Get()
  check(): { status: string; timestamp: string } {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
