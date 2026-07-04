import { Injectable, BadRequestException } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import { S3Service } from '../storage/s3.service';
import { SessionService } from '../../common/session.service';
import {
  VideoAnalysis,
  AnalysisStatus,
} from '../../common/types/analysis.types';
import { SessionStatus } from '../../common/types/session.types';
import { loadConfiguration } from '../../config/configuration';
import { parseSceneAnalysis } from '../../common/utils/scene-analysis.util';
import { v4 as uuidv4 } from 'uuid';

/**
 * The JSON schema we ask Gemini to fill in. Compared to a plain prose
 * breakdown, this captures the specific signals needed to recreate a
 * fast-paced, TikTok/Reels-style UGC ad scene-by-scene: an explicit hook
 * classification, per-scene cut/caption timing, and objective pacing
 * metrics (cut count, average shot length) instead of vague adjectives.
 */
const ANALYSIS_PROMPT = `You are analyzing a short-form UGC (user-generated content) advertisement video so it can be recreated scene-by-scene as a fast-paced, TikTok/Instagram-Reels-style ad using AI video generation tools.

Focus ONLY on the most impactful, engaging moments. Ignore filler, transitions, credits, or non-essential content. Prioritize the opening hook, pattern interrupts, visual impact, on-screen captions, and message clarity - the things that actually drive watch-through and virality on short-form platforms.

Break the video into 3-6 scenes covering: the hook (first 1-3s), problem/relatable setup, solution/product reveal, benefit/proof, and call-to-action. Not every video has all of these - only include scenes that are actually present.

Respond with ONLY a valid JSON object (no markdown fences, no commentary) matching exactly this shape:
{
  "scenes": [
    {
      "sceneIndex": 0,
      "timestamp": "0:00-0:02",
      "startTimeSeconds": 0,
      "duration": 2,
      "purpose": "hook | problem | solution | benefit | cta",
      "hookType": "pattern_interrupt | bold_claim | question | relatable_problem | visual_shock | social_proof | other (only set for the hook scene, omit otherwise)",
      "visualDetails": {
        "cameraAngle": "framing and any dolly/pan/zoom",
        "movement": "subject positioning and action",
        "lighting": "color temperature, intensity, shadows, mood",
        "colorPalette": "primary colors, grading, emotional tone",
        "onScreenElements": "props, graphics, logos visible (not captions - captions go in the captions array)"
      },
      "cinematicDetails": {
        "shotType": "wide | medium | close-up | detail shot",
        "pacing": "speed of action, cut timing description",
        "style": "documentary | cinematic | testimonial | product demo | etc.",
        "cutCount": 1
      },
      "audioDetails": {
        "dialogue": "exact words spoken, tone, emotional delivery",
        "soundDesign": "music genre/energy, ambient sounds, sound effects",
        "timing": "when sounds/beats occur relative to visuals"
      },
      "captions": [
        {
          "text": "exact on-screen caption/text-overlay copy",
          "position": "top | center | bottom",
          "style": "font weight, color, animation, emphasis",
          "startTime": 0,
          "endTime": 2
        }
      ]
    }
  ],
  "hook": {
    "type": "pattern_interrupt | bold_claim | question | relatable_problem | visual_shock | social_proof | other",
    "text": "the exact hook line (spoken or on-screen)",
    "durationSeconds": 2
  },
  "overallAesthetic": "one sentence describing the overall visual identity",
  "dominantColors": ["color1", "color2"],
  "pacing": "one sentence describing the overall rhythm",
  "audioStyle": "one sentence describing the overall audio identity",
  "musicStyle": "genre/energy of the background music, for sourcing a replacement track",
  "captionStyle": {
    "fontFamily": "sans-serif | serif | handwritten | etc.",
    "textColor": "dominant caption text color",
    "backgroundStyle": "e.g. semi-transparent black box, none, highlighted word-by-word",
    "position": "top | center | bottom",
    "animation": "e.g. pop-in per word, fade, none"
  },
  "recommendedAspectRatio": "9:16",
  "totalDurationSeconds": 8,
  "cutCount": 4,
  "averageShotDurationSeconds": 2
}

IMPORTANT REQUIREMENTS:
- Maintain the original video's core message and visual identity.
- Optimize for maximum virality: emotional impact, pattern interrupts, clarity, and urgency.
- cutCount and averageShotDurationSeconds must be objective counts/averages derived from the scenes you identified, not vague descriptions.
- Respond with ONLY the JSON object described above, without any additional explanation or text outside the JSON object.`;

