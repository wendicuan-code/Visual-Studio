import { z } from "zod";
import {
  AiConceptScenePlan,
  AiVideoConcept,
  AlternativeCountSchema,
  ConceptVariantId,
  EditAnalysisEnvelope,
  extractPropertyFacts,
} from "./edit-brief";

export const MAX_FILE_SIZE_BYTES = 250 * 1024 * 1024; // 250 MB
export const MAX_SCENES_COUNT = 100;
export const MAX_DURATION_SEC = 30 * 60; // 30 minutes
export const SCENE_TEXT_WARN_LENGTH = 90;

export const ROOM_LABEL_PRESETS = [
  "Fasad Utama",
  "Ruang Tamu",
  "Kamar Tidur Utama",
  "Dapur & Ruang Makan",
  "Kamar Mandi",
  "Balkon & View",
  "Area Komersial / Ritel",
  "Lingkungan & Akses",
] as const;

export const TemplateStyleSchema = z.enum([
  "properti-elegan",
  "minimalis",
  "promosi-dinamis",
]);
export type TemplateStyle = z.infer<typeof TemplateStyleSchema>;

export const AspectRatioSchema = z.enum(["9:16", "16:9", "1:1"]);
export type AspectRatio = z.infer<typeof AspectRatioSchema>;

export const SceneMotionSchema = z.enum([
  "none",
  "zoom-in",
  "zoom-out",
  "pan-left",
  "pan-right",
]);
export type SceneMotion = z.infer<typeof SceneMotionSchema>;

export const TransitionTypeSchema = z.enum(["none", "fade", "slide", "wipe"]);
export type TransitionType = z.infer<typeof TransitionTypeSchema>;

export const FitModeSchema = z.enum(["cover", "contain"]);
export type FitMode = z.infer<typeof FitModeSchema>;

export const MediaKindSchema = z.enum(["image", "video", "audio", "logo"]);
export type MediaKind = z.infer<typeof MediaKindSchema>;

export const MediaItemSchema = z.object({
  id: z.string(),
  filename: z.string(),
  originalName: z.string(),
  mimeType: z.string(),
  kind: MediaKindSchema,
  sizeBytes: z.number(),
  durationSec: z.number(),
  width: z.number(),
  height: z.number(),
  url: z.string(),
  thumbUrl: z.string(),
  createdAt: z.string(),
});
export type MediaItem = z.infer<typeof MediaItemSchema>;

export const AspectCompositionOverrideSchema = z.object({
  fitMode: FitModeSchema,
  positionX: z.number().min(-100).max(100),
  positionY: z.number().min(-100).max(100),
  zoomScale: z.number().min(0.5).max(2.5),
});
export type AspectCompositionOverride = z.infer<
  typeof AspectCompositionOverrideSchema
>;

export const SceneItemSchema = z.object({
  id: z.string(),
  mediaId: z.string(),
  kind: z.enum(["image", "video"]),
  roomLabel: z.string().default("Fasad Utama"),
  prioritized: z.boolean().default(false),
  title: z.string(),
  bodyText: z.string(),
  durationSec: z.number().min(0.5).max(MAX_DURATION_SEC),
  trimStartSec: z.number().min(0),
  trimEndSec: z.number().min(0.5),
  volume: z.number().min(0).max(1),
  muted: z.boolean(),
  fitMode: FitModeSchema,
  positionX: z.number().min(-100).max(100),
  positionY: z.number().min(-100).max(100),
  zoomScale: z.number().min(0.5).max(2.5).default(1),
  motion: SceneMotionSchema,
  transitionIn: TransitionTypeSchema,
  transitionDurationSec: z.number().min(0).max(5),
  aspectOverrides: z
    .object({
      "9:16": AspectCompositionOverrideSchema.optional(),
      "16:9": AspectCompositionOverrideSchema.optional(),
      "1:1": AspectCompositionOverrideSchema.optional(),
    })
    .optional(),
});
export type SceneItem = z.infer<typeof SceneItemSchema>;

export const TextStyleConfigSchema = z.object({
  fontFamily: z.string(),
  textColor: z.string(),
  accentColor: z.string(),
  bgOpacity: z.number().min(0).max(1),
  position: z.enum(["bottom", "top", "center"]),
  showPriceBadge: z.boolean().default(true),
  priceBadgeText: z.string().default(""),
  priceFontScale: z.number().min(0.7).max(2.0).default(1.0),
});
export type TextStyleConfig = z.infer<typeof TextStyleConfigSchema>;

export const SubtitleStyleConfigSchema = z.object({
  fontFamily: z.string().default("Plus Jakarta Sans"),
  fontSize: z.number().min(18).max(52).default(28),
  position: z.enum(["bottom", "middle", "top"]).default("bottom"),
  textColor: z.string().default("#FFFFFF"),
  highlightColor: z.string().default("#F59E0B"),
  outlineColor: z.string().default("#040C18"),
  bgOpacity: z.number().min(0).max(1).default(0.86),
});
export type SubtitleStyleConfig = z.infer<typeof SubtitleStyleConfigSchema>;

export const LogoContactConfigSchema = z.object({
  logoMediaId: z.string().nullable(),
  logoPosition: z.enum(["top-left", "top-right", "bottom-left", "bottom-right"]),
  logoScale: z.number().min(0.3).max(2),
  logoOpacity: z.number().min(0.1).max(1),
  agentName: z.string(),
  phone: z.string(),
  whatsapp: z.string(),
  agency: z.string(),
  contactDisplay: z.enum(["always", "outro-3s"]),
});
export type LogoContactConfig = z.infer<typeof LogoContactConfigSchema>;

export const AudioTrackConfigSchema = z.object({
  mediaId: z.string().nullable(),
  startSec: z.number().min(0),
  volume: z.number().min(0).max(1),
  fadeInSec: z.number().min(0).max(10),
  fadeOutSec: z.number().min(0).max(10),
  loop: z.boolean(),
});
export type AudioTrackConfig = z.infer<typeof AudioTrackConfigSchema>;

