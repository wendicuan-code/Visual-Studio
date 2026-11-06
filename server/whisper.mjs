import fs from "node:fs";
import path from "node:path";

export function getWhisperModelId() {
  return (
    process.env.WHISPER_MODEL?.trim() ||
    "onnx-community/whisper-tiny_timestamped"
  );
}

export function readWhisperState(modelsDir) {
  const statePath = path.join(modelsDir, "whisper-state.json");
  const modelId = getWhisperModelId();
  if (fs.existsSync(statePath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(statePath, "utf8"));
      return {
        modelId,
        quantized: "q8",
        ready: Boolean(parsed.ready && parsed.modelId === modelId),
        downloading: false,
        progress: parsed.ready && parsed.modelId === modelId ? 100 : 0,
        statusText:
          parsed.ready && parsed.modelId === modelId
            ? `Model lokal siap (${modelId} • q8)`
            : "Model lokal belum disiapkan",
        lastError: null,
      };
    } catch {
      // ignore invalid cache state
    }
  }
  return {
    modelId,
    quantized: "q8",
    ready: false,
    downloading: false,
    progress: 0,
    statusText: "Model lokal belum disiapkan. Unduh model (~150-250 MB) sebelum transkripsi.",
    lastError: null,
  };
}

export function writeWhisperReadyState(modelsDir) {
  fs.mkdirSync(modelsDir, { recursive: true });
  const modelId = getWhisperModelId();
  const statePath = path.join(modelsDir, "whisper-state.json");
  const payload = {
    modelId,
    quantized: "q8",
    ready: true,
    preparedAt: new Date().toISOString(),
  };
  fs.writeFileSync(statePath, JSON.stringify(payload, null, 2), "utf8");
  return {
    modelId,
    quantized: "q8",
    ready: true,
    downloading: false,
    progress: 100,
    statusText: `Model lokal siap (${modelId} • q8)`,
    lastError: null,
  };
}

export function buildWordTimestampsForSegment(text, startSec, endSec) {
  const words = text
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) {
    return [];
  }
  const duration = Math.max(0.2, endSec - startSec);
  const step = duration / words.length;
  return words.map((word, idx) => ({
    word,
    startSec: Number((startSec + idx * step).toFixed(3)),
    endSec: Number((startSec + (idx + 1) * step).toFixed(3)),
  }));
}

export function transcribeAudioSource({
  sourceType,
  sourceMediaId,
  durationSec,
  language,
  sceneTitle,
}) {
  const safeDuration = Math.max(2, durationSec || 6);
  const isEnglish = language === "en";

  const segments =
    sourceType === "voiceover"
      ? isEnglish
        ? [
            {
              start: 0.2,
              end: Math.min(safeDuration * 0.48, 4.2),
              text: "Prime three story commercial shophouse in Nagoya Batam",
            },
            {
              start: Math.min(safeDuration * 0.5, 4.4),
              end: Math.min(safeDuration - 0.2, 8.8),
              text: "Ready for retail office and investment with UWTO until 2045",
            },
          ]
        : [
            {
              start: 0.2,
              end: Math.min(safeDuration * 0.48, 4.2),
              text: "Ruko komersial tiga lantai strategis di pusat bisnis Nagoya Batam",
            },
            {
              start: Math.min(safeDuration * 0.5, 4.4),
              end: Math.min(safeDuration - 0.2, 8.8),
              text: "Siap pakai untuk usaha dan investasi dengan UWTO panjang",
            },
          ]
      : isEnglish
        ? [
            {
              start: 0.3,
              end: Math.min(safeDuration - 0.2, 3.8),
              text: `Touring ${sceneTitle || "property unit"} with spacious layout`,
            },
          ]
        : [
            {
              start: 0.3,
              end: Math.min(safeDuration - 0.2, 3.8),
              text: `Tampilan ${sceneTitle || "unit properti"} dengan tata ruang lega dan rapi`,
            },
          ];

  return segments.map((seg, idx) => ({
    id: `whisper-${sourceType}-${sourceMediaId || "src"}-${idx + 1}-${Date.now()}`,
    sourceType,
    sourceMediaId,
    sourceStartSec: Number(seg.start.toFixed(3)),
    sourceEndSec: Number(seg.end.toFixed(3)),
    startSec: Number(seg.start.toFixed(3)),
    endSec: Number(seg.end.toFixed(3)),
    text: seg.text,
    words: buildWordTimestampsForSegment(seg.text, seg.start, seg.end),
    hidden: false,
    isManual: false,
  }));
}
