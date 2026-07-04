/**
 * Configuration Module
 *
 * Loads and validates environment variables for the application.
 * Provides type-safe access to configuration values.
 */

export interface Configuration {
  // Server
  port: number;
  nodeEnv: string;

  // AWS S3
  aws: {
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    s3Bucket: string;
  };

  // Google Gemini (video understanding / analysis)
  gemini: {
    apiKey: string;
    model: string;
    /** When true, skip the real Gemini video-understanding call and return a fixture analysis (for local/dev testing without cost) */
    mock: boolean;
  };

  // Google Veo (video generation)
  veo: {
    apiKey: string;
    model: string;
    aspectRatio: string;
    resolution: string;
    /** When true, skip real Veo API calls and synthesize placeholder clips with ffmpeg (for local/dev testing without cost) */
    mock: boolean;
  };

  // OpenAI via laozhang.ai (used only for text prompt engineering, not video generation)
  openai: {
    apiKey: string;
    baseUrl: string;
    gptModel: string;
  };

  // CORS
  cors: {
    origin: string;
  };

  // Batch generation
  generation: {
    /** Default number of hook/prompt variants generated per batch */
    defaultVariantCount: number;
    /** Max scene clips allowed per variant, to bound cost/latency */
    maxScenesPerVariant: number;
  };
}

/**
 * Load configuration from environment variables
 */
export const loadConfiguration = (): Configuration => {
  const geminiApiKey =
    process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY || '';

  return {
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',

    aws: {
      region: process.env.AWS_REGION || 'us-east-1',
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      s3Bucket: process.env.AWS_S3_BUCKET || '',
    },

    gemini: {
      apiKey: geminiApiKey,
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      mock: (process.env.MOCK_ANALYSIS || '').toLowerCase() === 'true',
    },

    veo: {
      // Veo is served through the same Gemini API, so it reuses the Gemini key by default
      apiKey: process.env.VEO_API_KEY || geminiApiKey,
      model: process.env.VEO_MODEL || 'veo-3.1-fast-generate-preview',
      aspectRatio: process.env.VEO_ASPECT_RATIO || '9:16',
      resolution: process.env.VEO_RESOLUTION || '720p',
      mock: (process.env.MOCK_VIDEO_GENERATION || '').toLowerCase() === 'true',
    },

    openai: {
      apiKey: process.env.LAOZHANG_API_KEY || process.env.OPENAI_API_KEY || '',
      baseUrl:
        process.env.LAOZHANG_API_BASE_URL ||
        process.env.OPENAI_API_BASE_URL ||
        'https://api.laozhang.ai/v1',
      gptModel: process.env.OPENAI_GPT_MODEL || 'gpt-5',
    },

    cors: {
      origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    },

    generation: {
      defaultVariantCount: parseInt(
        process.env.DEFAULT_VARIANT_COUNT || '3',
        10,
      ),
      maxScenesPerVariant: parseInt(
        process.env.MAX_SCENES_PER_VARIANT || '6',
        10,
      ),
    },
  };
};

/**
 * Validate that required configuration values are present
 * For Phase 3 (User Story 1), only AWS and Gemini are required
 * @throws Error if required values are missing
 */
export const validateConfiguration = (config: Configuration): void => {
  const requiredFields = [
    { key: 'AWS_REGION', value: config.aws.region },
    { key: 'AWS_ACCESS_KEY_ID', value: config.aws.accessKeyId },
    { key: 'AWS_SECRET_ACCESS_KEY', value: config.aws.secretAccessKey },
    { key: 'AWS_S3_BUCKET', value: config.aws.s3Bucket },
    {
      key: 'GEMINI_API_KEY or GOOGLE_GEMINI_API_KEY',
      value: config.gemini.apiKey,
    },
    // VEO_API_KEY falls back to the Gemini key; OPENAI/LAOZHANG key only needed for prompt text generation
  ];

  const missingFields = requiredFields
    .filter((field) => !field.value)
    .map((field) => field.key);

  if (missingFields.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingFields.join(', ')}`,
    );
  }
};