export const SubtitleWordSchema = z.object({
  word: z.string(),
  startSec: z.number(),
  endSec: z.number(),
});
export type SubtitleWord = z.infer<typeof SubtitleWordSchema>;

export const SubtitleCueSchema = z.object({
  id: z.string(),
  sourceType: z.enum(["video", "voiceover", "manual"]),
  sourceMediaId: z.string().nullable(),
  sourceStartSec: z.number(),
  sourceEndSec: z.number(),
  startSec: z.number(),
  endSec: z.number(),
  text: z.string(),
  words: z.array(SubtitleWordSchema),
  hidden: z.boolean(),
  isManual: z.boolean(),
});
export type SubtitleCue = z.infer<typeof SubtitleCueSchema>;

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  workflowStage: z
    .enum(["input", "concepts", "editor", "exported"])
    .default("editor"),
  description: z.string().default(""),
  direction: z.string().default(""),
  unitDescription: z.string().default(""),
  editPrompt: z.string().default(""),
  alternativeCount: AlternativeCountSchema.default(3),
  lastAnalysisEnvelope: z.custom<EditAnalysisEnvelope | null>().default(null),
  aiConcepts: z.custom<AiVideoConcept[]>().default([]),
  selectedConceptId: z.enum(["A", "B", "C"]).nullable().default(null),
  template: TemplateStyleSchema,
  aspectRatio: AspectRatioSchema,
  scenes: z.array(SceneItemSchema).max(MAX_SCENES_COUNT),
  textStyle: TextStyleConfigSchema,
  subtitleStyle: SubtitleStyleConfigSchema.default({
    fontFamily: "Plus Jakarta Sans",
    fontSize: 28,
    position: "bottom",
    textColor: "#FFFFFF",
    highlightColor: "#F59E0B",
    outlineColor: "#040C18",
    bgOpacity: 0.86,
  }),
  logoContact: LogoContactConfigSchema,
  musicTrack: AudioTrackConfigSchema,
  voiceoverTrack: AudioTrackConfigSchema,
  duckingEnabled: z.boolean(),
  subtitles: z.array(SubtitleCueSchema),
  subtitleBurnIn: z.boolean(),
  subtitleSource: z.enum(["video", "voiceover", "both"]),
  subtitleLanguage: z.enum(["id", "en", "auto"]),
  subtitleStale: z.boolean(),
  transcriptionGenerationId: z.number(),
  updatedAt: z.string(),
});
export type Project = z.infer<typeof ProjectSchema>;

export const RenderJobSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  projectName: z.string(),
  status: z.enum(["queued", "rendering", "completed", "failed", "cancelled"]),
  progress: z.number().min(0).max(100),
  stageLabel: z.string().default("Siap"),
  resolution: z.enum(["720p", "1080p"]),
  fps: z.union([z.literal(24), z.literal(30)]),
  outputFileName: z.string(),
  localFilePath: z.string().default(""),
  burnInSubtitles: z.boolean(),
  mp4Url: z.string().nullable(),
  thumbUrl: z.string().nullable(),
  srtUrl: z.string().nullable(),
  vttUrl: z.string().nullable(),
  durationSec: z.number(),
  error: z.string().nullable(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
});
export type RenderJob = z.infer<typeof RenderJobSchema>;

export interface WhisperModelStatus {
  modelId: string;
  quantized: string;
  ready: boolean;
  downloading: boolean;
  progress: number;
  statusText: string;
  lastError: string | null;
}

export interface ComputedSceneTiming {
  sceneId: string;
  index: number;
  clipDurationSec: number;
  clipFrames: number;
  overlapInSec: number;
  overlapInFrames: number;
  startFrame: number;
  endFrame: number;
  startSec: number;
  endSec: number;
}

export interface SpeechDuckInterval {
  startSec: number;
  endSec: number;
  reason: "video" | "voiceover";
}

export interface ComputedTimeline {
  fps: number;
  totalFrames: number;
  totalDurationSec: number;
  scenes: ComputedSceneTiming[];
  duckIntervals: SpeechDuckInterval[];
}

export function getEffectiveSceneDurationSec(scene: SceneItem): number {
  if (scene.kind === "video") {
    return Math.max(0.5, scene.trimEndSec - scene.trimStartSec);
  }
  return Math.max(0.5, scene.durationSec);
}

/**
 * Mengembalikan komposisi (fitMode, positionX, positionY, zoomScale) untuk
 * rasio layar aktif dengan mendukung override per rasio.
 */
export function getSceneCompositionForAspect(
  scene: SceneItem,
  aspectRatio: AspectRatio,
): AspectCompositionOverride {
  const override = scene.aspectOverrides?.[aspectRatio];
  if (override) {
    return override;
  }
  return {
    fitMode: scene.fitMode,
    positionX: scene.positionX,
    positionY: scene.positionY,
    zoomScale: scene.zoomScale || 1,
  };
}

/**
 * Memecah satu klip adegan menjadi dua klip pada titik tengah durasinya.
 */
export function splitSceneAtMidpoint(scene: SceneItem): [SceneItem, SceneItem] {
  const effDur = getEffectiveSceneDurationSec(scene);
  const halfDur = Number(Math.max(0.5, effDur / 2).toFixed(2));
  const midTrim = Number((scene.trimStartSec + halfDur).toFixed(2));

  const firstHalf: SceneItem = {
    ...structuredClone(scene),
    id: `${scene.id}-part1`,
    title: `${scene.title} (Bagian 1)`,
    durationSec: halfDur,
    trimEndSec: midTrim,
  };

  const secondHalf: SceneItem = {
    ...structuredClone(scene),
    id: `${scene.id}-part2`,
    title: `${scene.title} (Bagian 2)`,
    durationSec: halfDur,
    trimStartSec: scene.kind === "video" ? midTrim : 0,
    trimEndSec: scene.kind === "video" ? scene.trimEndSec : halfDur,
    transitionIn: "fade",
    transitionDurationSec: 0.4,
  };

  return [firstHalf, secondHalf];
}