/**
 * AnalysisService
 *
 * Handles video analysis operations using Google Gemini AI.
 * Provides methods for triggering analysis, checking status,
 * and updating user-edited results.
 */
@Injectable()
export class AnalysisService {
  private readonly genai: GoogleGenAI | undefined;
  private readonly mock: boolean;
  private readonly model: string;

  constructor(
    private readonly s3Service: S3Service,
    private readonly sessionService: SessionService,
  ) {
    const config = loadConfiguration();
    this.mock = config.gemini.mock;
    this.model = config.gemini.model;

    if (!this.mock) {
      if (!config.gemini.apiKey) {
        throw new Error(
          'GOOGLE_GEMINI_API_KEY or GEMINI_API_KEY environment variable is required',
        );
      }
      this.genai = new GoogleGenAI({ apiKey: config.gemini.apiKey });
    }
  }

  /**
   * Analyze uploaded video using Google Gemini
   * @param sessionId - Session identifier
   * @returns Analysis ID and initial status
   */
  async analyzeVideo(
    sessionId: string,
  ): Promise<{ analysisId: string; status: AnalysisStatus }> {
    // Validate session exists and has uploaded video
    const session = this.sessionService.getSession(sessionId);
    if (!session) {
      throw new BadRequestException('Session not found');
    }

    if (!session.originalVideo) {
      throw new BadRequestException('No video uploaded yet');
    }

    // Create initial analysis record
    const analysisId = uuidv4();
    const videoAnalysis: VideoAnalysis = {
      analysisId,
      analyzedAt: new Date(),
      status: AnalysisStatus.PROCESSING,
      sceneBreakdown: '',
    };

    // Update session status to analyzing
    this.sessionService.updateSession(sessionId, {
      videoAnalysis,
      status: SessionStatus.ANALYZING,
    });

    // Start async analysis
    this.performAnalysis(sessionId, session.originalVideo.s3Key).catch(
      (error) => {
        console.error('Video analysis failed:', error);
        this.sessionService.updateSession(sessionId, {
          videoAnalysis: {
            ...videoAnalysis,
            status: AnalysisStatus.FAILED,
            error: {
              code: 'ANALYSIS_FAILED',
              message: error.message || 'Video analysis failed',
              timestamp: new Date(),
            },
          },
          status: SessionStatus.ERROR,
        });
      },
    );

    return {
      analysisId,
      status: AnalysisStatus.PROCESSING,
    };
  }

