import { z } from "zod";

export const AlternativeCountSchema = z.union([z.literal(1), z.literal(3)]);
export type AlternativeCount = z.infer<typeof AlternativeCountSchema>;

export const ConceptVariantIdSchema = z.enum(["A", "B", "C"]);
export type ConceptVariantId = z.infer<typeof ConceptVariantIdSchema>;

export interface PromptExampleItem {
  id: string;
  label: string;
  prompt: string;
}

export const PROMPT_EXAMPLES: PromptExampleItem[] = [
  {
    id: "informatif-lengkap",
    label: "Informatif Lengkap",
    prompt:
      "Susun alur informatif mulai dari fasad depan, ruang tamu, hingga kamar dan legalitas UWTO. Gunakan tempo tenang dan teks mudah dibaca untuk keluarga maupun investor.",
  },
  {
    id: "sinematik-elegan",
    label: "Sinematik Mewah",
    prompt:
      "Gunakan gaya sinematik elegan dengan gerakan zoom halus, transisi fade lembut, dan suasana hangat untuk menonjolkan tata ruang properti.",
  },
  {
    id: "promosi-cepat",
    label: "Promosi Cepat Reels/TikTok",
    prompt:
      "Buat video promosi cepat berdurasi singkat untuk Reels/TikTok, tampilkan keunggulan utama dan harga di awal, utamakan fasad dan ruang tamu.",
  },
  {
    id: "fokus-investasi",
    label: "Fokus Komersial & ROI",
    prompt:
      "Tonjolkan nilai komersial lokasi strategis, dimensi bangunan, dan masa berlaku UWTO untuk target pembeli bisnis dan penyewa ritel.",
  },
];

export const ASSISTANT_COMMAND_EXAMPLES: string[] = [
  "Persingkat jadi 30 detik.",
  "Utamakan fasad dan ruang tamu.",
  "Perbesar tulisan harga.",
  "Kurangi transisi.",
  "Turunkan musik saat narasi berbicara.",
];

export interface LegacyBriefRecord {
  description?: string;
  direction?: string;
  unitDescription?: string;
  editPrompt?: string;
  alternativeCount?: number;
}

export interface MigratedBriefFields {
  description: string;
  direction: string;
  unitDescription: string;
  editPrompt: string;
  alternativeCount: AlternativeCount;
}

/**
 * Migrasi hanya menambahkan field kosong bila belum ada;
 * tidak menebak atau memisahkan isi `description` dan `direction` lama.
 */
export function migrateLegacyBriefFields(
  input: LegacyBriefRecord,
): MigratedBriefFields {
  const alt = input.alternativeCount === 1 ? 1 : 3;
  return {
    description: typeof input.description === "string" ? input.description : "",
    direction: typeof input.direction === "string" ? input.direction : "",
    unitDescription:
      typeof input.unitDescription === "string" ? input.unitDescription : "",
    editPrompt: typeof input.editPrompt === "string" ? input.editPrompt : "",
    alternativeCount: alt,
  };
}

/**
 * Menyalin teks arsip ke kolom tujuan dengan menambahkan di baris baru
 * tanpa menimpa isian yang sudah ada.
 */
export function appendArchiveText(existing: string, snippet: string): string {
  const cleanSnippet = snippet.trim();
  if (!cleanSnippet) {
    return existing;
  }
  const cleanExisting = existing.trim();
  if (!cleanExisting) {
    return cleanSnippet;
  }
  return `${cleanExisting}\n${cleanSnippet}`;
}

export interface ExtractedPropertyFacts {
  hargaRp: string | null;
  ltLb: string | null;
  kamarTidur: string | null;
  kamarMandi: string | null;
  uwto: string | null;
  hadap: string | null;
}

