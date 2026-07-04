/**
 * Prompt Service
 *
 * Generates a batch of candidate hook/prompt "variants" using GPT-5,
 * each carrying its own set of per-scene Veo prompts so a fast-paced,
 * multi-cut video can later be assembled scene-by-scene (see
 * GenerationService) instead of relying on a single monolithic prompt.
 */

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { SessionService } from '../../common/session.service';
import {
  GenerationPromptVariant,
  ModerationStatus,
  ScenePrompt,
} from '../../common/types/prompt.types';
import {
  AnalysisStructuredData,
  HookType,
} from '../../common/types/analysis.types';
import { SessionStatus } from '../../common/types/session.types';
import { loadConfiguration } from '../../config/configuration';
import { extractJsonObject } from '../../common/utils/scene-analysis.util';

const HOOK_TYPES = Object.values(HookType).filter((h) => h !== HookType.OTHER);

/**
 * PromptService generates and manages batches of text-to-video prompt variants
 */
@Injectable()
export class PromptService {
  private readonly logger = new Logger(PromptService.name);
  private readonly httpClient: AxiosInstance;
  private readonly gptModel: string;
  private readonly defaultVariantCount: number;
  private readonly maxScenesPerVariant: number;

  // Basic moderation patterns (simple keyword matching for POC)
  private readonly moderationPatterns = [
    /\b(violence|violent|kill|death|blood|gore)\b/i,
    /\b(explicit|sexual|nude|nudity|porn)\b/i,
    /\b(hate|racist|discrimination|offensive)\b/i,
    /\b(illegal|drugs|weapon|bomb)\b/i,
  ];

  private readonly moderationCategories = [
    'violence',
    'sexual-content',
    'hate-speech',
    'illegal-content',
  ];

  constructor(private readonly sessionService: SessionService) {
    const config = loadConfiguration();
    const apiKey = config.openai.apiKey;
    const baseUrl = config.openai.baseUrl;
    this.gptModel = config.openai.gptModel;
    this.defaultVariantCount = config.generation.defaultVariantCount;
    this.maxScenesPerVariant = config.generation.maxScenesPerVariant;

    if (!apiKey) {
      throw new Error(
        'OPENAI_API_KEY or LAOZHANG_API_KEY environment variable is required',
      );
    }

    this.httpClient = axios.create({
      baseURL: baseUrl,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      timeout: 120000, // 120 second timeout for GPT-5 (prompt generation can be slow)
    });
  }