  /**
   * Perform video analysis using Gemini
   * @param sessionId - Session identifier
   * @param s3Key - S3 key of video file
   */
  private async performAnalysis(
    sessionId: string,
    s3Key: string,
  ): Promise<void> {
    console.log('[AnalysisService] Starting analysis for session:', sessionId);
    console.log('[AnalysisService] S3 Key:', s3Key);

    try {
      let responseText: string;

      if (this.mock) {
        console.log(
          '[AnalysisService] MOCK_ANALYSIS enabled, skipping Gemini call',
        );
        responseText = this.buildMockAnalysisResponse();
      } else {
        console.log('[AnalysisService] Downloading video from S3...');
        const videoBuffer = await this.s3Service.downloadBuffer(s3Key);
        console.log(
          '[AnalysisService] Video downloaded, size:',
          videoBuffer.length,
          'bytes',
        );

        const videoBase64 = videoBuffer.toString('base64');

        console.log('[AnalysisService] Sending request to Gemini API...');
        const response = await this.genai!.models.generateContent({
          model: this.model,
          contents: [
            {
              inlineData: {
                mimeType: 'video/mp4',
                data: videoBase64,
              },
            },
            { text: ANALYSIS_PROMPT },
          ],
        });

        console.log('[AnalysisService] Received response from Gemini');
        responseText = response?.text || '';
      }

      console.log(
        '[AnalysisService] Raw response length:',
        responseText.length,
      );

      const structuredData = parseSceneAnalysis(responseText);

      // The editable text shown to the user is the pretty-printed JSON so
      // that any edits they make can be re-parsed back into structured data.
      const sceneBreakdown = structuredData
        ? JSON.stringify(structuredData, null, 2)
        : responseText;

      if (!structuredData) {
        console.warn(
          '[AnalysisService] Could not parse structured scenes from Gemini response, storing raw text only',
        );
      } else {
        console.log(
          '[AnalysisService] Parsed structured analysis with',
          structuredData.scenes.length,
          'scenes, cutCount:',
          structuredData.cutCount,
        );
      }

      // Update session with complete analysis
      const session = this.sessionService.getSession(sessionId);
      if (session?.videoAnalysis) {
        this.sessionService.updateSession(sessionId, {
          videoAnalysis: {
            ...session.videoAnalysis,
            status: AnalysisStatus.COMPLETE,
            sceneBreakdown,
            structuredData: structuredData ?? undefined,
          },
          status: SessionStatus.ANALYSIS_COMPLETE,
        });
        console.log(
          '[AnalysisService] Analysis complete for session:',
          sessionId,
        );
      }
    } catch (error) {
      console.error('[AnalysisService] Analysis failed:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Gemini analysis failed: ${errorMessage}`);
    }
  }

  /**
   * Fixture analysis response used when MOCK_ANALYSIS=true, so the full
   * pipeline (prompt variants + multi-clip video generation) can be
   * exercised locally without any billed Gemini calls.
   */
  private buildMockAnalysisResponse(): string {
    return JSON.stringify({
      scenes: [
        {
          sceneIndex: 0,
          timestamp: '0:00-0:02',
          startTimeSeconds: 0,
          duration: 2,
          purpose: 'hook',
          hookType: 'bold_claim',
          visualDetails: {
            cameraAngle: 'Medium close-up, slight upward pan',
            movement: 'Hand holding product package toward camera',
            lighting: 'Bright, even daylight',
            colorPalette: 'Deep greens, crisp white text, warm skin tones',
            onScreenElements: 'Product pouch with visible branding',
          },
          cinematicDetails: {
            shotType: 'medium close-up',
            pacing: 'Snappy, attention-grabbing open',
            style: 'product reveal',
            cutCount: 1,
          },
          audioDetails: {
            dialogue: '"I didn\'t expect this to actually work."',
            soundDesign: 'Upbeat modern background music, medium intensity',
            timing: 'Dialogue begins immediately with the visual',
          },
          captions: [
            {
              text: 'WAIT FOR IT...',
              position: 'top',
              style: 'bold white sans-serif, pop-in',
              startTime: 0,
              endTime: 2,
            },
          ],
        },
        {
          sceneIndex: 1,
          timestamp: '0:02-0:05',
          startTimeSeconds: 2,
          duration: 3,
          purpose: 'solution',
          visualDetails: {
            cameraAngle: 'Medium shot, static, then quick cut to detail shot',
            movement: 'Presenter demonstrates the product',
            lighting: 'Bright, even, consistent',
            colorPalette: 'Vibrant product colors, clean white background',
            onScreenElements: 'Product in use',
          },
          cinematicDetails: {
            shotType: 'medium, then detail shot',
            pacing: 'Quick, informative cuts',
            style: 'lifestyle product demo',
            cutCount: 2,
          },
          audioDetails: {
            dialogue: '"It only takes ten seconds a day."',
            soundDesign: 'Background music continues, steady energy',
            timing: 'Dialogue starts with the shot',
          },
          captions: [
            {
              text: '10 SECONDS A DAY',
              position: 'bottom',
              style: 'bold highlight box',
              startTime: 0,
              endTime: 3,
            },
          ],
        },
        {
          sceneIndex: 2,
          timestamp: '0:05-0:07',
          startTimeSeconds: 5,
          duration: 2,
          purpose: 'benefit',
          visualDetails: {
            cameraAngle: 'Medium close-up, presenter facing camera',
            movement: 'Presenter gestures with excitement',
            lighting: 'Bright, soft, even',
            colorPalette: 'Warm skin tones, clean background',
            onScreenElements: 'Product visible in hand',
          },
          cinematicDetails: {
            shotType: 'medium close-up',
            pacing: 'Energetic, testimonial delivery',
            style: 'testimonial',
            cutCount: 1,
          },
          audioDetails: {
            dialogue: '"My results after two weeks were honestly wild."',
            soundDesign: 'Music builds slightly',
            timing: 'Delivered expressively over the whole scene',
          },
          captions: [],
        },
        {
          sceneIndex: 3,
          timestamp: '0:07-0:08',
          startTimeSeconds: 7,
          duration: 1,
          purpose: 'cta',
          visualDetails: {
            cameraAngle: 'Overhead close-up',
            movement: 'Product placed on clean surface',
            lighting: 'Bright, highlighting product details',
            colorPalette: 'Rich product colors, neutral background',
            onScreenElements: 'Product + logo',
          },
          cinematicDetails: {
            shotType: 'detail shot',
            pacing: 'Fast final cut, punchy',
            style: 'promotional CTA',
            cutCount: 1,
          },
          audioDetails: {
            dialogue: '"Link is in my bio, go grab yours."',
            soundDesign: 'Music resolves on a flourish',
            timing: 'Concludes on the final word',
          },
          captions: [
            {
              text: 'SHOP NOW ⬆️',
              position: 'bottom',
              style: 'bold, animated scale-up',
              startTime: 0,
              endTime: 1,
            },
          ],
        },
      ],
      hook: {
        type: 'bold_claim',
        text: "I didn't expect this to actually work.",
        durationSeconds: 2,
      },
      overallAesthetic: 'Bright, clean, authentic UGC testimonial style',
      dominantColors: ['deep green', 'white', 'warm skin tones'],
      pacing: 'Fast, punchy cuts with an average shot length of ~2 seconds',
      audioStyle: 'Upbeat modern pop bed with a confident spoken voiceover',
      musicStyle:
        'Upbeat modern pop, medium-high energy, builds toward the CTA',
      captionStyle: {
        fontFamily: 'sans-serif',
        textColor: '#FFFFFF',
        backgroundStyle: 'bold text with subtle drop shadow',
        position: 'bottom',
        animation: 'pop-in per phrase',
      },
      recommendedAspectRatio: '9:16',
      totalDurationSeconds: 8,
      cutCount: 4,
      averageShotDurationSeconds: 2,
    });
  }

  /**
   * Get analysis status and results
   * @param sessionId - Session identifier
   * @returns Video analysis data
   */
  async getAnalysisStatus(sessionId: string): Promise<VideoAnalysis> {
    const session = this.sessionService.getSession(sessionId);
    if (!session) {
      throw new BadRequestException('Session not found');
    }

    if (!session.videoAnalysis) {
      throw new BadRequestException('Analysis not started');
    }

    return session.videoAnalysis;
  }

  /**
   * Update analysis with user edits
   * @param sessionId - Session identifier
   * @param editedText - User's edited analysis text
   * @returns Updated video analysis
   */
  async updateAnalysis(
    sessionId: string,
    editedText: string,
  ): Promise<VideoAnalysis> {
    const session = this.sessionService.getSession(sessionId);
    if (!session) {
      throw new BadRequestException('Session not found');
    }

    if (!session.videoAnalysis) {
      throw new BadRequestException('Analysis not started');
    }

    // Re-parse the user's edits so downstream prompt/video generation
    // always has an up-to-date structured view of the scenes.
    const structuredData = parseSceneAnalysis(editedText);

    const updatedAnalysis: VideoAnalysis = {
      ...session.videoAnalysis,
      userEdits: editedText,
      structuredData: structuredData ?? session.videoAnalysis.structuredData,
    };

    this.sessionService.updateSession(sessionId, {
      videoAnalysis: updatedAnalysis,
    });

    return updatedAnalysis;
  }
}
