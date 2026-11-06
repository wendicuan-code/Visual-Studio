import React, { useState } from "react";
import {
  AlternativeCount,
  appendArchiveText,
  detectBriefConflicts,
  EditAnalysisEnvelope,
  extractPropertyFacts,
  PROMPT_EXAMPLES,
} from "../shared/edit-brief";
import {
  AspectRatio,
  Project,
  TEMPLATE_PRESETS,
  TemplateStyle,
} from "../shared/model";

export interface CreationBriefProps {
  project: Project;
  onUpdateProject: (updater: (prev: Project) => Project) => void;
  onDistributeText: () => Promise<void>;
  onApplyTemplate: (template: TemplateStyle) => Promise<void>;
  onAnalyzeBrief: () => Promise<void>;
  analyzing: boolean;
  distributing: boolean;
  textWarningsCount: number;
}

const SAMPLE_UNIT_FACTS = [
  "Nama & Lokasi: Ruko Komersial Nagoya Hill Blok A No. 12, Lubuk Baja, Batam",
  "Harga Penawaran: Rp 1.850.000.000",
  "Dimensi & Kamar: LT/LB 90/210 m2, 3 KT, 3 KM",
  "Fasilitas & Legalitas: UWTO 2045, Hadap Timur, Parkir Luas, Listrik 3500W",
  "Kontak Agen: Hendra Wijaya - WA 0812-7788-9900 (Batam Properti Utama)",
].join("\n");