  /**
   * Generate a batch of hook/prompt variants using GPT-5, combining video
   * analysis and product information. Each variant gets its own hook
   * angle and a full set of per-scene Veo prompts.
   *
   * @param sessionId - The session ID
   * @param count - Number of distinct hook variants to generate
   * @returns Generated prompt variants with moderation status
   */
  async generatePromptVariants(
    sessionId: string,
    count?: number,
  ): Promise<GenerationPromptVariant[]> {
    const variantCount = Math.max(
      1,
      Math.min(count ?? this.defaultVariantCount, HOOK_TYPES.length),
    );

    this.logger.log(
      `Generating ${variantCount} prompt variants for session ${sessionId}`,
    );

    const session = this.sessionService.getSession(sessionId);
    if (!session) {
      throw new BadRequestException('Session not found');
    }

    if (!session.videoAnalysis) {
      throw new BadRequestException(
        'Video analysis not complete. Please analyze video first.',
      );
    }

    if (session.videoAnalysis.status !== 'complete') {
      throw new BadRequestException(
        'Video analysis is not complete. Please wait for analysis to finish.',
      );
    }

    if (!session.productInformation) {
      throw new BadRequestException(
        'Product information not provided. Please submit product details first.',
      );
    }

    const structuredData = this.resolveStructuredData(
      session.videoAnalysis.structuredData,
      session.videoAnalysis.userEdits || session.videoAnalysis.sceneBreakdown,
    );

    const productName = session.productInformation.productName;
    const productDescription = session.productInformation.productDescription;

    try {
      const userMessage = this.buildVariantGenerationPrompt(
        structuredData,
        productName,
        productDescription,
        variantCount,
      );

      const response = await this.httpClient.post('/chat/completions', {
        model: this.gptModel,
        messages: [{ role: 'user', content: userMessage }],
        temperature: 0.9,
        max_tokens: 6000,
      });

      const generatedText =
        response.data.choices[0]?.message?.content?.trim() || '';

      if (!generatedText) {
        this.logger.error(
          `Empty response from GPT-5. Response data: ${JSON.stringify(response.data)}`,
        );
        throw new Error(
          'GPT-5 returned an empty response. This may be due to content filtering or API issues.',
        );
      }

      const variants = this.parseVariantsResponse(
        generatedText,
        structuredData,
      );

      if (variants.length === 0) {
        throw new Error(
          'GPT-5 response did not contain any usable prompt variants',
        );
      }

      session.promptVariants = variants;
      session.status = SessionStatus.PROMPT_GENERATED;
      session.lastActivityAt = new Date();
      this.sessionService.updateSession(sessionId, session);

      this.logger.log(
        `Generated ${variants.length} prompt variants for session ${sessionId}`,
      );

      return variants;
    } catch (error) {
      this.logger.error(
        `Failed to generate prompt variants for session ${sessionId}`,
        error,
      );

      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const message = error.response?.data?.error?.message || error.message;

        if (
          error.code === 'ECONNABORTED' ||
          error.message.includes('timeout')
        ) {
          throw new BadRequestException(
            'Prompt generation timed out. The AI service is taking longer than expected. Please try again.',
          );
        } else if (status === 401) {
          throw new BadRequestException(
            'Invalid API key for prompt generation',
          );
        } else if (status === 429) {
          throw new BadRequestException(
            'Rate limit exceeded. Please try again later.',
          );
        } else {
          throw new BadRequestException(
            `Failed to generate prompt variants: ${message}`,
          );
        }
      }

      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : 'Failed to generate prompt variants. Please try again.',
      );
    }
  }

  /**
   * Update an existing prompt variant with user edits
   */
  async updatePromptVariant(
    sessionId: string,
    variantId: string,
    editedText: string,
  ): Promise<GenerationPromptVariant> {
    this.logger.log(
      `Updating prompt variant ${variantId} for session ${sessionId}`,
    );

    const session = this.sessionService.getSession(sessionId);
    if (!session) {
      throw new BadRequestException('Session not found');
    }

    const variant = session.promptVariants?.find(
      (v) => v.variantId === variantId,
    );
    if (!variant) {
      throw new BadRequestException(
        'Prompt variant not found. Please generate prompt variants first.',
      );
    }

    const moderation = this.moderateContent(editedText);

    // Best-effort: if the user edited valid JSON matching the scenePrompts
    // shape, use it to update the actual generation payload too. Otherwise
    // keep the previous scenePrompts but still record the edited text.
    const reparsed = this.tryParseScenePrompts(editedText);
    if (reparsed) {
      variant.scenePrompts = reparsed;
    }

    variant.userEditedSummaryText = editedText;
    variant.finalSummaryText = editedText;
    variant.characterCount = editedText.length;
    variant.moderationStatus = moderation.status;
    variant.moderationFlags = moderation.flags;
    variant.approvedAt = undefined;

    session.lastActivityAt = new Date();
    this.sessionService.updateSession(sessionId, session);

    return variant;
  }

  /**
   * Approve a prompt variant for video generation
   */
  async approvePromptVariant(
    sessionId: string,
    variantId: string,
  ): Promise<GenerationPromptVariant> {
    this.logger.log(
      `Approving prompt variant ${variantId} for session ${sessionId}`,
    );

    const session = this.sessionService.getSession(sessionId);
    if (!session) {
      throw new BadRequestException('Session not found');
    }

    const variant = session.promptVariants?.find(
      (v) => v.variantId === variantId,
    );
    if (!variant) {
      throw new BadRequestException(
        'Prompt variant not found. Please generate prompt variants first.',
      );
    }

    variant.approvedAt = new Date();

    if (variant.moderationStatus === ModerationStatus.FLAGGED) {
      variant.moderationStatus = ModerationStatus.BYPASSED;
    } else if (variant.moderationStatus === ModerationStatus.PENDING) {
      variant.moderationStatus = ModerationStatus.APPROVED;
    }

    session.lastActivityAt = new Date();
    this.sessionService.updateSession(sessionId, session);

    return variant;
  }

  /**
   * Get the currently stored prompt variants for a session
   */
  async getPromptVariants(
    sessionId: string,
  ): Promise<GenerationPromptVariant[]> {
    const session = this.sessionService.getSession(sessionId);
    if (!session) {
      throw new BadRequestException('Session not found');
    }
    return session.promptVariants || [];
  }

  /**
   * Fall back to a single synthetic "solution" scene built from free text
   * when the analysis could not be parsed into structured scenes (e.g. the
   * user replaced the JSON with plain prose). This keeps the pipeline
   * functional even for unstructured/legacy analysis text.
   */
  private resolveStructuredData(
    structuredData: AnalysisStructuredData | undefined,
    fallbackText: string,
  ): AnalysisStructuredData {
    if (structuredData && structuredData.scenes.length > 0) {
      return structuredData;
    }

    return {
      scenes: [
        {
          sceneIndex: 0,
          timestamp: '0:00-0:08',
          duration: 8,
          purpose:
            'solution' as AnalysisStructuredData['scenes'][number]['purpose'],
          visualDetails: {},
          cinematicDetails: {},
          audioDetails: { dialogue: fallbackText.slice(0, 500) },
        },
      ],
      recommendedAspectRatio: '9:16',
      totalDurationSeconds: 8,
      cutCount: 1,
    };
  }

  private buildVariantGenerationPrompt(
    structuredData: AnalysisStructuredData,
    productName: string,
    productDescription: string,
    variantCount: number,
  ): string {
    const scenes = structuredData.scenes.slice(0, this.maxScenesPerVariant);
    const hookTypeOptions = HOOK_TYPES.join(', ');

    return `You are an expert short-form video ad strategist and Veo 3 prompt engineer. You specialize in recreating fast-paced, TikTok/Instagram-Reels-style UGC ads.

Below is a structured scene-by-scene breakdown of an existing viral UGC video:
${JSON.stringify({ scenes, hook: structuredData.hook, pacing: structuredData.pacing, musicStyle: structuredData.musicStyle, captionStyle: structuredData.captionStyle, recommendedAspectRatio: structuredData.recommendedAspectRatio }, null, 2)}

Your task: generate ${variantCount} DISTINCT creative variants that recreate this video's structure and pacing for a new product: "${productName}" - ${productDescription}.

Each variant must use a DIFFERENT hook angle from this list: ${hookTypeOptions}.

For each variant, produce one Veo-ready text prompt PER SCENE (same number of scenes and same order as the source breakdown above). Each per-scene prompt must be a complete, self-contained Veo 3 prompt following this structure:
"[Camera shot type + lens/framing]. [Subject + action, describing the product ${productName} instead of the original product]. Style: [visual aesthetic]. Camera movement: [specific movement]. Ambiance: [lighting/color]. Dialogue: "[exact adapted line in quotes]" (tone). Sound: [music/SFX description]."

Rules:
- Keep dialogue punchy and short enough to fit naturally within the scene's duration.
- Scene 0 (the hook) must open with a strong pattern interrupt appropriate to the variant's hookType within the first 1-2 seconds.
- Keep visual continuity between scenes within a variant (same presenter/setting style, consistent product appearance).
- Do not mention the original product/brand - only ${productName}.
- durationSeconds per scene must be 4, 6, or 8 (snap the source scene's duration to the closest of these values).

Respond with ONLY a valid JSON object (no markdown fences, no commentary) matching exactly this shape:
{
  "variants": [
    {
      "hookLabel": "short human-readable label, e.g. Bold Claim Hook",
      "hookType": "one of: ${hookTypeOptions}",
      "scenePrompts": [
        { "sceneIndex": 0, "purpose": "hook", "durationSeconds": 4, "text": "..." }
      ]
    }
  ]
}`;
  }

  /**
   * Parse GPT-5's JSON response into normalized GenerationPromptVariant objects.
   */
  private parseVariantsResponse(
    responseText: string,
    structuredData: AnalysisStructuredData,
  ): GenerationPromptVariant[] {
    const jsonText = extractJsonObject(responseText);
    if (!jsonText) {
      return [];
    }

    let parsed: { variants?: unknown[] };
    try {
      parsed = JSON.parse(jsonText) as { variants?: unknown[] };
    } catch (error) {
      this.logger.error('Failed to parse GPT-5 variants JSON', error);
      return [];
    }

    if (!Array.isArray(parsed.variants)) {
      return [];
    }

    const usedHookTypes = new Set<string>();

    return parsed.variants
      .map((raw) => this.normalizeVariant(raw, structuredData, usedHookTypes))
      .filter((v): v is GenerationPromptVariant => v !== null);
  }

  private normalizeVariant(
    raw: unknown,
    structuredData: AnalysisStructuredData,
    usedHookTypes: Set<string>,
  ): GenerationPromptVariant | null {
    const r = (raw ?? {}) as Record<string, unknown>;
    const rawScenePrompts = Array.isArray(r.scenePrompts) ? r.scenePrompts : [];

    if (rawScenePrompts.length === 0) {
      return null;
    }

    const scenePrompts: ScenePrompt[] = rawScenePrompts.map((sp, index) => {
      const s = (sp ?? {}) as Record<string, unknown>;
      const sourceScene = structuredData.scenes[index];
      return {
        sceneIndex: typeof s.sceneIndex === 'number' ? s.sceneIndex : index,
        purpose:
          typeof s.purpose === 'string'
            ? s.purpose
            : (sourceScene?.purpose ?? 'solution'),
        durationSeconds:
          typeof s.durationSeconds === 'number'
            ? s.durationSeconds
            : (sourceScene?.duration ?? 8),
        text: typeof s.text === 'string' ? s.text : '',
      };
    });

    let hookType = this.coerceHookType(r.hookType);
    // Nudge duplicate hook types apart so variants stay visually distinct
    // even if the model repeats itself.
    if (usedHookTypes.has(hookType)) {
      const alternative = HOOK_TYPES.find((h) => !usedHookTypes.has(h));
      if (alternative) hookType = alternative;
    }
    usedHookTypes.add(hookType);

    const hookLabel =
      typeof r.hookLabel === 'string' && r.hookLabel.trim()
        ? r.hookLabel.trim()
        : this.defaultHookLabel(hookType);

    const summaryText = JSON.stringify(scenePrompts, null, 2);
    const moderationSourceText = scenePrompts.map((sp) => sp.text).join(' ');
    const moderation = this.moderateContent(moderationSourceText);

    return {
      variantId: uuidv4(),
      hookLabel,
      hookType: hookType as HookType,
      scenePrompts,
      summaryText,
      finalSummaryText: summaryText,
      characterCount: summaryText.length,
      generatedAt: new Date(),
      moderationStatus: moderation.status,
      moderationFlags: moderation.flags,
    };
  }

  private coerceHookType(value: unknown): HookType {
    const normalized = String(value ?? '').toLowerCase();
    const match = HOOK_TYPES.find((h) => h === normalized);
    return match ?? HookType.OTHER;
  }

  private defaultHookLabel(hookType: HookType): string {
    const labels: Record<HookType, string> = {
      [HookType.PATTERN_INTERRUPT]: 'Pattern Interrupt Hook',
      [HookType.BOLD_CLAIM]: 'Bold Claim Hook',
      [HookType.QUESTION]: 'Question Hook',
      [HookType.RELATABLE_PROBLEM]: 'Relatable Problem Hook',
      [HookType.VISUAL_SHOCK]: 'Visual Shock Hook',
      [HookType.SOCIAL_PROOF]: 'Social Proof Hook',
      [HookType.OTHER]: 'Alternate Hook',
    };
    return labels[hookType];
  }

  /**
   * Attempt to re-parse a user-edited summary text back into a
   * ScenePrompt[] array. Returns null if the text isn't valid/well-formed.
   */
  private tryParseScenePrompts(text: string): ScenePrompt[] | null {
    try {
      const match = text.match(/\[[\s\S]*\]/);
      if (!match) return null;

      const parsed = JSON.parse(match[0]);
      if (!Array.isArray(parsed) || parsed.length === 0) return null;

      const isValid = parsed.every(
        (item) =>
          item && typeof item === 'object' && typeof item.text === 'string',
      );
      if (!isValid) return null;

      return parsed.map(
        (item: Record<string, unknown>, index: number): ScenePrompt => ({
          sceneIndex:
            typeof item.sceneIndex === 'number' ? item.sceneIndex : index,
          purpose: typeof item.purpose === 'string' ? item.purpose : 'solution',
          durationSeconds:
            typeof item.durationSeconds === 'number' ? item.durationSeconds : 8,
          text: String(item.text),
        }),
      );
    } catch {
      return null;
    }
  }

  /**
   * Basic content moderation using keyword matching
   * This is a simple POC implementation - production would use a proper moderation API
   */
  private moderateContent(text: string): {
    status: ModerationStatus;
    flags: string[];
  } {
    const flags: string[] = [];

    this.moderationPatterns.forEach((pattern, index) => {
      if (pattern.test(text)) {
        flags.push(this.moderationCategories[index]);
      }
    });

    const status =
      flags.length > 0 ? ModerationStatus.FLAGGED : ModerationStatus.PENDING;

    return { status, flags };
  }
}