/**
 * Menghitung timeline frame-akurat dengan overlap transisi masuk yang
 * dibatasi maksimal setengah durasi klip sebelumnya maupun klip saat ini.
 * Juga menghitung rentang ducking musik (30% saat voice-over atau video bersuara aktif).
 */
export function computeTimeline(
  project: Pick<Project, "scenes" | "voiceoverTrack" | "duckingEnabled">,
  fps = 30,
  voiceoverDurationSec = 0,
): ComputedTimeline {
  const safeFps = fps > 0 ? fps : 30;
  const scenes: ComputedSceneTiming[] = [];
  let cursorFrame = 0;
  let prevClipFrames = 0;

  for (let i = 0; i < project.scenes.length; i++) {
    const scene = project.scenes[i];
    const clipSec = getEffectiveSceneDurationSec(scene);
    const clipFrames = Math.max(1, Math.round(clipSec * safeFps));

    let overlapInFrames = 0;
    if (
      i > 0 &&
      scene.transitionIn !== "none" &&
      scene.transitionDurationSec > 0
    ) {
      const requestedOverlapFrames = Math.round(
        scene.transitionDurationSec * safeFps,
      );
      const maxOverlapFrames = Math.floor(
        Math.min(prevClipFrames, clipFrames) / 2,
      );
      overlapInFrames = Math.max(
        0,
        Math.min(requestedOverlapFrames, maxOverlapFrames),
      );
    }

    const startFrame = Math.max(0, cursorFrame - overlapInFrames);
    const endFrame = startFrame + clipFrames;

    scenes.push({
      sceneId: scene.id,
      index: i,
      clipDurationSec: clipFrames / safeFps,
      clipFrames,
      overlapInSec: overlapInFrames / safeFps,
      overlapInFrames,
      startFrame,
      endFrame,
      startSec: startFrame / safeFps,
      endSec: endFrame / safeFps,
    });

    cursorFrame = endFrame;
    prevClipFrames = clipFrames;
  }

  const totalFrames = Math.max(safeFps, cursorFrame);
  const totalDurationSec = totalFrames / safeFps;

  const duckIntervals: SpeechDuckInterval[] = [];
  if (project.duckingEnabled) {
    for (let i = 0; i < project.scenes.length; i++) {
      const scene = project.scenes[i];
      const timing = scenes[i];
      if (
        scene.kind === "video" &&
        !scene.muted &&
        scene.volume > 0 &&
        timing
      ) {
        duckIntervals.push({
          startSec: timing.startSec,
          endSec: timing.endSec,
          reason: "video",
        });
      }
    }

    if (project.voiceoverTrack.mediaId && project.voiceoverTrack.volume > 0) {
      const voStart = Math.max(0, project.voiceoverTrack.startSec);
      const voDur =
        voiceoverDurationSec > 0 ? voiceoverDurationSec : totalDurationSec;
      const voEnd = Math.min(totalDurationSec, voStart + voDur);
      if (voEnd > voStart) {
        duckIntervals.push({
          startSec: voStart,
          endSec: voEnd,
          reason: "voiceover",
        });
      }
    }
  }

  return {
    fps: safeFps,
    totalFrames,
    totalDurationSec,
    scenes,
    duckIntervals,
  };
}

/**
 * Menghitung pengali volume musik pada detik ke-t dengan memperhitungkan
 * ducking (turun ke 30% selama interval bicara) dan fade in/out.
 */
export function getMusicEffectiveVolumeAtSec(
  musicTrack: AudioTrackConfig,
  duckIntervals: SpeechDuckInterval[],
  timeSec: number,
  totalDurationSec: number,
): number {
  if (
    !musicTrack.mediaId ||
    timeSec < musicTrack.startSec ||
    timeSec > totalDurationSec
  ) {
    return 0;
  }
  let vol = musicTrack.volume;
  const elapsed = timeSec - musicTrack.startSec;
  if (musicTrack.fadeInSec > 0 && elapsed < musicTrack.fadeInSec) {
    vol *= Math.max(0, Math.min(1, elapsed / musicTrack.fadeInSec));
  }
  const remaining = totalDurationSec - timeSec;
  if (musicTrack.fadeOutSec > 0 && remaining < musicTrack.fadeOutSec) {
    vol *= Math.max(0, Math.min(1, remaining / musicTrack.fadeOutSec));
  }

  const isDucked = duckIntervals.some(
    (interval) => timeSec >= interval.startSec && timeSec <= interval.endSec,
  );
  if (isDucked) {
    vol *= 0.3;
  }
  return Number(vol.toFixed(4));
}

export interface DistributedSceneTextResult {
  scenes: SceneItem[];
  warnings: Array<{ sceneId: string; sceneIndex: number; length: number }>;
}

/**
 * Membagikan baris `unitDescription` ke adegan secara deterministik;
 * sisa baris digabungkan ke adegan terakhir. Harga tidak dibuat otomatis.
 */