export const CreationBrief: React.FC<CreationBriefProps> = ({
  project,
  onUpdateProject,
  onDistributeText,
  onApplyTemplate,
  onAnalyzeBrief,
  analyzing,
  distributing,
  textWarningsCount,
}) => {
  const [archiveTarget, setArchiveTarget] = useState<"unit" | "prompt">("unit");
  const [archiveMessage, setArchiveMessage] = useState<string | null>(null);

  const liveFacts = extractPropertyFacts(project.unitDescription);
  const liveConflicts = detectBriefConflicts(
    project.unitDescription,
    project.editPrompt,
  );
  const envelope: EditAnalysisEnvelope | null = project.lastAnalysisEnvelope;

  const hasLegacyArchive = Boolean(
    project.description.trim() || project.direction.trim(),
  );

  const handleCopyArchive = (sourceText: string, label: string) => {
    if (!sourceText.trim()) return;
    onUpdateProject((prev) => {
      if (archiveTarget === "unit") {
        return {
          ...prev,
          unitDescription: appendArchiveText(prev.unitDescription, sourceText),
        };
      }
      return {
        ...prev,
        editPrompt: appendArchiveText(prev.editPrompt, sourceText),
      };
    });
    setArchiveMessage(
      `${label} berhasil ditambahkan ke ${
        archiveTarget === "unit" ? "Deskripsi Unit" : "Perintah Editing AI"
      } tanpa menimpa teks yang ada.`,
    );
  };

  return (
    <div className="brief-stack">
      {/* 1. Deskripsi Unit (Fakta Properti) */}
      <section className="studio-section" aria-labelledby="heading-unit-desc">
        <div className="section-header-row">
          <div>
            <h2 id="heading-unit-desc" className="section-title">
              Deskripsi Unit (Fakta Properti)
            </h2>
            <p className="section-subtitle">
              Tulis fakta properti: nama, lokasi, harga (Rp), luas (LT/LB),
              kamar (KT/KM), fasilitas, legalitas (UWTO), dan kontak. AI wajib
              mempertahankan fakta ini tanpa mengarang spesifikasi.
            </p>
          </div>
          <div className="toolbar-left">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() =>
                onUpdateProject((prev) => ({
                  ...prev,
                  unitDescription: SAMPLE_UNIT_FACTS,
                }))
              }
            >
              Isi Contoh Fakta
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => void onDistributeText()}
              disabled={distributing || project.scenes.length === 0}
            >
              {distributing ? "Menyusun..." : "Susun Teks Adegan"}
            </button>
          </div>
        </div>

        <label htmlFor="unit-description-input" className="sr-only">
          Deskripsi Unit Faktual
        </label>
        <textarea
          id="unit-description-input"
          className="studio-textarea"
          rows={4}
          placeholder="Contoh:&#10;Harga Penawaran: Rp 1.850.000.000&#10;Dimensi: LT/LB 90/210 m2, 3 KT, 3 KM&#10;Legalitas: UWTO 2045, Hadap Timur"
          value={project.unitDescription}
          onChange={(e) => {
            const val = e.target.value;
            onUpdateProject((prev) => ({
              ...prev,
              unitDescription: val,
            }));
          }}
        />

        <div className="fact-summary-line">
          <span className="fact-summary-label">Fakta Terkunci:</span>
          <span>Harga: {liveFacts.hargaRp ?? "Belum ditulis"}</span>
          <span aria-hidden="true">·</span>
          <span>LT/LB: {liveFacts.ltLb ?? "Belum ditulis"}</span>
          <span aria-hidden="true">·</span>
          <span>
            Kamar: {liveFacts.kamarTidur ?? "-"} / {liveFacts.kamarMandi ?? "-"}
          </span>
          <span aria-hidden="true">·</span>
          <span>UWTO: {liveFacts.uwto ?? "-"}</span>
          <span aria-hidden="true">·</span>
          <span>Hadap: {liveFacts.hadap ?? "-"}</span>
        </div>

        {textWarningsCount > 0 && (
          <div className="notice-banner notice-warning" role="status">
            Peringatan: Terdapat {textWarningsCount} adegan dengan teks lebih
            dari 90 karakter. Tinjau tab Teks agar tetap nyaman dibaca.
          </div>
        )}

        {hasLegacyArchive && (
          <div className="legacy-archive-box">
            <div className="legacy-archive-header">
              <span className="legacy-archive-title">
                Arsip Teks Lama (Migrasi Aman)
              </span>
              <div className="legacy-archive-controls">
                <label
                  htmlFor="archive-target-select"
                  className="field-label-inline"
                >
                  Salin ke:
                </label>
                <select
                  id="archive-target-select"
                  className="studio-select studio-select-sm"
                  value={archiveTarget}
                  onChange={(e) =>
                    setArchiveTarget(e.target.value as "unit" | "prompt")
                  }
                >
                  <option value="unit">Deskripsi Unit</option>
                  <option value="prompt">Perintah Editing AI</option>
                </select>
              </div>
            </div>
            {project.description.trim() && (
              <div className="legacy-archive-item">
                <p className="legacy-archive-text">{project.description}</p>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() =>
                    handleCopyArchive(project.description, "Arsip Deskripsi")
                  }
                >
                  Tambahkan Arsip Deskripsi
                </button>
              </div>
            )}
            {project.direction.trim() && (
              <div className="legacy-archive-item">
                <p className="legacy-archive-text">{project.direction}</p>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() =>
                    handleCopyArchive(project.direction, "Arsip Arahan")
                  }
                >
                  Tambahkan Arsip Arahan
                </button>
              </div>
            )}
            {archiveMessage && (
              <p className="legacy-archive-feedback">{archiveMessage}</p>
            )}
          </div>
        )}
      </section>

      {/* 2. Perintah Editing AI (Instruksi Kreatif + Contoh Prompt) */}
      <section className="studio-section" aria-labelledby="heading-edit-prompt">
        <div className="section-header-row">
          <div>
            <h2 id="heading-edit-prompt" className="section-title">
              Perintah Editing AI (Instruksi Kreatif)
            </h2>
            <p className="section-subtitle">
              Instruksi gaya, suasana, tempo, durasi, urutan adegan, dan target
              penonton. Klik contoh prompt di bawah untuk mengisi &amp; mengedit.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void onAnalyzeBrief()}
            disabled={analyzing}
          >
            {analyzing
              ? "Menyusun Konsep..."
              : "Buat 3 Konsep AI (A/B/C)"}
          </button>
        </div>

        <div className="prompt-examples-bar">
          <span className="field-label-inline">Contoh Prompt:</span>
          {PROMPT_EXAMPLES.map((ex) => (
            <button
              key={ex.id}
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() =>
                onUpdateProject((prev) => ({
                  ...prev,
                  editPrompt: ex.prompt,
                }))
              }
            >
              + {ex.label}
            </button>
          ))}
        </div>

        <label htmlFor="edit-prompt-input" className="sr-only">
          Perintah Editing AI
        </label>
        <textarea
          id="edit-prompt-input"
          className="studio-textarea"
          rows={3}
          placeholder="Contoh: Gunakan transisi halus, tonjolkan fasad ruko di adegan pembuka, dan jaga teks tetap ringkas."
          value={project.editPrompt}
          onChange={(e) => {
            const val = e.target.value;
            onUpdateProject((prev) => ({
              ...prev,
              editPrompt: val,
            }));
          }}
        />

        {liveConflicts.length > 0 && (
          <div className="conflict-alert-box" role="alert">
            <div className="conflict-alert-title">
              Konflik Fakta Terdeteksi ({liveConflicts.length}) — Fakta Unit
              Tetap Dipertahankan
            </div>
            <ul className="conflict-list">
              {liveConflicts.map((c) => (
                <li key={c.field}>{c.message}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* 3. Style dan Pengaturan Video */}
      <section className="studio-section" aria-labelledby="heading-style-config">
        <h2 id="heading-style-config" className="section-title">
          Preset Gaya &amp; Rasio Video Properti
        </h2>
        <p className="section-subtitle">
          Preset gerakan halus, transisi sederhana, warna natural, dan rasio
          multi-platform (9:16, 16:9, 1:1).
        </p>

        <div className="template-grid">
          {(Object.keys(TEMPLATE_PRESETS) as TemplateStyle[]).map((tplKey) => {
            const preset = TEMPLATE_PRESETS[tplKey];
            const active = project.template === tplKey;
            return (
              <button
                key={tplKey}
                type="button"
                className={`template-card ${
                  active ? "template-card-active" : ""
                }`}
                onClick={() => void onApplyTemplate(tplKey)}
              >
                <div className="template-card-top">
                  <span className="template-card-name">{preset.label}</span>
                  <span
                    className="template-color-dot"
                    style={{ backgroundColor: preset.textStyle.accentColor }}
                  />
                </div>
                <p className="template-card-desc">{preset.tagline}</p>
              </button>
            );
          })}
        </div>

        <div className="form-row-2col">
          <div className="field-group">
            <label htmlFor="aspect-ratio-select" className="field-label">
              Rasio Video (Mendukung Penyesuaian Komposisi per Adegan)
            </label>
            <select
              id="aspect-ratio-select"
              className="studio-select"
              value={project.aspectRatio}
              onChange={(e) => {
                const ratio = e.target.value as AspectRatio;
                onUpdateProject((prev) => ({
                  ...prev,
                  aspectRatio: ratio,
                }));
              }}
            >
              <option value="9:16">
                9:16 Vertikal (Reels / TikTok / Shorts)
              </option>
              <option value="16:9">
                16:9 Horizontal (YouTube / Presentasi TV)
              </option>
              <option value="1:1">1:1 Persegi (Feed Katalog)</option>
            </select>
          </div>

          <div className="field-group">
            <span className="field-label">Jumlah Variasi Konsep AI</span>
            <div
              className="segmented-control"
              role="group"
              aria-label="Jumlah Alternatif"
            >
              {([1, 3] as AlternativeCount[]).map((count) => (
                <button
                  key={count}
                  type="button"
                  className={`segment-btn ${
                    project.alternativeCount === count
                      ? "segment-btn-active"
                      : ""
                  }`}
                  onClick={() =>
                    onUpdateProject((prev) => ({
                      ...prev,
                      alternativeCount: count,
                    }))
                  }
                >
                  {count} Konsep {count === 3 ? "(A/B/C Lengkap)" : ""}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 4. Ringkasan Batasan & Status Analisis */}
      {envelope && (
        <section className="studio-section" aria-labelledby="heading-edit-plan">
          <h2 id="heading-edit-plan" className="section-title">
            Status Kuncian Fakta &amp; Mesin Analisis
          </h2>
          <div className="analysis-plan-box">
            <div className="analysis-meta-line">
              <span>Peran Fakta: sumber_fakta_unit</span>
              <span aria-hidden="true">·</span>
              <span>Peran Arahan: arahan_pengeditan</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">
                Variasi Konsep: {project.aiConcepts?.length || 3} Pilihan (A/B/C)
              </span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">
                Media Adegan: {project.scenes.length} klip
              </span>
            </div>

            <div className="provider-status-box">
              <div className="provider-status-title">
                {envelope.providerStatus.title}
              </div>
              <p className="provider-status-detail">
                {envelope.providerStatus.detail}
              </p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};
