/**
 * Scene Analysis Utilities
 *
 * Shared helpers for parsing the structured JSON scene breakdown produced
 * by the analysis service (and potentially hand-edited by the user) back
 * into a strongly-typed object that downstream services (prompt generation,
 * video generation) can rely on.
 */

import {
  AnalysisStructuredData,
  Scene,
  ScenePurpose,
  HookType,
} from '../types/analysis.types';

/**
 * Strip markdown code fences and extract the first top-level JSON object
 * from an LLM response.
 */
export function extractJsonObject(text: string): string | null {
  const cleaned = text.replace(/```json\n?|```\n?/g, '').trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  return match ? match[0] : cleaned || null;
}

function coerceScenePurpose(value: unknown): ScenePurpose {
  const normalized = String(value ?? '').toLowerCase();
  const match = Object.values(ScenePurpose).find((v) => v === normalized);
  return match ?? ScenePurpose.SOLUTION;
}

function coerceHookType(value: unknown): HookType | undefined {
  if (value === undefined || value === null) return undefined;
  const normalized = String(value).toLowerCase();
  const match = Object.values(HookType).find((v) => v === normalized);
  return match ?? HookType.OTHER;
}

/**
 * Best-effort normalization of a single scene object coming from the LLM
 * (or user edits) into the strongly-typed Scene shape. Missing fields are
 * filled with safe defaults so downstream code never has to null-check.
 */
function normalizeScene(raw: unknown, index: number): Scene {
  const r = (raw ?? {}) as Record<string, unknown>;
  const visual = (r.visualDetails ?? {}) as Record<string, unknown>;
  const cinematic = (r.cinematicDetails ?? {}) as Record<string, unknown>;
  const audio = (r.audioDetails ?? {}) as Record<string, unknown>;

  const rawCaptions = Array.isArray(r.captions) ? r.captions : [];

  return {
    sceneIndex: typeof r.sceneIndex === 'number' ? r.sceneIndex : index,
    timestamp: typeof r.timestamp === 'string' ? r.timestamp : `0:00`,
    startTimeSeconds:
      typeof r.startTimeSeconds === 'number' ? r.startTimeSeconds : undefined,
    duration: typeof r.duration === 'number' ? r.duration : 4,
    purpose: coerceScenePurpose(r.purpose),
    hookType: coerceHookType(r.hookType),
    visualDetails: {
      cameraAngle: asString(visual.cameraAngle),
      movement: asString(visual.movement),
      lighting: asString(visual.lighting),
      colorPalette: asString(visual.colorPalette),
      onScreenElements: asString(visual.onScreenElements),
    },
    cinematicDetails: {
      shotType: asString(cinematic.shotType),
      pacing: asString(cinematic.pacing),
      style: asString(cinematic.style),
      cutCount:
        typeof cinematic.cutCount === 'number' ? cinematic.cutCount : undefined,
    },
    audioDetails: {
      dialogue: asString(audio.dialogue),
      soundDesign: asString(audio.soundDesign),
      timing: asString(audio.timing),
    },
    captions: rawCaptions.map((c) => {
      const cap = (c ?? {}) as Record<string, unknown>;
      return {
        text: asString(cap.text) ?? '',
        position:
          cap.position === 'top' || cap.position === 'bottom'
            ? cap.position
            : 'center',
        style: asString(cap.style),
        startTime:
          typeof cap.startTime === 'number' ? cap.startTime : undefined,
        endTime: typeof cap.endTime === 'number' ? cap.endTime : undefined,
      };
    }),
  };
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * Parse a (possibly user-edited) scene breakdown JSON string into a fully
 * normalized AnalysisStructuredData object.
 *
 * @param text - Raw or pretty-printed JSON text (may include markdown fences)
 * @returns Parsed structured data, or null if the text could not be parsed
 */
export function parseSceneAnalysis(
  text: string | undefined | null,
): AnalysisStructuredData | null {
  if (!text || !text.trim()) return null;

  try {
    const jsonText = extractJsonObject(text);
    if (!jsonText) return null;

    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    const rawScenes = Array.isArray(parsed.scenes) ? parsed.scenes : [];

    if (rawScenes.length === 0) {
      return null;
    }

    const scenes = rawScenes.map((scene, index) =>
      normalizeScene(scene, index),
    );

    const hookRaw = parsed.hook as Record<string, unknown> | undefined;

    return {
      scenes,
      hook: hookRaw
        ? {
            type: coerceHookType(hookRaw.type) ?? HookType.OTHER,
            text: asString(hookRaw.text) ?? '',
            durationSeconds:
              typeof hookRaw.durationSeconds === 'number'
                ? hookRaw.durationSeconds
                : (scenes[0]?.duration ?? 2),
          }
        : undefined,
      overallAesthetic: asString(parsed.overallAesthetic),
      dominantColors: Array.isArray(parsed.dominantColors)
        ? (parsed.dominantColors as unknown[]).filter(
            (c): c is string => typeof c === 'string',
          )
        : undefined,
      pacing: asString(parsed.pacing),
      audioStyle: asString(parsed.audioStyle),
      musicStyle: asString(parsed.musicStyle),
      captionStyle:
        parsed.captionStyle as AnalysisStructuredData['captionStyle'],
      recommendedAspectRatio:
        parsed.recommendedAspectRatio === '16:9' ||
        parsed.recommendedAspectRatio === '1:1'
          ? parsed.recommendedAspectRatio
          : '9:16',
      totalDurationSeconds:
        typeof parsed.totalDurationSeconds === 'number'
          ? parsed.totalDurationSeconds
          : scenes.reduce((sum, s) => sum + (s.duration || 0), 0),
      cutCount:
        typeof parsed.cutCount === 'number' ? parsed.cutCount : scenes.length,
      averageShotDurationSeconds:
        typeof parsed.averageShotDurationSeconds === 'number'
          ? parsed.averageShotDurationSeconds
          : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Snap an arbitrary target duration (seconds) to the closest value
 * supported by the Veo API (4, 6, or 8 seconds).
 */
export function snapToVeoDuration(durationSeconds: number): 4 | 6 | 8 {
  if (durationSeconds <= 4) return 4;
  if (durationSeconds <= 6) return 6;
  return 8;
}