export function distributeUnitDescriptionToScenes(
  unitDescription: string,
  scenes: SceneItem[],
): DistributedSceneTextResult {
  if (scenes.length === 0) {
    return { scenes: [], warnings: [] };
  }

  const lines = unitDescription
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return { scenes: [...scenes], warnings: [] };
  }

  const updatedScenes = scenes.map((scene, idx) => {
    let assignedLines: string[] = [];
    if (idx < scenes.length - 1) {
      if (idx < lines.length) {
        assignedLines = [lines[idx]];
      }
    } else {
      if (idx < lines.length) {
        assignedLines = lines.slice(idx);
      }
    }

    if (assignedLines.length === 0) {
      return { ...scene };
    }

    const firstLine = assignedLines[0];
    const restLines = assignedLines.slice(1);
    let title = scene.title;
    let bodyText = firstLine;

    if (firstLine.includes(":")) {
      const [lhs, ...rhsParts] = firstLine.split(":");
      const rhs = rhsParts.join(":").trim();
      if (lhs.trim().length <= 32 && rhs.length > 0) {
        title = lhs.trim();
        bodyText = [rhs, ...restLines].join(" • ");
      } else {
        bodyText = assignedLines.join(" • ");
      }
    } else if (restLines.length > 0) {
      title = firstLine.slice(0, 36);
      bodyText = restLines.join(" • ");
    }

    return {
      ...scene,
      title,
      bodyText,
    };
  });

  const warnings: Array<{
    sceneId: string;
    sceneIndex: number;
    length: number;
  }> = [];
  updatedScenes.forEach((sc, index) => {
    const combinedLen = `${sc.title} ${sc.bodyText}`.trim().length;
    if (combinedLen > SCENE_TEXT_WARN_LENGTH) {
      warnings.push({
        sceneId: sc.id,
        sceneIndex: index,
        length: combinedLen,
      });
    }
  });

  return { scenes: updatedScenes, warnings };
}

export const TEMPLATE_PRESETS: Record<
  TemplateStyle,
  {
    label: string;
    tagline: string;
    textStyle: TextStyleConfig;
    defaultMotion: SceneMotion;
    defaultTransition: TransitionType;
    defaultTransitionDurationSec: number;
  }
> = {
  "properti-elegan": {
    label: "Properti Elegan",
    tagline:
      "Nuansa navy-emas mewah dengan gerakan halus untuk rumah tapak, villa, dan ruko.",
    textStyle: {
      fontFamily: "Plus Jakarta Sans",
      textColor: "#F8FAFC",
      accentColor: "#F59E0B",
      bgOpacity: 0.78,
      position: "bottom",
      showPriceBadge: true,
      priceBadgeText: "",
      priceFontScale: 1.0,
    },
    defaultMotion: "zoom-in",
    defaultTransition: "fade",
    defaultTransitionDurationSec: 0.6,
  },
  minimalis: {
    label: "Minimalis",
    tagline:
      "Tipografi bersih dengan ruang lapang, warna natural, dan transisi sederhana.",
    textStyle: {
      fontFamily: "DM Sans",
      textColor: "#FFFFFF",
      accentColor: "#38BDF8",
      bgOpacity: 0.62,
      position: "bottom",
      showPriceBadge: true,
      priceBadgeText: "",
      priceFontScale: 1.0,
    },
    defaultMotion: "pan-right",
    defaultTransition: "fade",
    defaultTransitionDurationSec: 0.4,
  },
  "promosi-dinamis": {
    label: "Promosi Dinamis",
    tagline:
      "Kontras tegas dengan transisi cepat untuk penawaran unit siap huni.",
    textStyle: {
      fontFamily: "Plus Jakarta Sans",
      textColor: "#FFFFFF",
      accentColor: "#10B981",
      bgOpacity: 0.85,
      position: "bottom",
      showPriceBadge: true,
      priceBadgeText: "",
      priceFontScale: 1.1,
    },
    defaultMotion: "zoom-out",
    defaultTransition: "slide",
    defaultTransitionDurationSec: 0.5,
  },
};

export function applyTemplateToProject(
  project: Project,
  template: TemplateStyle,
): Project {
  const preset = TEMPLATE_PRESETS[template];
  const facts = extractPropertyFacts(project.unitDescription);
  const motions: SceneMotion[] = [
    preset.defaultMotion,
    "pan-left",
    "zoom-in",
    "pan-right",
    "zoom-out",
  ];
  return {
    ...project,
    template,
    textStyle: {
      ...preset.textStyle,
      priceBadgeText:
        project.textStyle.priceBadgeText || facts.hargaRp || "",
      priceFontScale: project.textStyle.priceFontScale || 1.0,
      showPriceBadge: project.textStyle.showPriceBadge ?? true,
    },
    scenes: project.scenes.map((scene, index) => ({
      ...scene,
      motion: motions[index % motions.length],
      transitionIn: index === 0 ? "none" : preset.defaultTransition,
      transitionDurationSec:
        index === 0 ? 0 : preset.defaultTransitionDurationSec,
    })),
  };
}

/**
 * Menghasilkan 3 konsep video (A: Informatif, B: Sinematik, C: Promosi Cepat)
 * berdasarkan media proyek, `unitDescription` (fakta terkunci), dan `editPrompt`
 * tanpa mengarang spesifikasi, harga, atau fasilitas yang tidak tertulis.
 */
