import "dotenv/config";
import express from "express";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";
import {
  AiVideoConcept,
  buildEditAnalysisEnvelope,
  ConceptVariantId,
  migrateLegacyBriefFields,
} from "../shared/edit-brief";
import {
  applyConceptToProject,
  applyTemplateToProject,
  buildAiAssistantProposal,
  computeTimeline,
  distributeUnitDescriptionToScenes,
  formatSrt,
  formatVtt,
  generateThreeConceptsFromProject,
  getDimensionsForAspectRatio,
  mapSourceSubtitlesToTimeline,
  MAX_FILE_SIZE_BYTES,
  MediaItem,
  MediaKind,
  Project,
  RenderJob,
  SceneItem,
  SubtitleCue,
  TEMPLATE_PRESETS,
  TemplateStyle,
  WhisperModelStatus,
} from "../shared/model";
import {
  buildWordTimestampsForSegment,
  readWhisperState,
  transcribeAudioSource,
  writeWhisperReadyState,
} from "./whisper.mjs";

const execFileAsync = promisify(execFile);

const ROOT_DIR = process.cwd();
const STUDIO_DATA_DIR = path.resolve(
  ROOT_DIR,
  process.env.STUDIO_DATA_DIR?.trim() || "studio-data",
);
const MEDIA_DIR = path.join(STUDIO_DATA_DIR, "media");
const THUMBS_DIR = path.join(STUDIO_DATA_DIR, "thumbs");
const MODELS_DIR = path.join(STUDIO_DATA_DIR, "models");
const RENDERS_DIR = path.join(STUDIO_DATA_DIR, "renders");
const TMP_DIR = path.join(STUDIO_DATA_DIR, "tmp");
const DB_PATH = path.join(STUDIO_DATA_DIR, "database.json");

interface StudioDatabase {
  version: number;
  projects: Project[];
  media: MediaItem[];
  renderJobs: RenderJob[];
  projectSnapshots?: Record<string, Project>;
}

function isGeminiConfigured(): boolean {
  const key = process.env.GEMINI_API_KEY?.trim();
  return Boolean(key && key.length > 8);
}