function normalizeFactValue(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Mengekstrak fakta yang tertulis jelas pada teks:
 * - Harga berlabel Rp
 * - LT/LB
 * - Jumlah kamar tidur (KT / Kamar Tidur)
 * - Jumlah kamar mandi (KM / Kamar Mandi)
 * - UWTO (tahun atau durasi)
 * - Arah hadap
 */
export function extractPropertyFacts(text: string): ExtractedPropertyFacts {
  const hargaMatch = text.match(
    /\bRp\.?\s*([0-9][0-9.,]*(?:\s*(?:juta|jt|miliar|milyar|m))?)/i,
  );
  const ltLbMatch =
    text.match(
      /\bLT\s*\/\s*LB\s*[:=]?\s*([0-9]+\s*(?:m2|m²)?\s*\/\s*[0-9]+\s*(?:m2|m²)?)/i,
    ) ??
    text.match(
      /\bLT\s*([0-9]+)\s*(?:m2|m²)?\s*[/,-]?\s*LB\s*([0-9]+)\s*(?:m2|m²)?/i,
    );

  const ktMatch =
    text.match(/\b([0-9]+)\s*(?:KT|kamar\s+tidur)\b/i) ??
    text.match(/\bkamar\s+tidur\s*[:=]?\s*([0-9]+)\b/i);

  const kmMatch =
    text.match(/\b([0-9]+)\s*(?:KM|kamar\s+mandi)\b/i) ??
    text.match(/\bkamar\s+mandi\s*[:=]?\s*([0-9]+)\b/i);

  const uwtoMatch = text.match(
    /\bUWTO\s*(?:s\/d|sampai(?:\s+dengan)?|hingga|thn|tahun|:)?\s*([0-9]{2,4})/i,
  );

  const hadapMatch = text.match(
    /\bhadap\s*[:=]?\s*(utara|selatan|timur|barat(?:\s+laut|\s+daya)?|timur\s+laut|tenggara)\b/i,
  );

  let ltLbValue: string | null = null;
  if (ltLbMatch) {
    if (ltLbMatch[2]) {
      ltLbValue = `${ltLbMatch[1]}/${ltLbMatch[2]}`;
    } else if (ltLbMatch[1]) {
      ltLbValue = ltLbMatch[1].replace(/\s+/g, "");
    }
  }

  return {
    hargaRp: hargaMatch ? `Rp ${hargaMatch[1].trim()}` : null,
    ltLb: ltLbValue,
    kamarTidur: ktMatch ? `${ktMatch[1]} KT` : null,
    kamarMandi: kmMatch ? `${kmMatch[1]} KM` : null,
    uwto: uwtoMatch ? `UWTO ${uwtoMatch[1]}` : null,
    hadap: hadapMatch ? `Hadap ${hadapMatch[1].trim()}` : null,
  };
}

export interface FactConflictItem {
  field: keyof ExtractedPropertyFacts;
  label: string;
  unitFact: string;
  promptFact: string;
  message: string;
}

/**
 * Membandingkan fakta eksplisit antara `unitDescription` (sumber fakta)
 * dan `editPrompt` (arahan pengeditan). Bila keduanya menyebutkan fakta
 * pada kategori yang sama namun berbeda, ditandai sebagai konflik.
 */
export function detectBriefConflicts(
  unitDescription: string,
  editPrompt: string,
): FactConflictItem[] {
  const unitFacts = extractPropertyFacts(unitDescription);
  const promptFacts = extractPropertyFacts(editPrompt);

  const labels: Record<keyof ExtractedPropertyFacts, string> = {
    hargaRp: "Harga (Rp)",
    ltLb: "Luas Tanah / Bangunan (LT/LB)",
    kamarTidur: "Kamar Tidur",
    kamarMandi: "Kamar Mandi",
    uwto: "Masa UWTO",
    hadap: "Arah Hadap",
  };

  const conflicts: FactConflictItem[] = [];
  const keys = Object.keys(labels) as Array<keyof ExtractedPropertyFacts>;

  for (const key of keys) {
    const uVal = unitFacts[key];
    const pVal = promptFacts[key];
    if (uVal && pVal) {
      const normU = normalizeFactValue(uVal).replace(/\./g, "");
      const normP = normalizeFactValue(pVal).replace(/\./g, "");
      if (normU !== normP) {
        conflicts.push({
          field: key,
          label: labels[key],
          unitFact: uVal,
          promptFact: pVal,
          message: `Konflik ${labels[key]}: Deskripsi Unit mencatat "${uVal}", sedangkan Perintah Edit AI menulis "${pVal}". Perubahan fakta dari prompt ditolak.`,
        });
      }
    }
  }

  return conflicts;
}

export interface AiConceptScenePlan {
  sceneId: string;
  mediaId: string;
  roomLabel: string;
  prioritized: boolean;
  durationSec: number;
  screenTitle: string;
  screenText: string;
  narrationLine: string;
  motion: "none" | "zoom-in" | "zoom-out" | "pan-left" | "pan-right";
  transitionIn: "none" | "fade" | "slide" | "wipe";
  transitionDurationSec: number;
}

export interface AiVideoConcept {
  id: ConceptVariantId;
  title: string;
  subtitle: string;
  template: "properti-elegan" | "minimalis" | "promosi-dinamis";
  hook: string;
  narrationScript: string;
  estimatedDurationSec: number;
  storyboard: AiConceptScenePlan[];
  generatedBy: "gemini-online" | "lokal-deterministik";
  updatedAt: string;
}

export interface EditAnalysisEnvelope {
  analyzedAt: string;
  projectId: string;
  alternativeCount: AlternativeCount;
  inputs: {
    sumber_fakta_unit: string;
    arahan_pengeditan: string;
  };
  extractedFacts: ExtractedPropertyFacts;
  conflicts: FactConflictItem[];
  constraints: {
    factualLock: boolean;
    sameMediaPool: boolean;
    explicitVariationOnly: boolean;
    protectPriceAndContact: boolean;
    forbidAutoRender: boolean;
    mediaSceneCount: number;
  };
  providerStatus: {
    available: boolean;
    code: "AI_CONCEPTS_READY" | "AI_EDIT_PROVIDER_NOT_IMPLEMENTED";
    mode: "gemini-online" | "lokal-deterministik";
    title: string;
    detail: string;
  };
}

export function buildEditAnalysisEnvelope(params: {
  projectId: string;
  unitDescription: string;
  editPrompt: string;
  alternativeCount: AlternativeCount;
  mediaSceneCount: number;
  aiOnlineAvailable?: boolean;
}): EditAnalysisEnvelope {
  const extractedFacts = extractPropertyFacts(params.unitDescription);
  const conflicts = detectBriefConflicts(
    params.unitDescription,
    params.editPrompt,
  );
  const isOnline = Boolean(params.aiOnlineAvailable);

  return {
    analyzedAt: new Date().toISOString(),
    projectId: params.projectId,
    alternativeCount: params.alternativeCount,
    inputs: {
      sumber_fakta_unit: params.unitDescription,
      arahan_pengeditan: params.editPrompt,
    },
    extractedFacts,
    conflicts,
    constraints: {
      factualLock: true,
      sameMediaPool: true,
      explicitVariationOnly: true,
      protectPriceAndContact: true,
      forbidAutoRender: true,
      mediaSceneCount: params.mediaSceneCount,
    },
    providerStatus: {
      available: isOnline,
      code: isOnline
        ? "AI_CONCEPTS_READY"
        : "AI_EDIT_PROVIDER_NOT_IMPLEMENTED",
      mode: isOnline ? "gemini-online" : "lokal-deterministik",
      title: isOnline
        ? "Layanan AI Gemini Aktif + Pemeriksaan Fakta Lokal"
        : "Mode Konsep Terstruktur Lokal (Tanpa Mengarang Fakta)",
      detail: isOnline
        ? "Konsep A/B/C disusun dengan mematuhi kuncian fakta Deskripsi Unit dan siap diterapkan ke timeline tanpa merender tiga video penuh."
        : "Envelope analisis lokal (sumber_fakta_unit & arahan_pengeditan) menyusun Konsep A (Informatif), B (Sinematik), dan C (Promosi Cepat) secara deterministik dari fakta unit Anda tanpa mengarang spesifikasi atau menjalankan render otomatis.",
    },
  };
}