export function generateThreeConceptsFromProject(
  project: Pick<
    Project,
    "name" | "unitDescription" | "editPrompt" | "scenes"
  >,
  targetVariant?: ConceptVariantId,
): AiVideoConcept[] {
  const facts = extractPropertyFacts(project.unitDescription);
  const factLines = project.unitDescription
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // Urutkan adegan: adegan yang diprioritaskan tampil lebih dulu untuk konsep promosi/informatif
  const prioritizedFirst = [...project.scenes].sort((a, b) => {
    if (a.prioritized && !b.prioritized) return -1;
    if (!a.prioritized && b.prioritized) return 1;
    return 0;
  });

  const buildVariant = (variantId: ConceptVariantId): AiVideoConcept => {
    const now = new Date().toISOString();
    const baseScenes =
      variantId === "A" || variantId === "C"
        ? prioritizedFirst
        : [...project.scenes];
    const distributed = distributeUnitDescriptionToScenes(
      project.unitDescription,
      baseScenes,
    ).scenes;

    if (variantId === "A") {
      // A: Informatif
      const storyboard: AiConceptScenePlan[] = distributed.map((sc, idx) => ({
        sceneId: sc.id,
        mediaId: sc.mediaId,
        roomLabel: sc.roomLabel || `Area ${idx + 1}`,
        prioritized: Boolean(sc.prioritized),
        durationSec: 4.0,
        screenTitle: sc.roomLabel || sc.title || `Bagian ${idx + 1}`,
        screenText:
          sc.bodyText ||
          factLines[idx] ||
          project.name,
        narrationLine: `${sc.roomLabel || sc.title}: ${sc.bodyText || factLines[idx] || project.name}.`,
        motion: idx % 2 === 0 ? "zoom-in" : "pan-right",
        transitionIn: idx === 0 ? "none" : "fade",
        transitionDurationSec: idx === 0 ? 0 : 0.5,
      }));
      const totalDur = storyboard.reduce(
        (acc, s, i) => acc + s.durationSec - (i > 0 ? s.transitionDurationSec : 0),
        0,
      );
      const factHookParts = [
        project.name,
        facts.hargaRp,
        facts.ltLb ? `LT/LB ${facts.ltLb}` : null,
      ].filter(Boolean);

      return {
        id: "A",
        title: "Konsep A: Informatif",
        subtitle:
          "Urutan terstruktur per ruangan dengan pemaparan fakta unit lengkap & jelas.",
        template: "properti-elegan",
        hook: `Tinjauan lengkap ${factHookParts.join(" • ")}`,
        narrationScript: storyboard.map((s) => s.narrationLine).join(" "),
        estimatedDurationSec: Number(Math.max(2, totalDur).toFixed(1)),
        storyboard,
        generatedBy: "lokal-deterministik",
        updatedAt: now,
      };
    }

    if (variantId === "B") {
      // B: Sinematik
      const storyboard: AiConceptScenePlan[] = distributed.map((sc, idx) => ({
        sceneId: sc.id,
        mediaId: sc.mediaId,
        roomLabel: sc.roomLabel || `Sudut ${idx + 1}`,
        prioritized: Boolean(sc.prioritized),
        durationSec: 4.8,
        screenTitle: sc.title || sc.roomLabel || project.name,
        screenText:
          sc.bodyText ||
          factLines[idx] ||
          project.name,
        narrationLine: `Menikmati suasana ${sc.roomLabel || sc.title} — ${sc.bodyText}.`,
        motion: idx % 2 === 0 ? "zoom-out" : "pan-left",
        transitionIn: idx === 0 ? "none" : "fade",
        transitionDurationSec: idx === 0 ? 0 : 0.8,
      }));
      const totalDur = storyboard.reduce(
        (acc, s, i) => acc + s.durationSec - (i > 0 ? s.transitionDurationSec : 0),
        0,
      );

      return {
        id: "B",
        title: "Konsep B: Sinematik",
        subtitle:
          "Tempo tenang, gerakan kamera halus, dan transisi lembut untuk kesan eksklusif.",
        template: "minimalis",
        hook: `${project.name}${facts.hadap ? ` • ${facts.hadap}` : ""}${facts.uwto ? ` • ${facts.uwto}` : ""}`,
        narrationScript: storyboard.map((s) => s.narrationLine).join(" "),
        estimatedDurationSec: Number(Math.max(2, totalDur).toFixed(1)),
        storyboard,
        generatedBy: "lokal-deterministik",
        updatedAt: now,
      };
    }

    // C: Promosi Cepat
    const storyboard: AiConceptScenePlan[] = distributed.map((sc, idx) => ({
      sceneId: sc.id,
      mediaId: sc.mediaId,
      roomLabel: sc.roomLabel || `Highlight ${idx + 1}`,
      prioritized: Boolean(sc.prioritized),
      durationSec: 2.5,
      screenTitle:
        idx === 0 && facts.hargaRp
          ? `Penawaran ${facts.hargaRp}`
          : sc.roomLabel || sc.title,
      screenText: sc.bodyText || factLines[idx] || project.name,
      narrationLine: `${sc.roomLabel || sc.title}: ${sc.bodyText}.`,
      motion: idx % 2 === 0 ? "zoom-in" : "zoom-out",
      transitionIn: idx === 0 ? "none" : "slide",
      transitionDurationSec: idx === 0 ? 0 : 0.4,
    }));
    const totalDur = storyboard.reduce(
      (acc, s, i) => acc + s.durationSec - (i > 0 ? s.transitionDurationSec : 0),
      0,
    );

    return {
      id: "C",
      title: "Konsep C: Promosi Cepat",
      subtitle:
        "Hook singkat padat untuk Reels/TikTok, mendahulukan media prioritas & fakta utama.",
      template: "promosi-dinamis",
      hook: `${facts.hargaRp ? `${facts.hargaRp} — ` : ""}${project.name}`,
      narrationScript: storyboard.map((s) => s.narrationLine).join(" "),
      estimatedDurationSec: Number(Math.max(2, totalDur).toFixed(1)),
      storyboard,
      generatedBy: "lokal-deterministik",
      updatedAt: now,
    };
  };

  if (targetVariant) {
    return [buildVariant(targetVariant)];
  }
  return [buildVariant("A"), buildVariant("B"), buildVariant("C")];
}

/**
 * Menerapkan konsep AI terpilih (A/B/C) ke timeline proyek yang bisa diedit.
 */