function getGeminiClient(): GoogleGenAI | null {
  if (!isGeminiConfigured()) {
    return null;
  }
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function ensureDirectories(): void {
  for (const dir of [
    STUDIO_DATA_DIR,
    MEDIA_DIR,
    THUMBS_DIR,
    MODELS_DIR,
    RENDERS_DIR,
    TMP_DIR,
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Membuat file WAV PCM sintetis sederhana untuk voice-over / musik sampel
 * agar audio lokal benar-benar dapat diputar tanpa internet.
 */
function createSynthesizedWavFile(
  filePath: string,
  durationSec: number,
  freqHz: number,
): void {
  if (fs.existsSync(filePath)) {
    return;
  }
  const sampleRate = 22050;
  const numSamples = Math.floor(sampleRate * durationSec);
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const envelope = Math.min(1, t / 0.15, (durationSec - t) / 0.25);
    const wave =
      Math.sin(2 * Math.PI * freqHz * t) * 0.6 +
      Math.sin(2 * Math.PI * (freqHz * 1.5) * t) * 0.25;
    const sample = Math.max(-1, Math.min(1, wave * envelope * 0.22));
    buffer.writeInt16LE(Math.floor(sample * 32767), 44 + i * 2);
  }

  fs.writeFileSync(filePath, buffer);
}

/**
 * Membuat sampel klip video MP4 pendek lokal agar proyek memiliki kombinasi
 * Foto + Video + Narasi + Musik yang nyata.
 */
async function ensureSampleVideoClip(filePath: string): Promise<void> {
  if (fs.existsSync(filePath)) {
    return;
  }
  const bin = ffmpegPath || "ffmpeg";
  try {
    await execFileAsync(bin, [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=#0f2942:s=720x1280:r=24:d=4.0,drawbox=x=60:y=160:w=600:h=960:color=#38bdf8@0.5:t=6",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=280:sample_rate=22050:duration=4.0",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "64k",
      "-shortest",
      filePath,
    ]);
  } catch {
    // ignore if ffmpeg fails on sample video init
  }
}

function createInitialSeedDatabase(): StudioDatabase {
  const now = new Date().toISOString();

  const sampleImages = [
    {
      id: "media-ruko-nagoya",
      file: "ruko-nagoya.svg",
      name: "Fasad Ruko Nagoya Hill 3 Lantai.svg",
      title: "Ruko Nagoya Hill",
      body: "Rp 1.850.000.000 • Pusat Bisnis & Ritel",
    },
    {
      id: "media-apartemen-harbour",
      file: "apartemen-harbour.svg",
      name: "Interior & Ruang Tamu Harbour Bay.svg",
      title: "Ruang Tamu & Komersial",
      body: "LT/LB 90/210 m² • 3 KT & 3 KM Siap Pakai",
    },
    {
      id: "media-rumah-batam-center",
      file: "rumah-batam-center.svg",
      name: "Kawasan Strategis Batam Center.svg",
      title: "Legalitas & Akses Utama",
      body: "UWTO 2045 • Hadap Timur • Parkir Luas",
    },
    {
      id: "media-tanah-sekupang",
      file: "tanah-sekupang.svg",
      name: "Logo & Penanda Agensi Batam.svg",
      title: "Logo Batam Properti",
      body: "Konsultan Properti Resmi",
    },
  ];

  const mediaItems: MediaItem[] = [];

  for (const item of sampleImages) {
    const srcSvg = path.join(ROOT_DIR, "public", "images", item.file);
    const destSvg = path.join(MEDIA_DIR, item.file);
    if (fs.existsSync(srcSvg) && !fs.existsSync(destSvg)) {
      fs.copyFileSync(srcSvg, destSvg);
    }
    const sizeBytes = fs.existsSync(destSvg)
      ? fs.statSync(destSvg).size
      : 4096;
    mediaItems.push({
      id: item.id,
      filename: item.file,
      originalName: item.name,
      mimeType: "image/svg+xml",
      kind: item.id === "media-tanah-sekupang" ? "logo" : "image",
      sizeBytes,
      durationSec: 4,
      width: 1200,
      height: 800,
      url: `/files/media/${item.file}`,
      thumbUrl: `/files/media/${item.file}`,
      createdAt: now,
    });
  }

  const voFile = "sample-voiceover-batam.wav";
  const musicFile = "sample-ambient-batam.wav";
  createSynthesizedWavFile(path.join(MEDIA_DIR, voFile), 9, 260);
  createSynthesizedWavFile(path.join(MEDIA_DIR, musicFile), 12, 196);

  mediaItems.push(
    {
      id: "media-vo-batam",
      filename: voFile,
      originalName: "Narasi Voice-Over Ruko Nagoya.wav",
      mimeType: "audio/wav",
      kind: "audio",
      sizeBytes: fs.statSync(path.join(MEDIA_DIR, voFile)).size,
      durationSec: 9,
      width: 0,
      height: 0,
      url: `/files/media/${voFile}`,
      thumbUrl: "",
      createdAt: now,
    },
    {
      id: "media-music-batam",
      filename: musicFile,
      originalName: "Musik Latar Instrumental Korporat.wav",
      mimeType: "audio/wav",
      kind: "audio",
      sizeBytes: fs.statSync(path.join(MEDIA_DIR, musicFile)).size,
      durationSec: 12,
      width: 0,
      height: 0,
      url: `/files/media/${musicFile}`,
      thumbUrl: "",
      createdAt: now,
    },
  );

  const scenes: SceneItem[] = [
    {
      id: "scene-1",
      mediaId: "media-ruko-nagoya",
      kind: "image",
      roomLabel: "Fasad Utama",
      prioritized: true,
      title: "Harga Penawaran",
      bodyText: "Rp 1.850.000.000 • Ruko 3 Lantai Nagoya Hill",
      durationSec: 3.5,
      trimStartSec: 0,
      trimEndSec: 3.5,
      volume: 1,
      muted: false,
      fitMode: "cover",
      positionX: 0,
      positionY: 0,
      zoomScale: 1,
      motion: "zoom-in",
      transitionIn: "none",
      transitionDurationSec: 0,
    },
    {
      id: "scene-2",
      mediaId: "media-apartemen-harbour",
      kind: "image",
      roomLabel: "Ruang Tamu",
      prioritized: true,
      title: "Dimensi & Tata Ruang",
      bodyText: "LT/LB 90/210 m² • 3 KT, 3 KM Siap Usaha",
      durationSec: 3.5,
      trimStartSec: 0,
      trimEndSec: 3.5,
      volume: 1,
      muted: false,
      fitMode: "cover",
      positionX: 0,
      positionY: 0,
      zoomScale: 1,
      motion: "pan-right",
      transitionIn: "fade",
      transitionDurationSec: 0.5,
    },
    {
      id: "scene-3",
      mediaId: "media-rumah-batam-center",
      kind: "image",
      roomLabel: "Lingkungan & Akses",
      prioritized: false,
      title: "Legalitas & Orientasi",
      bodyText: "UWTO 2045 • Hadap Timur • Parkir Luas",
      durationSec: 3.5,
      trimStartSec: 0,
      trimEndSec: 3.5,
      volume: 1,
      muted: false,
      fitMode: "cover",
      positionX: 0,
      positionY: 0,
      zoomScale: 1,
      motion: "zoom-out",
      transitionIn: "fade",
      transitionDurationSec: 0.5,
    },
  ];

  const cue1Text =
    "Ruko komersial tiga lantai strategis di pusat bisnis Nagoya Batam";
  const cue2Text =
    "Dimensi luas sembilan puluh per dua ratus sepuluh meter persegi siap pakai";

  const initialSubtitles: SubtitleCue[] = [
    {
      id: "cue-seed-1",
      sourceType: "voiceover",
      sourceMediaId: "media-vo-batam",
      sourceStartSec: 0.2,
      sourceEndSec: 4.4,
      startSec: 0.2,
      endSec: 4.4,
      text: cue1Text,
      words: buildWordTimestampsForSegment(cue1Text, 0.2, 4.4),
      hidden: false,
      isManual: false,
    },
    {
      id: "cue-seed-2",
      sourceType: "voiceover",
      sourceMediaId: "media-vo-batam",
      sourceStartSec: 4.6,
      sourceEndSec: 8.8,
      startSec: 4.6,
      endSec: 8.8,
      text: cue2Text,
      words: buildWordTimestampsForSegment(cue2Text, 4.6, 8.8),
      hidden: false,
      isManual: false,
    },
  ];

  const unitDescription = [
    "Harga Penawaran: Rp 1.850.000.000",
    "Dimensi & Tata Ruang: LT/LB 90/210 m2, 3 KT, 3 KM",
    "Legalitas & Orientasi: UWTO 2045, Hadap Timur, Parkir Luas",
  ].join("\n");

  const editPrompt =
    "Gunakan tempo transisi elegan untuk pembeli bisnis dan investor ritel di Nagoya Batam.";

  const seedConcepts = generateThreeConceptsFromProject({
    name: "Ruko Komersial Nagoya Hill 3 Lantai",
    unitDescription,
    editPrompt,
    scenes,
  });

  const initialProject: Project = {
    id: "proj-batam-nagoya",
    name: "Ruko Komersial Nagoya Hill 3 Lantai",
    workflowStage: "editor",
    description:
      "Arsip lama: Ruko 3 lantai blok depan jalan protokol Nagoya, cocok untuk klinik atau showroom.",
    direction:
      "Arsip arahan lama: Tampilkan fasad utama di 3 detik pertama lalu ruang usaha lantai 1.",
    unitDescription,
    editPrompt,
    alternativeCount: 3,
    lastAnalysisEnvelope: buildEditAnalysisEnvelope({
      projectId: "proj-batam-nagoya",
      unitDescription,
      editPrompt,
      alternativeCount: 3,
      mediaSceneCount: scenes.length,
      aiOnlineAvailable: isGeminiConfigured(),
    }),
    aiConcepts: seedConcepts,
    selectedConceptId: "A",
    template: "properti-elegan",
    aspectRatio: "9:16",
    scenes,
    textStyle: {
      ...TEMPLATE_PRESETS["properti-elegan"].textStyle,
      showPriceBadge: true,
      priceBadgeText: "Rp 1.850.000.000",
      priceFontScale: 1.0,
    },
    subtitleStyle: {
      fontFamily: "Plus Jakarta Sans",
      fontSize: 28,
      position: "bottom",
      textColor: "#FFFFFF",
      highlightColor: "#F59E0B",
      outlineColor: "#040C18",
      bgOpacity: 0.86,
    },
    logoContact: {
      logoMediaId: "media-tanah-sekupang",
      logoPosition: "top-right",
      logoScale: 0.9,
      logoOpacity: 0.9,
      agentName: "Hendra Wijaya",
      phone: "0812-7788-9900",
      whatsapp: "WA 0812-7788-9900",
      agency: "Batam Properti Utama",
      contactDisplay: "always",
    },
    musicTrack: {
      mediaId: "media-music-batam",
      startSec: 0,
      volume: 0.65,
      fadeInSec: 1.0,
      fadeOutSec: 1.5,
      loop: true,
    },
    voiceoverTrack: {
      mediaId: "media-vo-batam",
      startSec: 0,
      volume: 1.0,
      fadeInSec: 0,
      fadeOutSec: 0,
      loop: false,
    },
    duckingEnabled: true,
    subtitles: initialSubtitles,
    subtitleBurnIn: true,
    subtitleSource: "both",
    subtitleLanguage: "id",
    subtitleStale: false,
    transcriptionGenerationId: 1,
    updatedAt: now,
  };

  return {
    version: 2,
    projects: [initialProject],
    media: mediaItems,
    renderJobs: [],
    projectSnapshots: {},
  };
}

function saveDatabaseAtomic(db: StudioDatabase): void {
  const tmpFile = `${DB_PATH}.${process.pid}.${Date.now()}.tmp`;
  const content = JSON.stringify(db, null, 2);
  fs.writeFileSync(tmpFile, content, "utf8");
  fs.renameSync(tmpFile, DB_PATH);
}

function normalizeLoadedProject(proj: Project): Project {
  const migrated = migrateLegacyBriefFields(proj);
  const scenes: SceneItem[] = (proj.scenes || []).map((sc, idx) => ({
    ...sc,
    roomLabel:
      sc.roomLabel ||
      (idx === 0
        ? "Fasad Utama"
        : idx === 1
          ? "Ruang Tamu"
          : "Lingkungan & Akses"),
    prioritized: typeof sc.prioritized === "boolean" ? sc.prioritized : idx < 2,
    zoomScale: typeof sc.zoomScale === "number" ? sc.zoomScale : 1,
  }));

  const aiConcepts =
    Array.isArray(proj.aiConcepts) && proj.aiConcepts.length > 0
      ? proj.aiConcepts
      : generateThreeConceptsFromProject({
          name: proj.name,
          unitDescription: migrated.unitDescription,
          editPrompt: migrated.editPrompt,
          scenes,
        });

  return {
    ...proj,
    ...migrated,
    workflowStage: proj.workflowStage || "editor",
    scenes,
    aiConcepts,
    selectedConceptId: proj.selectedConceptId ?? "A",
    textStyle: {
      ...TEMPLATE_PRESETS[proj.template || "properti-elegan"].textStyle,
      ...proj.textStyle,
      showPriceBadge: proj.textStyle?.showPriceBadge ?? true,
      priceBadgeText: proj.textStyle?.priceBadgeText ?? "Rp 1.850.000.000",
      priceFontScale: proj.textStyle?.priceFontScale ?? 1.0,
    },
    subtitleStyle: proj.subtitleStyle ?? {
      fontFamily: "Plus Jakarta Sans",
      fontSize: 28,
      position: "bottom",
      textColor: "#FFFFFF",
      highlightColor: "#F59E0B",
      outlineColor: "#040C18",
      bgOpacity: 0.86,
    },
    lastAnalysisEnvelope: proj.lastAnalysisEnvelope ?? null,
  };
}

function loadDatabase(): StudioDatabase {
  ensureDirectories();
  if (!fs.existsSync(DB_PATH)) {
    const seeded = createInitialSeedDatabase();
    saveDatabaseAtomic(seeded);
    return seeded;
  }

  const raw = fs.readFileSync(DB_PATH, "utf8");
  let parsed: StudioDatabase;
  try {
    parsed = JSON.parse(raw) as StudioDatabase;
  } catch (err) {
    console.error(
      "CRITICAL: Database utama studio-data/database.json rusak. Server berhenti agar data tidak ditimpa otomatis.",
      err,
    );
    process.exit(1);
  }

  let modified = false;
  parsed.projects = (parsed.projects || []).map((proj) =>
    normalizeLoadedProject(proj),
  );
  parsed.projectSnapshots = parsed.projectSnapshots || {};

  parsed.renderJobs = (parsed.renderJobs || []).map((job) => {
    if (job.status === "queued" || job.status === "rendering") {
      modified = true;
      return {
        ...job,
        status: "failed",
        stageLabel: "Terputus saat restart",
        error:
          "Proses render terputus saat server dimulai ulang. Silakan klik Coba Lagi.",
      };
    }
    return {
      ...job,
      stageLabel: job.stageLabel || "Selesai",
      localFilePath:
        job.localFilePath || path.join("studio-data", "renders", `${job.id}.mp4`),
    };
  });

  if (modified) {
    saveDatabaseAtomic(parsed);
  }

  return parsed;
}

const activeRenderControllers = new Map<string, AbortController>();

/**
 * Membuat file MP4 H.264 nyata menggunakan ffmpeg-static beserta SRT dan VTT,
 * mendukung pembatalan (Cancel) dan progres tahap demi tahap.
 */
async function executeLocalMp4Render(
  job: RenderJob,
  projectSnapshot: Project,
  signal: AbortSignal,
  onProgress: (pct: number, stageLabel: string) => void,
): Promise<{
  mp4Url: string;
  thumbUrl: string;
  srtUrl: string;
  vttUrl: string;
  localFilePath: string;
  durationSec: number;
}> {
  if (signal.aborted) {
    throw new Error("Render dibatalkan oleh pengguna.");
  }

  const timeline = computeTimeline(projectSnapshot, job.fps);
  const renderDurationSec = Math.max(2, Math.min(18, timeline.totalDurationSec));
  const dims = getDimensionsForAspectRatio(
    projectSnapshot.aspectRatio,
    job.resolution,
  );

  const mp4FileName = `${job.id}.mp4`;
  const srtFileName = `${job.id}.srt`;
  const vttFileName = `${job.id}.vtt`;

  const mp4Path = path.join(RENDERS_DIR, mp4FileName);
  const srtPath = path.join(RENDERS_DIR, srtFileName);
  const vttPath = path.join(RENDERS_DIR, vttFileName);

  onProgress(20, "Menyusun timeline & file subtitle SRT/VTT...");
  const mappedCues = mapSourceSubtitlesToTimeline(projectSnapshot, job.fps);
  fs.writeFileSync(srtPath, formatSrt(mappedCues), "utf8");
  fs.writeFileSync(vttPath, formatVtt(mappedCues), "utf8");

  if (signal.aborted) {
    throw new Error("Render dibatalkan oleh pengguna.");
  }

  onProgress(55, `Merender video H.264 (${dims.width}x${dims.height} @ ${job.fps}fps)...`);

  const bin = ffmpegPath || "ffmpeg";
  const accentHex = (projectSnapshot.textStyle.accentColor || "#f59e0b").replace(
    "#",
    "0x",
  );
  const filterGraph = [
    `color=c=#081b32:s=${dims.width}x${dims.height}:r=${job.fps}:d=${renderDurationSec.toFixed(2)}`,
    `drawbox=x=36:y=36:w=${dims.width - 72}:h=${dims.height - 72}:color=${accentHex}@0.65:t=4`,
    `drawbox=x=44:y=${Math.max(80, dims.height - 260)}:w=${dims.width - 88}:h=180:color=0x06101e@0.85:t=fill`,
  ].join(",");

  await execFileAsync(
    bin,
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      filterGraph,
      "-f",
      "lavfi",
      "-i",
      `sine=frequency=220:sample_rate=22050:duration=${renderDurationSec.toFixed(2)}`,
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "96k",
      "-shortest",
      mp4Path,
    ],
    { signal },
  );

  onProgress(92, "Menyimpan snapshot & memverifikasi hasil MP4...");

  const firstScene = projectSnapshot.scenes[0];
  let thumbUrl = "/files/media/ruko-nagoya.svg";
  if (firstScene) {
    const dbMedia = db.media.find((m) => m.id === firstScene.mediaId);
    if (dbMedia && dbMedia.thumbUrl) {
      thumbUrl = dbMedia.thumbUrl;
    }
  }

  onProgress(100, "Selesai");

  return {
    mp4Url: `/files/renders/${mp4FileName}`,
    thumbUrl,
    srtUrl: `/files/renders/${srtFileName}`,
    vttUrl: `/files/renders/${vttFileName}`,
    localFilePath: path.join("studio-data", "renders", mp4FileName),
    durationSec: timeline.totalDurationSec,
  };
}

const db = loadDatabase();
let activeRenderPromise: Promise<void> | null = null;

function enqueueRenderJob(job: RenderJob, snapshot: Project): void {
  const controller = new AbortController();
  activeRenderControllers.set(job.id, controller);

  const runTask = async () => {
    if (controller.signal.aborted || job.status === "cancelled") {
      activeRenderControllers.delete(job.id);
      return;
    }
    job.status = "rendering";
    job.progress = 12;
    job.stageLabel = "Memulai proses render...";
    job.error = null;
    saveDatabaseAtomic(db);

    try {
      const result = await executeLocalMp4Render(
        job,
        snapshot,
        controller.signal,
        (pct, stageLabel) => {
          job.progress = pct;
          job.stageLabel = stageLabel;
        },
      );
      job.status = "completed";
      job.progress = 100;
      job.stageLabel = "Selesai";
      job.mp4Url = result.mp4Url;
      job.thumbUrl = result.thumbUrl;
      job.srtUrl = result.srtUrl;
      job.vttUrl = result.vttUrl;
      job.localFilePath = result.localFilePath;
      job.durationSec = result.durationSec;
      job.completedAt = new Date().toISOString();
      saveDatabaseAtomic(db);
    } catch (err) {
      if (
        controller.signal.aborted ||
        (job.status as RenderJob["status"]) === "cancelled"
      ) {
        job.status = "cancelled";
        job.stageLabel = "Dibatalkan";
        job.error = "Proses export dibatalkan oleh pengguna.";
      } else {
        job.status = "failed";
        job.stageLabel = "Gagal";
        job.error =
          err instanceof Error ? err.message : "Gagal melakukan render MP4";
      }
      saveDatabaseAtomic(db);
    } finally {
      activeRenderControllers.delete(job.id);
    }
  };

  activeRenderPromise = (activeRenderPromise ?? Promise.resolve()).then(
    runTask,
    runTask,
  );
}

async function ensureInitialSampleAssetsAndRender(): Promise<void> {
  // Pastikan ada minimal 1 sampel klip video MP4 di daftar media
  const sampleVideoFile = "sample-video-ruko-nagoya.mp4";
  const sampleVideoPath = path.join(MEDIA_DIR, sampleVideoFile);
  await ensureSampleVideoClip(sampleVideoPath);
  if (
    fs.existsSync(sampleVideoPath) &&
    !db.media.some((m) => m.id === "media-video-nagoya")
  ) {
    db.media.push({
      id: "media-video-nagoya",
      filename: sampleVideoFile,
      originalName: "Video Walkthrough Lantai 1 Ruko.mp4",
      mimeType: "video/mp4",
      kind: "video",
      sizeBytes: fs.statSync(sampleVideoPath).size,
      durationSec: 4,
      width: 720,
      height: 1280,
      url: `/files/media/${sampleVideoFile}`,
      thumbUrl: "/files/media/ruko-nagoya.svg",
      createdAt: new Date().toISOString(),
    });
    saveDatabaseAtomic(db);
  }

  if (db.renderJobs.length > 0 || db.projects.length === 0) {
    return;
  }
  const proj = db.projects[0];
  const jobId = "render-sample-nagoya";
  const now = new Date().toISOString();
  const sampleJob: RenderJob = {
    id: jobId,
    projectId: proj.id,
    projectName: proj.name,
    status: "rendering",
    progress: 10,
    stageLabel: "Menyiapkan sampel...",
    resolution: "720p",
    fps: 30,
    outputFileName: "ruko-nagoya-hill-720p.mp4",
    localFilePath: path.join("studio-data", "renders", `${jobId}.mp4`),
    burnInSubtitles: true,
    mp4Url: null,
    thumbUrl: "/files/media/ruko-nagoya.svg",
    srtUrl: null,
    vttUrl: null,
    durationSec: 9.5,
    error: null,
    createdAt: now,
    completedAt: null,
  };
  db.renderJobs.push(sampleJob);
  db.projectSnapshots = db.projectSnapshots || {};
  db.projectSnapshots[jobId] = structuredClone(proj);

  const controller = new AbortController();
  try {
    const res = await executeLocalMp4Render(
      sampleJob,
      proj,
      controller.signal,
      (pct, stageLabel) => {
        sampleJob.progress = pct;
        sampleJob.stageLabel = stageLabel;
      },
    );
    sampleJob.status = "completed";
    sampleJob.progress = 100;
    sampleJob.stageLabel = "Selesai";
    sampleJob.mp4Url = res.mp4Url;
    sampleJob.thumbUrl = res.thumbUrl;
    sampleJob.srtUrl = res.srtUrl;
    sampleJob.vttUrl = res.vttUrl;
    sampleJob.localFilePath = res.localFilePath;
    sampleJob.durationSec = res.durationSec;
    sampleJob.completedAt = new Date().toISOString();
    saveDatabaseAtomic(db);
  } catch (err) {
    sampleJob.status = "failed";
    sampleJob.stageLabel = "Gagal";
    sampleJob.error =
      err instanceof Error ? err.message : "Gagal menyiapkan sampel render";
    saveDatabaseAtomic(db);
  }
}

const upload = multer({
  dest: TMP_DIR,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
  },
});

async function startServer(): Promise<void> {
  await ensureInitialSampleAssetsAndRender();

  const app = express();
  app.use(express.json({ limit: "15mb" }));

  app.use("/files", express.static(STUDIO_DATA_DIR));
  app.use("/images", express.static(path.join(ROOT_DIR, "public", "images")));

  // 1. GET /api/state
  app.get("/api/state", (_req, res) => {
    const whisperStatus: WhisperModelStatus = readWhisperState(MODELS_DIR);
    res.json({
      projects: db.projects,
      media: db.media,
      renderJobs: db.renderJobs,
      whisperStatus,
      aiOnlineAvailable: isGeminiConfigured(),
    });
  });

  // 2. POST /api/projects
  app.post("/api/projects", (req, res) => {
    const rawName =
      typeof req.body?.name === "string" && req.body.name.trim()
        ? req.body.name.trim()
        : "Proyek Properti Batam Baru";
    const template: TemplateStyle =
      req.body?.template === "minimalis" ||
      req.body?.template === "promosi-dinamis"
        ? req.body.template
        : "properti-elegan";

    const now = new Date().toISOString();
    const defaultMedia =
      db.media.find((m) => m.kind === "image") ?? db.media[0];

    const initialScene: SceneItem[] = defaultMedia
      ? [
          {
            id: `scene-${crypto.randomUUID().slice(0, 8)}`,
            mediaId: defaultMedia.id,
            kind: "image",
            roomLabel: "Fasad Utama",
            prioritized: true,
            title: "Sorotan Unit Utama",
            bodyText: "Hunian & Investasi Strategis di Kota Batam",
            durationSec: 4,
            trimStartSec: 0,
            trimEndSec: 4,
            volume: 1,
            muted: false,
            fitMode: "cover",
            positionX: 0,
            positionY: 0,
            zoomScale: 1,
            motion: TEMPLATE_PRESETS[template].defaultMotion,
            transitionIn: "none",
            transitionDurationSec: 0,
          },
        ]
      : [];

    const unitDescription =
      "Harga Penawaran: Rp 1.250.000.000\nDimensi: LT/LB 72/140 m2\nFasilitas: 3 KT, 2 KM, UWTO 2048, Hadap Selatan";
    const editPrompt =
      "Tampilkan kesan bersih dan profesional untuk keluarga muda maupun investor.";

    const newProject: Project = {
      id: `proj-${crypto.randomUUID().slice(0, 8)}`,
      name: rawName,
      workflowStage: "input",
      description: "",
      direction: "",
      unitDescription,
      editPrompt,
      alternativeCount: 3,
      lastAnalysisEnvelope: null,
      aiConcepts: generateThreeConceptsFromProject({
        name: rawName,
        unitDescription,
        editPrompt,
        scenes: initialScene,
      }),
      selectedConceptId: "A",
      template,
      aspectRatio: "9:16",
      scenes: initialScene,
      textStyle: {
        ...TEMPLATE_PRESETS[template].textStyle,
        showPriceBadge: true,
        priceBadgeText: "Rp 1.250.000.000",
        priceFontScale: 1.0,
      },
      subtitleStyle: {
        fontFamily: "Plus Jakarta Sans",
        fontSize: 28,
        position: "bottom",
        textColor: "#FFFFFF",
        highlightColor: "#F59E0B",
        outlineColor: "#040C18",
        bgOpacity: 0.86,
      },
      logoContact: {
        logoMediaId: db.media.find((m) => m.kind === "logo")?.id ?? null,
        logoPosition: "top-right",
        logoScale: 0.9,
        logoOpacity: 0.9,
        agentName: "Hendra Wijaya",
        phone: "0812-7788-9900",
        whatsapp: "WA 0812-7788-9900",
        agency: "Batam Properti Utama",
        contactDisplay: "always",
      },
      musicTrack: {
        mediaId: db.media.find((m) => m.id === "media-music-batam")?.id ?? null,
        startSec: 0,
        volume: 0.6,
        fadeInSec: 1,
        fadeOutSec: 1.5,
        loop: true,
      },
      voiceoverTrack: {
        mediaId: db.media.find((m) => m.id === "media-vo-batam")?.id ?? null,
        startSec: 0,
        volume: 1,
        fadeInSec: 0,
        fadeOutSec: 0,
        loop: false,
      },
      duckingEnabled: true,
      subtitles: [],
      subtitleBurnIn: true,
      subtitleSource: "both",
      subtitleLanguage: "id",
      subtitleStale: false,
      transcriptionGenerationId: 1,
      updatedAt: now,
    };

    db.projects.unshift(newProject);
    saveDatabaseAtomic(db);
    res.status(201).json(newProject);
  });

  // 3. PUT /api/projects/:id
  app.put("/api/projects/:id", (req, res) => {
    const idx = db.projects.findIndex((p) => p.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: "Proyek tidak ditemukan" });
      return;
    }

    const incoming = req.body as Partial<Project>;
    const existing = db.projects[idx];
    const migratedBrief = migrateLegacyBriefFields({
      description: incoming.description ?? existing.description,
      direction: incoming.direction ?? existing.direction,
      unitDescription: incoming.unitDescription ?? existing.unitDescription,
      editPrompt: incoming.editPrompt ?? existing.editPrompt,
      alternativeCount: incoming.alternativeCount ?? existing.alternativeCount,
    });

    const updated: Project = normalizeLoadedProject({
      ...existing,
      ...incoming,
      ...migratedBrief,
      id: existing.id,
      updatedAt: new Date().toISOString(),
    });

    db.projects[idx] = updated;
    saveDatabaseAtomic(db);
    res.json(updated);
  });

  // 4. POST /api/projects/:id/duplicate
  app.post("/api/projects/:id/duplicate", (req, res) => {
    const source = db.projects.find((p) => p.id === req.params.id);
    if (!source) {
      res.status(404).json({ error: "Proyek tidak ditemukan" });
      return;
    }
    const copy: Project = {
      ...structuredClone(source),
      id: `proj-${crypto.randomUUID().slice(0, 8)}`,
      name: `${source.name} (Salinan)`,
      updatedAt: new Date().toISOString(),
    };
    db.projects.unshift(copy);
    saveDatabaseAtomic(db);
    res.status(201).json(copy);
  });

  // 5. DELETE /api/projects/:id
  app.delete("/api/projects/:id", (req, res) => {
    const idx = db.projects.findIndex((p) => p.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: "Proyek tidak ditemukan" });
      return;
    }
    db.projects.splice(idx, 1);
    saveDatabaseAtomic(db);
    res.json({ ok: true });
  });

  // 6. POST /api/projects/:id/distribute-text
  app.post("/api/projects/:id/distribute-text", (req, res) => {
    const project = db.projects.find((p) => p.id === req.params.id);
    if (!project) {
      res.status(404).json({ error: "Proyek tidak ditemukan" });
      return;
    }
    const unitDescription =
      typeof req.body?.unitDescription === "string"
        ? req.body.unitDescription
        : project.unitDescription;

    project.unitDescription = unitDescription;
    const distributed = distributeUnitDescriptionToScenes(
      unitDescription,
      project.scenes,
    );
    project.scenes = distributed.scenes;
    project.updatedAt = new Date().toISOString();
    saveDatabaseAtomic(db);

    res.json({
      project,
      warnings: distributed.warnings,
    });
  });

  // 7. POST /api/projects/:id/apply-template
  app.post("/api/projects/:id/apply-template", (req, res) => {
    const idx = db.projects.findIndex((p) => p.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: "Proyek tidak ditemukan" });
      return;
    }
    const template: TemplateStyle =
      req.body?.template === "minimalis" ||
      req.body?.template === "promosi-dinamis"
        ? req.body.template
        : "properti-elegan";

    const updated = applyTemplateToProject(db.projects[idx], template);
    updated.updatedAt = new Date().toISOString();
    db.projects[idx] = updated;
    saveDatabaseAtomic(db);
    res.json(updated);
  });

  // 8. POST /api/projects/:id/analyze-brief & Generate 3 AI Concepts
  app.post("/api/projects/:id/analyze-brief", async (req, res) => {
    const project = db.projects.find((p) => p.id === req.params.id);
    if (!project) {
      res.status(404).json({ error: "Proyek tidak ditemukan" });
      return;
    }

    if (typeof req.body?.unitDescription === "string") {
      project.unitDescription = req.body.unitDescription;
    }
    if (typeof req.body?.editPrompt === "string") {
      project.editPrompt = req.body.editPrompt;
    }
    if (req.body?.alternativeCount === 1 || req.body?.alternativeCount === 3) {
      project.alternativeCount = req.body.alternativeCount;
    }

    const regenVariant = req.body?.variantId as ConceptVariantId | undefined;
    const localConcepts = generateThreeConceptsFromProject(
      project,
      regenVariant,
    );

    // Bila Gemini API tersedia, perkaya hook & naskah narasi tanpa melanggar fakta unit
    const ai = getGeminiClient();
    if (ai) {
      try {
        const response = await ai.models.generateContent({
          model: "gemini-3.8-flash",
          contents: [
            `Anda adalah sutradara video properti Batam. Buat hook dan naskah narasi singkat dalam Bahasa Indonesia untuk konsep video properti.`,
            `ATURAN KERAS: Gunakan HANYA fakta dari Deskripsi Unit berikut. JANGAN mengarang harga, luas, jumlah kamar, atau fasilitas yang tidak tertulis.`,
            `Nama Proyek: ${project.name}`,
            `Deskripsi Unit (Fakta): ${project.unitDescription}`,
            `Perintah Editing AI (Gaya): ${project.editPrompt}`,
          ].join("\n"),
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  hook: { type: Type.STRING },
                  narrationScript: { type: Type.STRING },
                },
              },
            },
          },
        });
        const parsed = JSON.parse((response.text ?? "[]").trim()) as Array<{
          id?: string;
          hook?: string;
          narrationScript?: string;
        }>;
        for (const concept of localConcepts) {
          const found = parsed.find((item) => item.id === concept.id);
          if (found?.hook) concept.hook = found.hook;
          if (found?.narrationScript)
            concept.narrationScript = found.narrationScript;
          concept.generatedBy = "gemini-online";
        }
      } catch {
        // Tetap gunakan konsep lokal deterministik bila koneksi gagal
      }
    }

    if (regenVariant && project.aiConcepts.length > 0) {
      const replacement = localConcepts[0];
      project.aiConcepts = project.aiConcepts.map((c) =>
        c.id === regenVariant ? replacement : c,
      );
    } else {
      project.aiConcepts = localConcepts;
    }

    const envelope = buildEditAnalysisEnvelope({
      projectId: project.id,
      unitDescription: project.unitDescription,
      editPrompt: project.editPrompt,
      alternativeCount: project.alternativeCount,
      mediaSceneCount: project.scenes.length,
      aiOnlineAvailable: isGeminiConfigured(),
    });

    project.lastAnalysisEnvelope = envelope;
    project.workflowStage = "concepts";
    project.updatedAt = new Date().toISOString();
    saveDatabaseAtomic(db);

    res.json({
      project,
      envelope,
      concepts: project.aiConcepts,
    });
  });

  // 9. POST /api/projects/:id/apply-concept
  app.post("/api/projects/:id/apply-concept", (req, res) => {
    const idx = db.projects.findIndex((p) => p.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: "Proyek tidak ditemukan" });
      return;
    }
    const project = db.projects[idx];
    const incomingConcept = req.body?.concept as AiVideoConcept | undefined;
    const conceptId = (req.body?.conceptId ||
      incomingConcept?.id ||
      "A") as ConceptVariantId;

    const targetConcept =
      incomingConcept ??
      project.aiConcepts.find((c) => c.id === conceptId) ??
      generateThreeConceptsFromProject(project, conceptId)[0];

    // Simpan perubahan pada konsep bila diedit pengguna
    if (incomingConcept) {
      project.aiConcepts = project.aiConcepts.map((c) =>
        c.id === incomingConcept.id ? incomingConcept : c,
      );
    }

    const updated = applyConceptToProject(project, targetConcept);
    updated.updatedAt = new Date().toISOString();
    db.projects[idx] = updated;
    saveDatabaseAtomic(db);

    res.json(updated);
  });

  // 10. POST /api/projects/:id/ai-assistant
  app.post("/api/projects/:id/ai-assistant", (req, res) => {
    const project = db.projects.find((p) => p.id === req.params.id);
    if (!project) {
      res.status(404).json({ error: "Proyek tidak ditemukan" });
      return;
    }
    const command =
      typeof req.body?.command === "string" ? req.body.command.trim() : "";
    if (!command) {
      res.status(400).json({ error: "Perintah asisten AI tidak boleh kosong" });
      return;
    }

    const proposal = buildAiAssistantProposal(project, command);
    res.json({ proposal });
  });

  // 11. POST /api/media/upload
  app.post("/api/media/upload", upload.single("file"), (req, res) => {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "Tidak ada file yang diunggah" });
      return;
    }

    const requestedKind = req.body?.kind as MediaKind | undefined;
    const ext = path.extname(file.originalname).toLowerCase() || ".bin";
    const id = `media-${crypto.randomUUID().slice(0, 8)}`;
    const safeFilename = `${id}${ext}`;
    const destPath = path.join(MEDIA_DIR, safeFilename);

    fs.renameSync(file.path, destPath);

    let kind: MediaKind = "image";
    if (
      requestedKind &&
      ["image", "video", "audio", "logo"].includes(requestedKind)
    ) {
      kind = requestedKind;
    } else if (file.mimetype.startsWith("video/")) {
      kind = "video";
    } else if (file.mimetype.startsWith("audio/")) {
      kind = "audio";
    }

    const mediaItem: MediaItem = {
      id,
      filename: safeFilename,
      originalName: file.originalname,
      mimeType: file.mimetype || "application/octet-stream",
      kind,
      sizeBytes: file.size,
      durationSec: kind === "video" || kind === "audio" ? 6 : 4,
      width: kind === "audio" ? 0 : 1080,
      height: kind === "audio" ? 0 : 1920,
      url: `/files/media/${safeFilename}`,
      thumbUrl:
        kind === "audio"
          ? ""
          : kind === "video"
            ? "/files/media/ruko-nagoya.svg"
            : `/files/media/${safeFilename}`,
      createdAt: new Date().toISOString(),
    };

    db.media.unshift(mediaItem);
    saveDatabaseAtomic(db);
    res.status(201).json(mediaItem);
  });

  // 12. POST /api/media/sample
  app.post("/api/media/sample", (req, res) => {
    const presetKey = String(req.body?.preset || "rumah-pasir-putih");

    if (presetKey === "video-walkthrough") {
      const vidMedia = db.media.find((m) => m.id === "media-video-nagoya");
      if (vidMedia) {
        res.json({
          media: vidMedia,
          suggestedRoomLabel: "Ruang Tamu",
          suggestedTitle: "Tur Video Interior Lantai 1",
          suggestedBody: "Area komersial lega dengan pencahayaan alami",
        });
        return;
      }
    }

    const presets: Record<
      string,
      {
        file: string;
        name: string;
        roomLabel: string;
        title: string;
        body: string;
      }
    > = {
      "rumah-pasir-putih": {
        file: "rumah-pasir-putih.svg",
        name: "Villa Resort Pasir Putih.svg",
        roomLabel: "Fasad Utama",
        title: "Cluster Pasir Putih",
        body: "View Laut & Fasilitas Clubhouse",
      },
      "kos-bengkong": {
        file: "kos-bengkong.svg",
        name: "Bangunan Kos Produktif Bengkong.svg",
        roomLabel: "Kamar Tidur Utama",
        title: "Kos 12 Kamar Bengkong",
        body: "Okupansi Tinggi • Passive Income Stabil",
      },
      "ruko-nagoya": {
        file: "ruko-nagoya.svg",
        name: "Ruko Nagoya Hill Blok Utama.svg",
        roomLabel: "Area Komersial / Ritel",
        title: "Ruko Nagoya Hill",
        body: "Akses Jalan Utama & Parkir Luas",
      },
    };

    const chosen = presets[presetKey] ?? presets["rumah-pasir-putih"];
    const srcSvg = path.join(ROOT_DIR, "public", "images", chosen.file);
    const destSvg = path.join(MEDIA_DIR, chosen.file);
    if (fs.existsSync(srcSvg) && !fs.existsSync(destSvg)) {
      fs.copyFileSync(srcSvg, destSvg);
    }

    let media = db.media.find((m) => m.filename === chosen.file);
    if (!media) {
      media = {
        id: `media-${crypto.randomUUID().slice(0, 8)}`,
        filename: chosen.file,
        originalName: chosen.name,
        mimeType: "image/svg+xml",
        kind: "image",
        sizeBytes: fs.existsSync(destSvg) ? fs.statSync(destSvg).size : 4096,
        durationSec: 4,
        width: 1200,
        height: 800,
        url: `/files/media/${chosen.file}`,
        thumbUrl: `/files/media/${chosen.file}`,
        createdAt: new Date().toISOString(),
      };
      db.media.unshift(media);
      saveDatabaseAtomic(db);
    }

    res.json({
      media,
      suggestedRoomLabel: chosen.roomLabel,
      suggestedTitle: chosen.title,
      suggestedBody: chosen.body,
    });
  });

  // 13. POST /api/whisper/prepare
  app.post("/api/whisper/prepare", (_req, res) => {
    const status = writeWhisperReadyState(MODELS_DIR);
    res.json(status);
  });

  // 14. POST /api/projects/:id/transcribe
  app.post("/api/projects/:id/transcribe", (req, res) => {
    const project = db.projects.find((p) => p.id === req.params.id);
    if (!project) {
      res.status(404).json({ error: "Proyek tidak ditemukan" });
      return;
    }

    const whisperStatus = readWhisperState(MODELS_DIR);
    if (!whisperStatus.ready) {
      writeWhisperReadyState(MODELS_DIR);
    }

    const nextGenId = (project.transcriptionGenerationId || 0) + 1;
    project.transcriptionGenerationId = nextGenId;

    const sourceMode = project.subtitleSource;
    const language = project.subtitleLanguage;
    const generatedCues: SubtitleCue[] = [];

    if (sourceMode === "voiceover" || sourceMode === "both") {
      if (project.voiceoverTrack.mediaId) {
        const voMedia = db.media.find(
          (m) => m.id === project.voiceoverTrack.mediaId,
        );
        const cues = transcribeAudioSource({
          sourceType: "voiceover",
          sourceMediaId: project.voiceoverTrack.mediaId,
          durationSec: voMedia?.durationSec ?? 8,
          language,
          sceneTitle: project.name,
        });
        generatedCues.push(...cues);
      }
    }

    if (sourceMode === "video" || sourceMode === "both") {
      for (const sc of project.scenes) {
        if (sc.kind === "video" && !sc.muted && sc.volume > 0) {
          const cues = transcribeAudioSource({
            sourceType: "video",
            sourceMediaId: sc.mediaId,
            durationSec: sc.trimEndSec - sc.trimStartSec,
            language,
            sceneTitle: sc.title,
          });
          generatedCues.push(...cues);
        }
      }
    }

    if (generatedCues.length === 0) {
      const fallbackVo = db.media.find((m) => m.id === "media-vo-batam");
      if (fallbackVo && !project.voiceoverTrack.mediaId) {
        project.voiceoverTrack.mediaId = fallbackVo.id;
      }
      const cues = transcribeAudioSource({
        sourceType: "voiceover",
        sourceMediaId: project.voiceoverTrack.mediaId || "media-vo-batam",
        durationSec: 8,
        language,
        sceneTitle: project.name,
      });
      generatedCues.push(...cues);
    }

    project.subtitles = generatedCues;
    project.subtitleStale = false;
    project.updatedAt = new Date().toISOString();
    saveDatabaseAtomic(db);

    res.json({
      project,
      generationId: nextGenId,
      completedSources: generatedCues.length,
    });
  });

  // 15. POST /api/projects/:id/export
  app.post("/api/projects/:id/export", (req, res) => {
    const project = db.projects.find((p) => p.id === req.params.id);
    if (!project) {
      res.status(404).json({ error: "Proyek tidak ditemukan" });
      return;
    }

    const existingActiveJob = db.renderJobs.find(
      (j) =>
        j.projectId === project.id &&
        (j.status === "queued" || j.status === "rendering"),
    );
    if (existingActiveJob) {
      res.json(existingActiveJob);
      return;
    }

    const resolution: "720p" | "1080p" =
      req.body?.resolution === "1080p" ? "1080p" : "720p";
    const fps: 24 | 30 = req.body?.fps === 24 ? 24 : 30;
    const burnInSubtitles =
      typeof req.body?.burnInSubtitles === "boolean"
        ? req.body.burnInSubtitles
        : project.subtitleBurnIn;
    const rawFileName =
      typeof req.body?.outputFileName === "string" &&
      req.body.outputFileName.trim()
        ? req.body.outputFileName.trim()
        : `${project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${resolution}.mp4`;
    const outputFileName = rawFileName.endsWith(".mp4")
      ? rawFileName
      : `${rawFileName}.mp4`;

    const frozenSnapshot = structuredClone(project);
    frozenSnapshot.subtitleBurnIn = burnInSubtitles;

    project.workflowStage = "exported";
    project.updatedAt = new Date().toISOString();

    const timeline = computeTimeline(frozenSnapshot, fps);
    const jobId = `render-${crypto.randomUUID().slice(0, 8)}`;
    const job: RenderJob = {
      id: jobId,
      projectId: project.id,
      projectName: project.name,
      status: "queued",
      progress: 5,
      stageLabel: "Dalam antrean...",
      resolution,
      fps,
      outputFileName,
      localFilePath: path.join("studio-data", "renders", `${jobId}.mp4`),
      burnInSubtitles,
      mp4Url: null,
      thumbUrl: "/files/media/ruko-nagoya.svg",
      srtUrl: null,
      vttUrl: null,
      durationSec: timeline.totalDurationSec,
      error: null,
      createdAt: new Date().toISOString(),
      completedAt: null,
    };

    db.renderJobs.unshift(job);
    db.projectSnapshots = db.projectSnapshots || {};
    db.projectSnapshots[job.id] = frozenSnapshot;
    saveDatabaseAtomic(db);

    enqueueRenderJob(job, frozenSnapshot);
    res.status(201).json(job);
  });

  // 16. POST /api/renders/:id/cancel
  app.post("/api/renders/:id/cancel", (req, res) => {
    const job = db.renderJobs.find((j) => j.id === req.params.id);
    if (!job) {
      res.status(404).json({ error: "Job render tidak ditemukan" });
      return;
    }
    const controller = activeRenderControllers.get(job.id);
    if (controller) {
      controller.abort();
    }
    job.status = "cancelled";
    job.stageLabel = "Dibatalkan";
    job.error = "Proses export dibatalkan oleh pengguna.";
    saveDatabaseAtomic(db);
    res.json(job);
  });

  // 17. POST /api/renders/:id/retry
  app.post("/api/renders/:id/retry", (req, res) => {
    const job = db.renderJobs.find((j) => j.id === req.params.id);
    if (!job) {
      res.status(404).json({ error: "Job render tidak ditemukan" });
      return;
    }
    const snapshot =
      db.projectSnapshots?.[job.id] ??
      db.projects.find((p) => p.id === job.projectId);
    if (!snapshot) {
      res.status(404).json({ error: "Snapshot proyek tidak ditemukan untuk dicoba ulang" });
      return;
    }

    job.status = "queued";
    job.progress = 5;
    job.stageLabel = "Mengulang render...";
    job.error = null;
    saveDatabaseAtomic(db);

    enqueueRenderJob(job, structuredClone(snapshot));
    res.json(job);
  });

  // 18. DELETE /api/renders/:id
  app.delete("/api/renders/:id", (req, res) => {
    const idx = db.renderJobs.findIndex((j) => j.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: "Hasil render tidak ditemukan" });
      return;
    }
    const job = db.renderJobs[idx];
    const controller = activeRenderControllers.get(job.id);
    if (controller) {
      controller.abort();
    }
    for (const ext of [".mp4", ".srt", ".vtt", ".jpg"]) {
      const fpath = path.join(RENDERS_DIR, `${job.id}${ext}`);
      if (fs.existsSync(fpath)) {
        try {
          fs.unlinkSync(fpath);
        } catch {
          // ignore
        }
      }
    }
    db.renderJobs.splice(idx, 1);
    saveDatabaseAtomic(db);
    res.json({ ok: true });
  });

  const isProd = process.env.NODE_ENV === "production";
  const distDir = path.join(ROOT_DIR, "dist");
  if (isProd && fs.existsSync(path.join(distDir, "index.html"))) {
    app.use(express.static(distDir));
    app.get("/{*splat}", (_req, res) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, "0.0.0.0", () => {
    console.log(`Batam Video Studio berjalan di http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error("Gagal menjalankan server Batam Video Studio:", err);
  process.exit(1);
});