export function applyConceptToProject(
  project: Project,
  concept: AiVideoConcept,
): Project {
  const sceneMap = new Map(project.scenes.map((s) => [s.id, s]));
  const facts = extractPropertyFacts(project.unitDescription);
  const preset = TEMPLATE_PRESETS[concept.template];

  const updatedScenes: SceneItem[] = concept.storyboard.map((plan, idx) => {
    const existing =
      sceneMap.get(plan.sceneId) ??
      project.scenes.find((s) => s.mediaId === plan.mediaId) ??
      project.scenes[idx % Math.max(1, project.scenes.length)];

    const dur = Math.max(0.5, plan.durationSec);
    return {
      ...(existing
        ? structuredClone(existing)
        : {
            id: plan.sceneId || `scene-${idx + 1}`,
            mediaId: plan.mediaId,
            kind: "image" as const,
            volume: 1,
            muted: false,
            fitMode: "cover" as const,
            positionX: 0,
            positionY: 0,
            zoomScale: 1,
          }),
      roomLabel: plan.roomLabel,
      prioritized: plan.prioritized,
      title: plan.screenTitle,
      bodyText: plan.screenText,
      durationSec: dur,
      trimStartSec: existing?.kind === "video" ? existing.trimStartSec : 0,
      trimEndSec:
        existing?.kind === "video"
          ? existing.trimStartSec + dur
          : dur,
      motion: plan.motion,
      transitionIn: idx === 0 ? "none" : plan.transitionIn,
      transitionDurationSec: idx === 0 ? 0 : plan.transitionDurationSec,
    };
  });

  return {
    ...project,
    selectedConceptId: concept.id,
    workflowStage: "editor",
    template: concept.template,
    textStyle: {
      ...preset.textStyle,
      priceBadgeText: facts.hargaRp || project.textStyle.priceBadgeText || "",
      priceFontScale: project.textStyle.priceFontScale || 1.0,
      showPriceBadge: true,
    },
    scenes: updatedScenes.length > 0 ? updatedScenes : project.scenes,
    subtitleStale: true,
  };
}

export interface AiEditCommandProposal {
  id: string;
  command: string;
  recognizedIntent: string;
  summaryItems: string[];
  updatedProject: Project;
}

/**
 * Asisten Editing AI: Menerjemahkan perintah bahasa Indonesia ke perubahan
 * timeline terstruktur yang tervalidasi tanpa mengubah fakta properti.
 */
export function buildAiAssistantProposal(
  project: Project,
  rawCommand: string,
): AiEditCommandProposal {
  const cmd = rawCommand.trim();
  const lower = cmd.toLowerCase();
  const next = structuredClone(project);
  const summaryItems: string[] = [];
  let recognizedIntent = "Penyesuaian Timeline Terstruktur";

  // 1. "Persingkat jadi X detik" / "Ubah durasi jadi X detik"
  const durMatch = lower.match(
    /(?:persingkat|durasi|jadi|ke)\s*(?:jadi\s*)?([0-9]+(?:[.,][0-9]+)?)\s*(?:detik|dtk|s\b)/i,
  );
  if (durMatch && next.scenes.length > 0) {
    const targetTotalSec = Math.max(
      next.scenes.length * 1.0,
      Math.min(600, parseFloat(durMatch[1].replace(",", "."))),
    );
    const totalOverlap = next.scenes.reduce(
      (acc, sc, idx) =>
        acc + (idx > 0 && sc.transitionIn !== "none" ? sc.transitionDurationSec : 0),
      0,
    );
    const perSceneSec = Number(
      Math.max(0.8, (targetTotalSec + totalOverlap) / next.scenes.length).toFixed(2),
    );
    next.scenes = next.scenes.map((sc) => ({
      ...sc,
      durationSec: perSceneSec,
      trimEndSec: sc.trimStartSec + perSceneSec,
    }));
    next.subtitleStale = true;
    recognizedIntent = `Sesuaikan Total Durasi ke ~${targetTotalSec} Detik`;
    summaryItems.push(
      `Mengatur durasi tiap klip (${next.scenes.length} adegan) menjadi ${perSceneSec} detik agar total durasi mendekati ${targetTotalSec} detik.`,
    );
  }

  // 2. "Utamakan fasad dan ruang tamu" / "Utamakan ..."
  if (
    lower.includes("utamakan") ||
    lower.includes("prioritas") ||
    lower.includes("fasad") ||
    lower.includes("ruang tamu")
  ) {
    const keywords: string[] = [];
    if (lower.includes("fasad")) keywords.push("fasad", "depan", "ruko");
    if (lower.includes("ruang tamu"))
      keywords.push("ruang tamu", "interior", "tamu", "tata ruang");
    if (lower.includes("kamar")) keywords.push("kamar");
    if (keywords.length === 0) keywords.push("fasad", "utama");

    const scored = next.scenes.map((sc, idx) => {
      const hay = `${sc.roomLabel} ${sc.title} ${sc.bodyText}`.toLowerCase();
      const matched = keywords.some((k) => hay.includes(k));
      return {
        sc: {
          ...sc,
          prioritized: matched ? true : sc.prioritized,
          durationSec: matched
            ? Number(Math.max(sc.durationSec, 4.2).toFixed(1))
            : sc.durationSec,
          trimEndSec: matched
            ? sc.trimStartSec + Math.max(sc.durationSec, 4.2)
            : sc.trimEndSec,
        },
        score: matched ? 10 : sc.prioritized ? 5 : 0,
        idx,
      };
    });

    scored.sort((a, b) => b.score - a.score || a.idx - b.idx);
    next.scenes = scored.map((item, i) => ({
      ...item.sc,
      transitionIn:
        i === 0
          ? "none"
          : item.sc.transitionIn === "none"
            ? "fade"
            : item.sc.transitionIn,
    }));
    next.subtitleStale = true;
    recognizedIntent = "Prioritaskan Adegan Utama (Fasad & Ruang Tamu)";
    summaryItems.push(
      "Memindahkan adegan berlabel Fasad / Ruang Tamu (dan media prioritas) ke urutan awal timeline serta menandainya sebagai Prioritas.",
    );
  }

  // 3. "Perbesar tulisan harga" / "kecilkan tulisan harga"
  if (lower.includes("harga")) {
    const facts = extractPropertyFacts(next.unitDescription);
    next.textStyle.showPriceBadge = true;
    if (!next.textStyle.priceBadgeText && facts.hargaRp) {
      next.textStyle.priceBadgeText = facts.hargaRp;
    }
    if (lower.includes("kecil")) {
      next.textStyle.priceFontScale = 0.9;
      recognizedIntent = "Perkecil Ukuran Teks Harga";
      summaryItems.push("Mengubah skala ukuran badge harga menjadi 0.9x.");
    } else {
      next.textStyle.priceFontScale = Math.min(
        1.8,
        Number(((next.textStyle.priceFontScale || 1.0) + 0.35).toFixed(2)),
      );
      recognizedIntent = "Perbesar Tulisan Harga";
      summaryItems.push(
        `Memperbesar skala ukuran tulisan harga menjadi ${next.textStyle.priceFontScale}x dan memastikan badge harga tampil di layar.`,
      );
    }
  }

  // 4. "Kurangi transisi" / "tanpa transisi" / "transisi halus"
  if (lower.includes("transisi")) {
    if (
      lower.includes("kurangi") ||
      lower.includes("tanpa") ||
      lower.includes("hilangkan") ||
      lower.includes("sederhana")
    ) {
      next.scenes = next.scenes.map((sc, idx) => ({
        ...sc,
        transitionIn: idx === 0 ? "none" : "fade",
        transitionDurationSec: idx === 0 ? 0 : 0.25,
      }));
      recognizedIntent = "Kurangi & Sederhanakan Transisi";
      summaryItems.push(
        "Mengurangi overlap transisi menjadi pudar halus singkat (0.25 detik) agar perpindahan klip lebih bersih.",
      );
    } else {
      next.scenes = next.scenes.map((sc, idx) => ({
        ...sc,
        transitionIn: idx === 0 ? "none" : "fade",
        transitionDurationSec: idx === 0 ? 0 : 0.6,
      }));
      recognizedIntent = "Haluskan Transisi Antar Klip";
      summaryItems.push(
        "Mengatur transisi antar adegan menjadi Fade 0.6 detik.",
      );
    }
  }

  // 5. "Turunkan musik saat narasi berbicara" / "ducking" / "musik"
  if (
    lower.includes("musik") ||
    lower.includes("narasi") ||
    lower.includes("suara") ||
    lower.includes("ducking")
  ) {
    next.duckingEnabled = true;
    next.musicTrack.volume = Math.min(next.musicTrack.volume || 0.6, 0.5);
    recognizedIntent = "Aktifkan Auto-Ducking Musik Saat Narasi";
    summaryItems.push(
      "Mengaktifkan Auto-Ducking (menurunkan musik ke 30% saat voice-over atau suara video berbicara) dan menyesuaikan volume dasar musik ke 50%.",
    );
  }

  // Fallback jika perintah bebas lainnya
  if (summaryItems.length === 0) {
    next.scenes = next.scenes.map((sc, idx) => ({
      ...sc,
      motion: idx % 2 === 0 ? "zoom-in" : "pan-right",
      transitionIn: idx === 0 ? "none" : "fade",
      transitionDurationSec: idx === 0 ? 0 : 0.45,
    }));
    summaryItems.push(
      `Merapikan gerakan kamera (zoom/pan halus) dan transisi fade 0.45d untuk arahan: "${cmd}".`,
    );
  }

  return {
    id: `assist-${Date.now()}`,
    command: cmd,
    recognizedIntent,
    summaryItems,
    updatedProject: next,
  };
}

/**
 * Memetakan subtitle sumber ke waktu tampilan timeline sesuai trim,
 * urutan adegan, dan overlap transisi.
 * - Subtitle yang berada di luar rentang trim disimpan dan ditandai `hidden: true`.
 * - Subtitle aktif yang bertumpuk dipotong pada awal ucapan berikutnya agar hanya
 *   satu baris ucapan aktif pada satu waktu.
 */
export function mapSourceSubtitlesToTimeline(
  project: Pick<Project, "scenes" | "voiceoverTrack" | "subtitles">,
  fps = 30,
): SubtitleCue[] {
  const timeline = computeTimeline(
    {
      scenes: project.scenes,
      voiceoverTrack: project.voiceoverTrack,
      duckingEnabled: true,
    },
    fps,
  );

  const mapped: SubtitleCue[] = project.subtitles.map((cue) => {
    if (cue.isManual || cue.sourceType === "manual") {
      return {
        ...cue,
        hidden: false,
      };
    }

    if (cue.sourceType === "voiceover") {
      const offset = project.voiceoverTrack.startSec;
      const startSec = offset + cue.sourceStartSec;
      const endSec = offset + cue.sourceEndSec;
      const hidden =
        !project.voiceoverTrack.mediaId ||
        startSec >= timeline.totalDurationSec ||
        endSec <= 0;

      const words = cue.words.map((w) => ({
        ...w,
        startSec: Number((offset + w.startSec).toFixed(3)),
        endSec: Number((offset + w.endSec).toFixed(3)),
      }));

      return {
        ...cue,
        startSec: Number(Math.max(0, startSec).toFixed(3)),
        endSec: Number(Math.min(timeline.totalDurationSec, endSec).toFixed(3)),
        words,
        hidden,
      };
    }

    // sourceType === "video"
    const sceneIdx = project.scenes.findIndex(
      (sc) => sc.mediaId === cue.sourceMediaId && sc.kind === "video",
    );
    if (sceneIdx === -1) {
      return { ...cue, hidden: true };
    }
    const scene = project.scenes[sceneIdx];
    const sceneTiming = timeline.scenes[sceneIdx];
    if (!sceneTiming || scene.muted || scene.volume <= 0) {
      return { ...cue, hidden: true };
    }

    if (
      cue.sourceEndSec <= scene.trimStartSec ||
      cue.sourceStartSec >= scene.trimEndSec
    ) {
      return { ...cue, hidden: true };
    }

    const clippedSourceStart = Math.max(scene.trimStartSec, cue.sourceStartSec);
    const clippedSourceEnd = Math.min(scene.trimEndSec, cue.sourceEndSec);
    const timelineOffset = sceneTiming.startSec - scene.trimStartSec;

    const startSec = Number((clippedSourceStart + timelineOffset).toFixed(3));
    const endSec = Number((clippedSourceEnd + timelineOffset).toFixed(3));

    const words = cue.words
      .filter(
        (w) => w.endSec > scene.trimStartSec && w.startSec < scene.trimEndSec,
      )
      .map((w) => ({
        word: w.word,
        startSec: Number(
          (
            Math.max(scene.trimStartSec, w.startSec) + timelineOffset
          ).toFixed(3),
        ),
        endSec: Number(
          (Math.min(scene.trimEndSec, w.endSec) + timelineOffset).toFixed(3),
        ),
      }));

    return {
      ...cue,
      startSec,
      endSec,
      words,
      hidden: endSec <= startSec,
    };
  });

  const visibleIndices = mapped
    .map((c, idx) => ({ c, idx }))
    .filter((item) => !item.c.hidden)
    .sort((a, b) => a.c.startSec - b.c.startSec);

  for (let i = 0; i < visibleIndices.length - 1; i++) {
    const current = mapped[visibleIndices[i].idx];
    const next = mapped[visibleIndices[i + 1].idx];
    if (current.endSec > next.startSec) {
      const trimmedEnd = Number(
        Math.max(current.startSec + 0.1, next.startSec).toFixed(3),
      );
      mapped[visibleIndices[i].idx] = {
        ...current,
        endSec: trimmedEnd,
        words: current.words.filter((w) => w.startSec < trimmedEnd),
      };
    }
  }

  return mapped;
}

/**
 * Mengedit teks subtitle menghapus timestamp per kata baris tersebut
 * sehingga tampil sebagai teks biasa.
 */
export function updateSubtitleCueText(
  cue: SubtitleCue,
  newText: string,
): SubtitleCue {
  if (cue.text === newText) {
    return cue;
  }
  return {
    ...cue,
    text: newText,
    words: [],
  };
}

/**
 * Memecah satu baris subtitle menjadi dua baris pada titik waktu tengah.
 */
export function splitSubtitleCue(
  cue: SubtitleCue,
  splitAtSec?: number,
): [SubtitleCue, SubtitleCue] {
  const midSec =
    splitAtSec !== undefined &&
    splitAtSec > cue.startSec + 0.1 &&
    splitAtSec < cue.endSec - 0.1
      ? Number(splitAtSec.toFixed(3))
      : Number(((cue.startSec + cue.endSec) / 2).toFixed(3));

  const tokens = cue.text.trim().split(/\s+/);
  const halfIdx = Math.max(1, Math.ceil(tokens.length / 2));
  const firstText = tokens.slice(0, halfIdx).join(" ") || cue.text;
  const secondText = tokens.slice(halfIdx).join(" ") || "...";

  const firstCue: SubtitleCue = {
    ...cue,
    id: `${cue.id}-a`,
    endSec: midSec,
    sourceEndSec: cue.sourceStartSec + (midSec - cue.startSec),
    text: firstText,
    words: [],
    isManual: true,
    sourceType: "manual",
  };

  const secondCue: SubtitleCue = {
    ...cue,
    id: `${cue.id}-b`,
    startSec: midSec,
    sourceStartSec: cue.sourceStartSec + (midSec - cue.startSec),
    text: secondText,
    words: [],
    isManual: true,
    sourceType: "manual",
  };

  return [firstCue, secondCue];
}

/**
 * Menggabungkan dua subtitle menjadi satu entri manual pada waktu timeline
 * tanpa highlight per kata.
 */
export function mergeSubtitleCues(
  cueA: SubtitleCue,
  cueB: SubtitleCue,
): SubtitleCue {
  const [first, second] =
    cueA.startSec <= cueB.startSec ? [cueA, cueB] : [cueB, cueA];
  const startSec = first.startSec;
  const endSec = Math.max(first.endSec, second.endSec);

  return {
    id: `merged-${first.id}-${second.id}`,
    sourceType: "manual",
    sourceMediaId: null,
    sourceStartSec: startSec,
    sourceEndSec: endSec,
    startSec,
    endSec,
    text: `${first.text.trim()} ${second.text.trim()}`.trim(),
    words: [],
    hidden: false,
    isManual: true,
  };
}

function formatTimestamp(sec: number, separator: "," | "."): string {
  const safe = Math.max(0, sec);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = Math.floor(safe % 60);
  const millis = Math.round((safe - Math.floor(safe)) * 1000);

  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  const mmm = String(Math.min(999, millis)).padStart(3, "0");
  return `${hh}:${mm}:${ss}${separator}${mmm}`;
}

export function formatSrt(cues: SubtitleCue[]): string {
  const active = cues
    .filter((c) => !c.hidden && c.text.trim().length > 0)
    .sort((a, b) => a.startSec - b.startSec);

  return active
    .map((cue, idx) => {
      const start = formatTimestamp(cue.startSec, ",");
      const end = formatTimestamp(cue.endSec, ",");
      return `${idx + 1}\n${start} --> ${end}\n${cue.text.trim()}\n`;
    })
    .join("\n");
}

export function formatVtt(cues: SubtitleCue[]): string {
  const active = cues
    .filter((c) => !c.hidden && c.text.trim().length > 0)
    .sort((a, b) => a.startSec - b.startSec);

  const body = active
    .map((cue) => {
      const start = formatTimestamp(cue.startSec, ".");
      const end = formatTimestamp(cue.endSec, ".");
      return `${start} --> ${end}\n${cue.text.trim()}\n`;
    })
    .join("\n");

  return `WEBVTT\n\n${body}`;
}

export function getDimensionsForAspectRatio(
  aspectRatio: AspectRatio,
  resolution: "720p" | "1080p" = "1080p",
): { width: number; height: number } {
  const base = resolution === "720p" ? 720 : 1080;
  const longSide = resolution === "720p" ? 1280 : 1920;

  if (aspectRatio === "9:16") {
    return { width: base, height: longSide };
  }
  if (aspectRatio === "16:9") {
    return { width: longSide, height: base };
  }
  return { width: base, height: base };
}
