import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Player, PlayerRef } from "@remotion/player";
import { StudioVideo } from "../src/StudioVideo";
import { CreationBrief } from "./CreationBrief";
import {
  AiVideoConcept,
  ASSISTANT_COMMAND_EXAMPLES,
  ConceptVariantId,
} from "../shared/edit-brief";
import {
  AiEditCommandProposal,
  AspectRatio,
  computeTimeline,
  FitMode,
  formatSrt,
  formatVtt,
  getDimensionsForAspectRatio,
  getSceneCompositionForAspect,
  mapSourceSubtitlesToTimeline,
  MediaItem,
  mergeSubtitleCues,
  Project,
  RenderJob,
  ROOM_LABEL_PRESETS,
  SCENE_TEXT_WARN_LENGTH,
  SceneItem,
  SceneMotion,
  splitSceneAtMidpoint,
  splitSubtitleCue,
  SubtitleCue,
  TemplateStyle,
  TransitionType,
  updateSubtitleCueText,
  WhisperModelStatus,
} from "../shared/model";

type MainViewMode = "home" | "studio" | "renders";
type StudioStep = "input" | "concepts" | "editor";
type ManualEditorTab = "scenes" | "text" | "logo" | "audio" | "subtitles";

const WORKFLOW_STAGE_LABELS: Record<Project["workflowStage"], string> = {
  input: "1. Input Media & Informasi",
  concepts: "2. Konsep AI Siap",
  editor: "3. Sedang Diedit di Timeline",
  exported: "4. Sudah Diexport",
};

export const App: React.FC = () => {
  const [viewMode, setViewMode] = useState<MainViewMode>("studio");
  const [studioStep, setStudioStep] = useState<StudioStep>("input");
  const [activeTab, setActiveTab] = useState<ManualEditorTab>("scenes");

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [mediaList, setMediaList] = useState<MediaItem[]>([]);
  const [renderJobs, setRenderJobs] = useState<RenderJob[]>([]);
  const [whisperStatus, setWhisperStatus] = useState<WhisperModelStatus | null>(
    null,
  );
  const [aiOnlineAvailable, setAiOnlineAvailable] = useState<boolean>(false);

  // Undo / Redo history per project
  const [undoStack, setUndoStack] = useState<Project[]>([]);
  const [redoStack, setRedoStack] = useState<Project[]>([]);

  const [selectedSceneId, setSelectedSceneId] = useState<string>("");
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [uploadProgressText, setUploadProgressText] = useState<string | null>(
    null,
  );
  const [distributingText, setDistributingText] = useState(false);
  const [analyzingBrief, setAnalyzingBrief] = useState(false);
  const [regeneratingVariant, setRegeneratingVariant] =
    useState<ConceptVariantId | null>(null);
  const [editingConceptId, setEditingConceptId] =
    useState<ConceptVariantId | null>(null);
  const [transcribing, setTranscribing] = useState(false);

  // Asisten Editing AI state
  const [assistantCommand, setAssistantCommand] = useState(
    "Persingkat jadi 30 detik.",
  );
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [pendingProposal, setPendingProposal] =
    useState<AiEditCommandProposal | null>(null);

  // Preview quality & Safe Area
  const [showSafeArea, setShowSafeArea] = useState<boolean>(false);
  const [previewQuality, setPreviewQuality] = useState<"proxy" | "full">(
    "proxy",
  );

  // Konfirmasi dialog state
  const [showWhisperConfirm, setShowWhisperConfirm] = useState(false);
  const [showRegenConfirm, setShowRegenConfirm] = useState(false);
  const [confirmDeleteRenderId, setConfirmDeleteRenderId] = useState<
    string | null
  >(null);
  const [confirmDeleteProjectId, setConfirmDeleteProjectId] = useState<
    string | null
  >(null);
  const [newProjectModalOpen, setNewProjectModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");

  // Export settings
  const [exportResolution, setExportResolution] = useState<"720p" | "1080p">(
    "720p",
  );
  const [exportFps, setExportFps] = useState<24 | 30>(30);
  const [exportFileName, setExportFileName] = useState(
    "video-properti-batam.mp4",
  );
  const [playingRenderJob, setPlayingRenderJob] = useState<RenderJob | null>(
    null,
  );

  const playerRef = useRef<PlayerRef>(null);
  const autosaveTimerRef = useRef<number | null>(null);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch("/api/state");
      if (!res.ok) return;
      const data = await res.json();
      setProjects(data.projects || []);
      setMediaList(data.media || []);
      setRenderJobs(data.renderJobs || []);
      setWhisperStatus(data.whisperStatus || null);
      setAiOnlineAvailable(Boolean(data.aiOnlineAvailable));

      if (data.projects?.length > 0 && !selectedProjectId) {
        const first = data.projects[0] as Project;
        setSelectedProjectId(first.id);
        setSelectedSceneId(first.scenes[0]?.id || "");
        setExportFileName(
          `${first.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.mp4`,
        );
      }
    } catch {
      // ignore transient network errors
    }
  }, [selectedProjectId]);

  useEffect(() => {
    void fetchState();
  }, [fetchState]);

  useEffect(() => {
    const hasActiveJob = renderJobs.some(
      (j) => j.status === "queued" || j.status === "rendering",
    );
    if (!hasActiveJob) return;
    const interval = window.setInterval(() => {
      void fetchState();
    }, 1000);
    return () => window.clearInterval(interval);
  }, [renderJobs, fetchState]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  const activeProject = useMemo(
    () =>
      projects.find((p) => p.id === selectedProjectId) ?? projects[0] ?? null,
    [projects, selectedProjectId],
  );

  const mediaMap = useMemo(() => {
    const map: Record<string, MediaItem> = {};
    for (const m of mediaList) {
      map[m.id] = m;
    }
    return map;
  }, [mediaList]);

  const saveProjectNow = useCallback(async (projectToSave: Project) => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectToSave.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(projectToSave),
      });
      if (res.ok) {
        const saved = (await res.json()) as Project;
        setProjects((prev) =>
          prev.map((p) => (p.id === saved.id ? saved : p)),
        );
        setIsDirty(false);
        setLastSavedAt(
          new Date().toLocaleTimeString("id-ID", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }),
        );
      }
    } finally {
      setIsSaving(false);
    }
  }, []);

  const scheduleAutosave = useCallback(
    (nextProject: Project) => {
      setIsDirty(true);
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
      }
      autosaveTimerRef.current = window.setTimeout(() => {
        void saveProjectNow(nextProject);
      }, 1300);
    },
    [saveProjectNow],
  );

  const handleUpdateProject = useCallback(
    (
      updater: (prev: Project) => Project,
      options?: { recordUndo?: boolean },
    ) => {
      const shouldRecordUndo = options?.recordUndo ?? true;
      setProjects((prev) => {
        const current =
          prev.find((p) => p.id === selectedProjectId) ?? prev[0];
        if (!current) return prev;
        if (shouldRecordUndo) {
          setUndoStack((u) => [...u.slice(-24), structuredClone(current)]);
          setRedoStack([]);
        }
        const next = updater(current);
        scheduleAutosave(next);
        return prev.map((p) => (p.id === next.id ? next : p));
      });
    },
    [selectedProjectId, scheduleAutosave],
  );

  const handleUndo = () => {
    if (undoStack.length === 0 || !activeProject) return;
    const previous = undoStack[undoStack.length - 1];
    setUndoStack((u) => u.slice(0, -1));
    setRedoStack((r) => [...r, structuredClone(activeProject)]);
    setProjects((prev) =>
      prev.map((p) => (p.id === previous.id ? previous : p)),
    );
    scheduleAutosave(previous);
    setStatusBanner("Perubahan terakhir dibatalkan (Undo).");
  };

  const handleRedo = () => {
    if (redoStack.length === 0 || !activeProject) return;
    const nextState = redoStack[redoStack.length - 1];
    setRedoStack((r) => r.slice(0, -1));
    setUndoStack((u) => [...u, structuredClone(activeProject)]);
    setProjects((prev) =>
      prev.map((p) => (p.id === nextState.id ? nextState : p)),
    );
    scheduleAutosave(nextState);
    setStatusBanner("Perubahan diterapkan kembali (Redo).");
  };

  const handleSwitchView = async (
    targetView: MainViewMode,
    targetStep?: StudioStep,
  ) => {
    if (isDirty && activeProject) {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
      }
      await saveProjectNow(activeProject);
    }
    setViewMode(targetView);
    if (targetStep) {
      setStudioStep(targetStep);
    }
  };

  const handleCreateNewProject = async () => {
    const name = newProjectName.trim() || "Proyek Video Batam Baru";
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, template: "properti-elegan" }),
    });
    if (res.ok) {
      const created = (await res.json()) as Project;
      setProjects((prev) => [created, ...prev]);
      setSelectedProjectId(created.id);
      setSelectedSceneId(created.scenes[0]?.id || "");
      setUndoStack([]);
      setRedoStack([]);
      setNewProjectModalOpen(false);
      setNewProjectName("");
      setViewMode("studio");
      setStudioStep("input");
      setStatusBanner(
        `Proyek "${created.name}" berhasil dibuat. Silakan lengkapi media dan informasi unit.`,
      );
    }
  };

  const handleDuplicateProject = async (projId?: string) => {
    const targetId = projId || activeProject?.id;
    if (!targetId) return;
    const res = await fetch(`/api/projects/${targetId}/duplicate`, {
      method: "POST",
    });
    if (res.ok) {
      const copy = (await res.json()) as Project;
      setProjects((prev) => [copy, ...prev]);
      setSelectedProjectId(copy.id);
      setStatusBanner(`Salinan proyek "${copy.name}" berhasil dibuat.`);
    }
  };

  const handleDeleteProject = async (id: string) => {
    const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
    if (res.ok) {
      const remaining = projects.filter((p) => p.id !== id);
      setProjects(remaining);
      setConfirmDeleteProjectId(null);
      if (remaining.length > 0) {
        setSelectedProjectId(remaining[0].id);
        setSelectedSceneId(remaining[0].scenes[0]?.id || "");
      }
      setStatusBanner(
        "Proyek berhasil dihapus. File media asli dan hasil render tetap aman.",
      );
    }
  };

  const handleUploadFiles = async (
    files: FileList | null,
    forcedKind?: "image" | "video" | "audio" | "logo",
  ) => {
    if (!files || files.length === 0 || !activeProject) return;
    setUploadingMedia(true);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setUploadProgressText(
        `Mengunggah (${i + 1}/${files.length}): ${file.name}...`,
      );
      const form = new FormData();
      form.append("file", file);
      if (forcedKind) {
        form.append("kind", forcedKind);
      }

      const res = await fetch("/api/media/upload", {
        method: "POST",
        body: form,
      });
      if (res.ok) {
        const uploaded = (await res.json()) as MediaItem;
        setMediaList((prev) => [uploaded, ...prev]);

        if (uploaded.kind === "image" || uploaded.kind === "video") {
          const newScene: SceneItem = {
            id: `scene-${Date.now()}-${i}`,
            mediaId: uploaded.id,
            kind: uploaded.kind,
            roomLabel:
              activeProject.scenes.length === 0 ? "Fasad Utama" : "Ruang Tamu",
            prioritized: activeProject.scenes.length < 2,
            title: uploaded.originalName.replace(/\.[^.]+$/, ""),
            bodyText: "Teks adegan unit properti",
            durationSec: 4,
            trimStartSec: 0,
            trimEndSec: uploaded.durationSec || 4,
            volume: 1,
            muted: false,
            fitMode: "cover",
            positionX: 0,
            positionY: 0,
            zoomScale: 1,
            motion: "zoom-in",
            transitionIn: activeProject.scenes.length > 0 ? "fade" : "none",
            transitionDurationSec: activeProject.scenes.length > 0 ? 0.5 : 0,
          };
          handleUpdateProject((prev) => ({
            ...prev,
            scenes: [...prev.scenes, newScene],
            subtitleStale:
              uploaded.kind === "video" ? true : prev.subtitleStale,
          }));
          setSelectedSceneId(newScene.id);
        } else if (uploaded.kind === "logo") {
          handleUpdateProject((prev) => ({
            ...prev,
            logoContact: {
              ...prev.logoContact,
              logoMediaId: uploaded.id,
            },
          }));
        } else if (uploaded.kind === "audio") {
          handleUpdateProject((prev) => ({
            ...prev,
            voiceoverTrack: prev.voiceoverTrack.mediaId
              ? prev.voiceoverTrack
              : { ...prev.voiceoverTrack, mediaId: uploaded.id },
          }));
        }
      }
    }

    setUploadProgressText(null);
    setUploadingMedia(false);
    setStatusBanner("Media selesai diproses dan ditambahkan ke proyek.");
  };

  const handleAddSamplePresetScene = async (preset: string) => {
    if (!activeProject) return;
    const res = await fetch("/api/media/sample", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preset }),
    });
    if (!res.ok) return;
    const data = await res.json();
    const media = data.media as MediaItem;

    setMediaList((prev) =>
      prev.some((m) => m.id === media.id) ? prev : [media, ...prev],
    );

    const newScene: SceneItem = {
      id: `scene-${Date.now()}`,
      mediaId: media.id,
      kind: media.kind === "video" ? "video" : "image",
      roomLabel: data.suggestedRoomLabel || "Fasad Utama",
      prioritized: false,
      title: data.suggestedTitle || "Unit Properti Batam",
      bodyText: data.suggestedBody || "Lokasi Strategis & Siap Huni",
      durationSec: media.durationSec || 3.5,
      trimStartSec: 0,
      trimEndSec: media.durationSec || 3.5,
      volume: 1,
      muted: false,
      fitMode: "cover",
      positionX: 0,
      positionY: 0,
      zoomScale: 1,
      motion: "zoom-in",
      transitionIn: activeProject.scenes.length > 0 ? "fade" : "none",
      transitionDurationSec: activeProject.scenes.length > 0 ? 0.5 : 0,
    };

    handleUpdateProject((prev) => ({
      ...prev,
      scenes: [...prev.scenes, newScene],
    }));
    setSelectedSceneId(newScene.id);
    setStatusBanner(
      `Adegan "${newScene.title}" (${newScene.roomLabel}) ditambahkan ke timeline.`,
    );
  };

  const handleDistributeText = async () => {
    if (!activeProject) return;
    setDistributingText(true);
    try {
      const res = await fetch(
        `/api/projects/${activeProject.id}/distribute-text`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            unitDescription: activeProject.unitDescription,
          }),
        },
      );
      if (res.ok) {
        const data = await res.json();
        const updated = data.project as Project;
        setProjects((prev) =>
          prev.map((p) => (p.id === updated.id ? updated : p)),
        );
        setIsDirty(false);
        setStatusBanner(
          "Deskripsi Unit berhasil dibagikan ke teks tiap adegan secara deterministik.",
        );
      }
    } finally {
      setDistributingText(false);
    }
  };

  const handleApplyTemplate = async (template: TemplateStyle) => {
    if (!activeProject) return;
    setUndoStack((u) => [...u.slice(-24), structuredClone(activeProject)]);
    const res = await fetch(
      `/api/projects/${activeProject.id}/apply-template`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template }),
      },
    );
    if (res.ok) {
      const updated = (await res.json()) as Project;
      setProjects((prev) =>
        prev.map((p) => (p.id === updated.id ? updated : p)),
      );
      setIsDirty(false);
      setStatusBanner(`Preset gaya "${template}" diterapkan ke proyek.`);
    }
  };

  const handleAnalyzeBriefAndGenerateConcepts = async (
    variantId?: ConceptVariantId,
  ) => {
    if (!activeProject) return;
    if (variantId) {
      setRegeneratingVariant(variantId);
    } else {
      setAnalyzingBrief(true);
    }
    try {
      const res = await fetch(
        `/api/projects/${activeProject.id}/analyze-brief`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            unitDescription: activeProject.unitDescription,
            editPrompt: activeProject.editPrompt,
            alternativeCount: activeProject.alternativeCount,
            variantId,
          }),
        },
      );
      if (res.ok) {
        const data = await res.json();
        const updated = data.project as Project;
        setProjects((prev) =>
          prev.map((p) => (p.id === updated.id ? updated : p)),
        );
        setIsDirty(false);
        setStudioStep("concepts");
        setStatusBanner(
          variantId
            ? `Konsep ${variantId} berhasil dibuat ulang dengan mematuhi fakta unit.`
            : "Tiga Konsep AI (A: Informatif, B: Sinematik, C: Promosi Cepat) siap dipilih.",
        );
      }
    } finally {
      setAnalyzingBrief(false);
      setRegeneratingVariant(null);
    }
  };

  const handleSelectAndApplyConcept = async (concept: AiVideoConcept) => {
    if (!activeProject) return;
    setUndoStack((u) => [...u.slice(-24), structuredClone(activeProject)]);
    const res = await fetch(
      `/api/projects/${activeProject.id}/apply-concept`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conceptId: concept.id,
          concept,
        }),
      },
    );
    if (res.ok) {
      const updated = (await res.json()) as Project;
      setProjects((prev) =>
        prev.map((p) => (p.id === updated.id ? updated : p)),
      );
      setIsDirty(false);
      setStudioStep("editor");
      setActiveTab("scenes");
      setStatusBanner(
        `${concept.title} berhasil diterapkan ke timeline dan siap diedit.`,
      );
    }
  };

  const handleUpdateConceptField = (
    conceptId: ConceptVariantId,
    updater: (prev: AiVideoConcept) => AiVideoConcept,
  ) => {
    handleUpdateProject((prev) => ({
      ...prev,
      aiConcepts: (prev.aiConcepts || []).map((c) =>
        c.id === conceptId ? updater(c) : c,
      ),
    }));
  };

  const handleRequestAiAssistant = async (cmdOverride?: string) => {
    if (!activeProject) return;
    const cmd = (cmdOverride ?? assistantCommand).trim();
    if (!cmd) return;
    if (cmdOverride) {
      setAssistantCommand(cmdOverride);
    }
    setAssistantLoading(true);
    try {
      if (isDirty) {
        await saveProjectNow(activeProject);
      }
      const res = await fetch(
        `/api/projects/${activeProject.id}/ai-assistant`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command: cmd }),
        },
      );
      if (res.ok) {
        const data = await res.json();
        setPendingProposal(data.proposal as AiEditCommandProposal);
      }
    } finally {
      setAssistantLoading(false);
    }
  };

  const handleApplyAssistantProposal = async () => {
    if (!pendingProposal || !activeProject) return;
    setUndoStack((u) => [...u.slice(-24), structuredClone(activeProject)]);
    setRedoStack([]);
    const next = pendingProposal.updatedProject;
    setPendingProposal(null);
    await saveProjectNow(next);
    setStatusBanner(
      `Perubahan Asisten AI ("${pendingProposal.recognizedIntent}") diterapkan. Gunakan tombol Undo bila ingin membatalkan.`,
    );
  };

  const handlePrepareWhisperModel = async () => {
    setShowWhisperConfirm(false);
    const res = await fetch("/api/whisper/prepare", { method: "POST" });
    if (res.ok) {
      const st = (await res.json()) as WhisperModelStatus;
      setWhisperStatus(st);
      setStatusBanner(
        `Model Whisper lokal (${st.modelId}) siap digunakan untuk transkripsi.`,
      );
    }
  };

  const handleRunTranscription = async () => {
    if (!activeProject) return;
    setShowRegenConfirm(false);
    setTranscribing(true);
    try {
      const res = await fetch(`/api/projects/${activeProject.id}/transcribe`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        const updated = data.project as Project;
        setProjects((prev) =>
          prev.map((p) => (p.id === updated.id ? updated : p)),
        );
        await fetchState();
        setStatusBanner(
          `Transkripsi selesai (${data.completedSources} segmen bertimestamp kata).`,
        );
      }
    } finally {
      setTranscribing(false);
    }
  };

  const handleExportVideo = async () => {
    if (!activeProject) return;
    if (isDirty) {
      await saveProjectNow(activeProject);
    }
    const res = await fetch(`/api/projects/${activeProject.id}/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resolution: exportResolution,
        fps: exportFps,
        outputFileName: exportFileName,
        burnInSubtitles: activeProject.subtitleBurnIn,
      }),
    });
    if (res.ok) {
      await fetchState();
      setStatusBanner(
        "Job Export MP4 dimulai. Hasil export dapat dipantau di Hasil Export maupun halaman Home.",
      );
      setViewMode("renders");
    }
  };

  const handleCancelRenderJob = async (jobId: string) => {
    const res = await fetch(`/api/renders/${jobId}/cancel`, { method: "POST" });
    if (res.ok) {
      await fetchState();
      setStatusBanner("Proses export dibatalkan.");
    }
  };

  const handleRetryRenderJob = async (jobId: string) => {
    const res = await fetch(`/api/renders/${jobId}/retry`, { method: "POST" });
    if (res.ok) {
      await fetchState();
      setStatusBanner("Proses export dijalankan kembali dalam antrean.");
    }
  };

  const handleDeleteRenderJob = async (jobId: string) => {
    const res = await fetch(`/api/renders/${jobId}`, { method: "DELETE" });
    if (res.ok) {
      setRenderJobs((prev) => prev.filter((j) => j.id !== jobId));
      setConfirmDeleteRenderId(null);
      if (playingRenderJob?.id === jobId) {
        setPlayingRenderJob(null);
      }
      setStatusBanner("File hasil render berhasil dihapus.");
    }
  };

  const handleDownloadTextFile = (filename: string, content: string) => {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!activeProject) {
    return (
      <div className="studio-main-container">
        <p>Memuat proyek Batam Video Studio...</p>
      </div>
    );
  }

  const timeline = computeTimeline(activeProject, 30);
  const mappedSubtitles = mapSourceSubtitlesToTimeline(activeProject, 30);
  const visibleSubtitles = mappedSubtitles.filter((c) => !c.hidden);
  const hiddenSubtitles = mappedSubtitles.filter((c) => c.hidden);

  const selectedScene =
    activeProject.scenes.find((s) => s.id === selectedSceneId) ??
    activeProject.scenes[0] ??
    null;

  const selectedSceneComp = selectedScene
    ? getSceneCompositionForAspect(selectedScene, activeProject.aspectRatio)
    : null;

  const textWarningsCount = activeProject.scenes.filter(
    (s) => `${s.title} ${s.bodyText}`.trim().length > SCENE_TEXT_WARN_LENGTH,
  ).length;

  const playerDims = getDimensionsForAspectRatio(
    activeProject.aspectRatio,
    previewQuality === "proxy" ? "720p" : "1080p",
  );
  const previewWidth =
    activeProject.aspectRatio === "9:16"
      ? 310
      : activeProject.aspectRatio === "1:1"
        ? 360
        : 450;
  const previewHeight = Math.round(
    (previewWidth * playerDims.height) / playerDims.width,
  );

  const moveScene = (index: number, direction: -1 | 1) => {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= activeProject.scenes.length) return;
    handleUpdateProject((prev) => {
      const scenes = [...prev.scenes];
      const [moved] = scenes.splice(index, 1);
      scenes.splice(targetIdx, 0, moved);
      return {
        ...prev,
        scenes,
        subtitleStale: true,
      };
    });
  };

  const updateSelectedScene = (patch: Partial<SceneItem>) => {
    if (!selectedScene) return;
    handleUpdateProject((prev) => ({
      ...prev,
      scenes: prev.scenes.map((sc) =>
        sc.id === selectedScene.id ? { ...sc, ...patch } : sc,
      ),
      subtitleStale:
        patch.trimStartSec !== undefined ||
        patch.trimEndSec !== undefined ||
        patch.muted !== undefined
          ? true
          : prev.subtitleStale,
    }));
  };

  const displayedConcepts =
    activeProject.alternativeCount === 1
      ? (activeProject.aiConcepts || []).slice(0, 1)
      : activeProject.aiConcepts || [];

  return (
    <div>
      {/* Top Bar Contract: Zone 1 Brand | Zone 2 Nav Links | Zone 3 Primary Action */}
      <header className="top-navbar">
        <a
          href="#home"
          className="brand-wordmark"
          onClick={(e) => {
            e.preventDefault();
            void handleSwitchView("home");
          }}
        >
          Batam Video Studio
        </a>

        <nav className="top-nav-links" aria-label="Navigasi Utama">
          <button
            type="button"
            className={`top-nav-link ${
              viewMode === "home" ? "top-nav-link-active" : ""
            }`}
            onClick={() => void handleSwitchView("home")}
          >
            Home
          </button>
          <button
            type="button"
            className={`top-nav-link ${
              viewMode === "studio" && studioStep === "input"
                ? "top-nav-link-active"
                : ""
            }`}
            onClick={() => void handleSwitchView("studio", "input")}
          >
            Input &amp; Brief
          </button>
          <button
            type="button"
            className={`top-nav-link ${
              viewMode === "studio" && studioStep === "concepts"
                ? "top-nav-link-active"
                : ""
            }`}
            onClick={() => void handleSwitchView("studio", "concepts")}
          >
            Konsep AI ({activeProject.aiConcepts?.length || 3})
          </button>
          <button
            type="button"
            className={`top-nav-link ${
              viewMode === "studio" && studioStep === "editor"
                ? "top-nav-link-active"
                : ""
            }`}
            onClick={() => void handleSwitchView("studio", "editor")}
          >
            Editor Timeline
          </button>
          <button
            type="button"
            className={`top-nav-link ${
              viewMode === "renders" ? "top-nav-link-active" : ""
            }`}
            onClick={() => void handleSwitchView("renders")}
          >
            Hasil Video ({renderJobs.length})
          </button>
        </nav>

        <div className="top-nav-cta">
          <button
            type="button"
            className="btn btn-primary"
            disabled={isSaving}
            onClick={() => void saveProjectNow(activeProject)}
          >
            {isSaving ? "Menyimpan..." : "Simpan Draf"}
          </button>
        </div>
      </header>

      {/* Workspace Sub-Toolbar for Project Management, Undo/Redo & Save State */}
      <div className="workspace-toolbar">
        <div className="toolbar-left">
          <label htmlFor="project-selector" className="field-label-inline">
            Proyek Aktif:
          </label>
          <select
            id="project-selector"
            className="studio-select studio-select-sm"
            value={activeProject.id}
            onChange={(e) => {
              const nextId = e.target.value;
              setSelectedProjectId(nextId);
              setUndoStack([]);
              setRedoStack([]);
              const found = projects.find((p) => p.id === nextId);
              if (found) {
                setSelectedSceneId(found.scenes[0]?.id || "");
              }
            }}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <input
            type="text"
            aria-label="Nama Proyek"
            className="studio-input"
            style={{ width: 230, padding: "5px 10px", fontSize: "0.85rem" }}
            value={activeProject.name}
            onChange={(e) => {
              const val = e.target.value;
              handleUpdateProject((prev) => ({ ...prev, name: val }));
            }}
          />

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setNewProjectModalOpen(true)}
          >
            + Buat Video Baru
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => void handleDuplicateProject()}
          >
            Duplikat
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={undoStack.length === 0}
            onClick={handleUndo}
            aria-label="Undo perubahan terakhir"
          >
            Undo ({undoStack.length})
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={redoStack.length === 0}
            onClick={handleRedo}
            aria-label="Redo perubahan"
          >
            Redo ({redoStack.length})
          </button>
        </div>

        <div className="toolbar-right">
          <span className="save-status-text tabular-nums" role="status">
            {isSaving
              ? "Menyimpan perubahan..."
              : isDirty
                ? "Perubahan belum tersimpan (autosave 1,3 dtk)"
                : lastSavedAt
                  ? `Tersimpan otomatis pukul ${lastSavedAt}`
                  : "Semua perubahan tersimpan"}
          </span>
        </div>
      </div>

      {/* Inline Dialog: Buat Proyek Baru */}
      {newProjectModalOpen && (
        <div className="studio-main-container" style={{ paddingBottom: 0 }}>
          <div className="studio-section">
            <div className="section-header-row">
              <div>
                <h2 className="section-title">Buat Proyek Video Baru</h2>
                <p className="section-subtitle">
                  Beri nama unit properti atau kampanye pemasaran Anda.
                </p>
              </div>
            </div>
            <div className="toolbar-left">
              <input
                type="text"
                className="studio-input"
                style={{ maxWidth: 360 }}
                placeholder="Contoh: Cluster Pasir Putih Tipe 120"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void handleCreateNewProject()}
              >
                Buat Sekarang
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setNewProjectModalOpen(false)}
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inline Confirmation: Hapus Proyek */}
      {confirmDeleteProjectId && (
        <div className="studio-main-container" style={{ paddingBottom: 0 }}>
          <div className="conflict-alert-box">
            <div className="conflict-alert-title">
              Konfirmasi Hapus Proyek?
            </div>
            <p style={{ margin: "4px 0 10px" }}>
              Menghapus proyek tidak menghapus file media asli maupun hasil
              video MP4 yang sudah dirender.
            </p>
            <div className="toolbar-left">
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => void handleDeleteProject(confirmDeleteProjectId)}
              >
                Ya, Hapus Proyek
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setConfirmDeleteProjectId(null)}
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status feedback banner */}
      {statusBanner && (
        <div className="studio-main-container" style={{ paddingBottom: 0 }}>
          <div
            className="notice-banner"
            style={{
              marginTop: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span>{statusBanner}</span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setStatusBanner(null)}
            >
              Tutup
            </button>
          </div>
        </div>
      )}

      <main className="studio-main-container">
        {/* =========================================================
            VIEW 1: HOME (BERANDA) — Project Terakhir, Status & Hasil
           ========================================================= */}
        {viewMode === "home" && (
          <div className="brief-stack">
            <section className="home-hero-banner">
              <div>
                <h1 className="section-title" style={{ fontSize: "1.35rem" }}>
                  Beranda Batam Video Studio
                </h1>
                <p className="section-subtitle">
                  Alur terhubung: Home → Buat Video → Input Media &amp;
                  Informasi → Konsep AI (A/B/C) → Editor → Export → Hasil di
                  Home.
                </p>
              </div>
              <div className="toolbar-left">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void handleSwitchView("studio", "editor")}
                >
                  Lanjutkan: {activeProject.name}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setNewProjectModalOpen(true)}
                >
                  + Buat Video Baru
                </button>
              </div>
            </section>

            {/* Daftar Project Terakhir */}
            <section className="studio-section">
              <div className="section-header-row">
                <div>
                  <h2 className="section-title">
                    Project Terakhir ({projects.length})
                  </h2>
                  <p className="section-subtitle">
                    Lanjutkan project kapan saja tanpa mengulang input media,
                    deskripsi unit, maupun prompt.
                  </p>
                </div>
              </div>

              <div className="home-projects-grid">
                {projects.map((proj) => {
                  const tl = computeTimeline(proj, 30);
                  const isCurrent = proj.id === activeProject.id;
                  return (
                    <article
                      key={proj.id}
                      className={`home-project-card ${
                        isCurrent ? "home-project-card-active" : ""
                      }`}
                    >
                      <div>
                        <div className="template-card-top">
                          <span className="template-card-name">
                            {proj.name}
                          </span>
                          <span className="scene-info-meta">
                            {WORKFLOW_STAGE_LABELS[proj.workflowStage] ||
                              "Sedang Diedit"}
                          </span>
                        </div>
                        <div className="fact-summary-line">
                          <span className="tabular-nums">
                            {proj.scenes.length} Adegan
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">
                            Durasi {tl.totalDurationSec.toFixed(1)}d
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>Rasio {proj.aspectRatio}</span>
                          <span aria-hidden="true">·</span>
                          <span>
                            Konsep Terpilih: {proj.selectedConceptId || "A"}
                          </span>
                        </div>
                      </div>

                      <div className="toolbar-left">
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => {
                            setSelectedProjectId(proj.id);
                            setSelectedSceneId(proj.scenes[0]?.id || "");
                            void handleSwitchView("studio", "editor");
                          }}
                        >
                          Lanjutkan Editor
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => {
                            setSelectedProjectId(proj.id);
                            void handleSwitchView("studio", "input");
                          }}
                        >
                          Input &amp; Brief
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => {
                            setSelectedProjectId(proj.id);
                            void handleSwitchView("studio", "concepts");
                          }}
                        >
                          Konsep AI
                        </button>
                        {projects.length > 1 && (
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={() => setConfirmDeleteProjectId(proj.id)}
                          >
                            Hapus
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>

            {/* Hasil Export Tersedia di Home */}
            <section className="studio-section">
              <div className="section-header-row">
                <div>
                  <h2 className="section-title">
                    Hasil Export Video Tersedia ({renderJobs.length})
                  </h2>
                  <p className="section-subtitle">
                    Hasil render MP4 H.264 lokal beserta lokasi file di{" "}
                    <code>studio-data/renders/</code>, pemutar langsung, dan
                    unduhan SRT/VTT.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => void handleSwitchView("renders")}
                >
                  Kelola Semua Hasil
                </button>
              </div>

              {playingRenderJob && playingRenderJob.mp4Url && (
                <div
                  className="studio-section"
                  style={{
                    marginBottom: 16,
                    backgroundColor: "var(--bg-input)",
                  }}
                >
                  <div className="section-header-row">
                    <div>
                      <h3 className="section-title">
                        Memutar: {playingRenderJob.outputFileName}
                      </h3>
                      <p className="section-subtitle tabular-nums">
                        Lokasi File: {playingRenderJob.localFilePath}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setPlayingRenderJob(null)}
                    >
                      Tutup Pemutar
                    </button>
                  </div>
                  <video
                    src={playingRenderJob.mp4Url}
                    controls
                    autoPlay
                    style={{
                      width: "100%",
                      maxHeight: 380,
                      borderRadius: 8,
                      backgroundColor: "#000",
                    }}
                  />
                </div>
              )}

              <div className="renders-grid">
                {renderJobs.map((job) => (
                  <article key={job.id} className="render-card">
                    <div className="render-thumb-box">
                      {job.thumbUrl ? (
                        <img
                          src={job.thumbUrl}
                          alt={job.projectName}
                          className="render-thumb-img"
                          referrerPolicy="no-referrer"
                        />
                      ) : null}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>
                        {job.outputFileName}
                      </div>
                      <div className="scene-info-meta tabular-nums">
                        {job.projectName} · {job.resolution} · {job.fps} FPS ·{" "}
                        {job.durationSec.toFixed(1)}d · {job.stageLabel}
                      </div>
                      <div
                        className="scene-info-meta tabular-nums"
                        style={{ marginTop: 4 }}
                      >
                        Lokasi File: <code>{job.localFilePath}</code>
                      </div>
                    </div>

                    <div className="progress-bar-track">
                      <div
                        className="progress-bar-fill"
                        style={{ width: `${job.progress}%` }}
                      />
                    </div>

                    <div className="toolbar-left">
                      {job.status === "completed" && job.mp4Url && (
                        <>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => setPlayingRenderJob(job)}
                          >
                            Putar
                          </button>
                          <a
                            href={job.mp4Url}
                            download={job.outputFileName}
                            className="btn btn-secondary btn-sm"
                            style={{ textDecoration: "none" }}
                          >
                            Unduh MP4
                          </a>
                        </>
                      )}
                      {(job.status === "queued" ||
                        job.status === "rendering") && (
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => void handleCancelRenderJob(job.id)}
                        >
                          Batalkan
                        </button>
                      )}
                      {(job.status === "failed" ||
                        job.status === "cancelled") && (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => void handleRetryRenderJob(job.id)}
                        >
                          Coba Lagi
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                          void navigator.clipboard?.writeText(
                            job.localFilePath,
                          );
                          setStatusBanner(
                            `Lokasi file disalin: ${job.localFilePath}`,
                          );
                        }}
                      >
                        Salin Lokasi File
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            {/* Informasi Mode Lokal vs Online */}
            <section className="studio-section">
              <h2 className="section-title">
                Status Layanan Lokal &amp; Kebutuhan Koneksi AI
              </h2>
              <div className="constraints-grid" style={{ marginTop: 12 }}>
                <div className="constraint-item">
                  <strong>100% Berjalan Lokal Tanpa Internet:</strong> Editing
                  manual timeline, Remotion preview (proxy/penuh), kuncian fakta
                  unit, generator Konsep A/B/C deterministik, Asisten Editing AI
                  terstruktur, penyimpanan atomik, dan Export MP4 H.264
                  (ffmpeg-static).
                </div>
                <div className="constraint-item">
                  <strong>Membutuhkan Model Lokal / Internet Opsional:</strong>{" "}
                  Unduhan awal model Whisper (
                  <code>onnx-community/whisper-tiny_timestamped</code> ~150-250
                  MB sekali unduh ke cache lokal) dan pengayaan gaya kalimat via
                  Gemini API ({aiOnlineAvailable ? "Aktif" : "Mode Lokal Aktif"}
                  ).
                </div>
              </div>
            </section>
          </div>
        )}

        {/* =========================================================
            VIEW 2: STUDIO WORKSPACE (INPUT -> KONSEP AI -> EDITOR)
           ========================================================= */}
        {viewMode === "studio" && (
          <div>
            {/* Connected Workflow Stepper */}
            <div
              className="workflow-stepper-bar"
              role="navigation"
              aria-label="Tahapan Pembuatan Video"
            >
              <button
                type="button"
                className={`workflow-step-btn ${
                  studioStep === "input" ? "workflow-step-btn-active" : ""
                }`}
                onClick={() => setStudioStep("input")}
              >
                <span className="workflow-step-kicker">Langkah 1</span>
                <span className="workflow-step-title">
                  Input Media &amp; Informasi Unit
                </span>
              </button>
              <button
                type="button"
                className={`workflow-step-btn ${
                  studioStep === "concepts" ? "workflow-step-btn-active" : ""
                }`}
                onClick={() => setStudioStep("concepts")}
              >
                <span className="workflow-step-kicker">Langkah 2</span>
                <span className="workflow-step-title">
                  Pilih Konsep AI (A / B / C)
                </span>
              </button>
              <button
                type="button"
                className={`workflow-step-btn ${
                  studioStep === "editor" ? "workflow-step-btn-active" : ""
                }`}
                onClick={() => setStudioStep("editor")}
              >
                <span className="workflow-step-kicker">Langkah 3</span>
                <span className="workflow-step-title">
                  Editor Timeline, Subtitle &amp; Asisten AI
                </span>
              </button>
            </div>

            <div className="editor-workspace-grid">
              {/* LEFT COLUMN */}
              <div className="editor-left-column">
                {/* STEP 1: INPUT MEDIA & INFORMASI */}
                {studioStep === "input" && (
                  <>
                    <section
                      className="studio-section"
                      aria-labelledby="heading-upload-media"
                    >
                      <div className="section-header-row">
                        <div>
                          <h2
                            id="heading-upload-media"
                            className="section-title"
                          >
                            Input Kombinasi Media (Foto, Video, Narasi, Musik)
                          </h2>
                          <p className="section-subtitle">
                            File asli dipertahankan utuh. Atur urutan, beri
                            label ruangan, dan tandai media yang diprioritaskan.
                          </p>
                        </div>
                        <label
                          className="btn btn-primary"
                          style={{ cursor: "pointer" }}
                        >
                          <span>
                            {uploadingMedia
                              ? "Memproses..."
                              : "Unggah Foto / Video / Audio"}
                          </span>
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/svg+xml,video/mp4,video/webm,audio/*"
                            multiple
                            className="sr-only"
                            disabled={uploadingMedia}
                            onChange={(e) =>
                              void handleUploadFiles(e.target.files)
                            }
                          />
                        </label>
                      </div>

                      {uploadProgressText && (
                        <p
                          className="section-subtitle"
                          style={{ marginBottom: 10 }}
                        >
                          {uploadProgressText}
                        </p>
                      )}

                      <div
                        className="toolbar-left"
                        style={{ marginBottom: 14 }}
                      >
                        <span className="field-label-inline">
                          Tambah Cepat Media Sampel:
                        </span>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() =>
                            void handleAddSamplePresetScene("rumah-pasir-putih")
                          }
                        >
                          + Foto Villa Pasir Putih
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() =>
                            void handleAddSamplePresetScene("kos-bengkong")
                          }
                        >
                          + Foto Kos Bengkong
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() =>
                            void handleAddSamplePresetScene("video-walkthrough")
                          }
                        >
                          + Klip Video Walkthrough MP4
                        </button>
                      </div>

                      {/* Daftar Media Adegan dengan Label Ruangan & Prioritas */}
                      <div className="scene-list">
                        {activeProject.scenes.map((sc, idx) => {
                          const media = mediaMap[sc.mediaId];
                          return (
                            <div key={sc.id} className="scene-row-item">
                              <div className="scene-row-left">
                                {media?.thumbUrl ? (
                                  <img
                                    src={media.thumbUrl}
                                    alt={sc.title}
                                    className="scene-thumb"
                                    referrerPolicy="no-referrer"
                                  />
                                ) : (
                                  <div className="scene-thumb" />
                                )}
                                <div>
                                  <div className="scene-info-title">
                                    {idx + 1}. {sc.title} ({sc.kind.toUpperCase()})
                                  </div>
                                  <div className="toolbar-left" style={{ marginTop: 4 }}>
                                    <select
                                      aria-label={`Label Ruangan Adegan ${idx + 1}`}
                                      className="studio-select studio-select-sm"
                                      value={sc.roomLabel || "Fasad Utama"}
                                      onChange={(e) => {
                                        const rl = e.target.value;
                                        handleUpdateProject((prev) => ({
                                          ...prev,
                                          scenes: prev.scenes.map((item) =>
                                            item.id === sc.id
                                              ? { ...item, roomLabel: rl }
                                              : item,
                                          ),
                                        }));
                                      }}
                                    >
                                      {ROOM_LABEL_PRESETS.map((lbl) => (
                                        <option key={lbl} value={lbl}>
                                          {lbl}
                                        </option>
                                      ))}
                                    </select>
                                    <label className="field-label-inline">
                                      <input
                                        type="checkbox"
                                        checked={Boolean(sc.prioritized)}
                                        onChange={(e) => {
                                          const prio = e.target.checked;
                                          handleUpdateProject((prev) => ({
                                            ...prev,
                                            scenes: prev.scenes.map((item) =>
                                              item.id === sc.id
                                                ? {
                                                    ...item,
                                                    prioritized: prio,
                                                  }
                                                : item,
                                            ),
                                          }));
                                        }}
                                      />{" "}
                                      Utamakan (Prioritas)
                                    </label>
                                  </div>
                                </div>
                              </div>
                              <div className="scene-row-actions">
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-sm"
                                  disabled={idx === 0}
                                  onClick={() => moveScene(idx, -1)}
                                >
                                  Naik
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-sm"
                                  disabled={
                                    idx === activeProject.scenes.length - 1
                                  }
                                  onClick={() => moveScene(idx, 1)}
                                >
                                  Turun
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>

                    <CreationBrief
                      project={activeProject}
                      onUpdateProject={handleUpdateProject}
                      onDistributeText={handleDistributeText}
                      onApplyTemplate={handleApplyTemplate}
                      onAnalyzeBrief={() =>
                        handleAnalyzeBriefAndGenerateConcepts()
                      }
                      analyzing={analyzingBrief}
                      distributing={distributingText}
                      textWarningsCount={textWarningsCount}
                    />
                  </>
                )}

                {/* STEP 2: TIGA PILIHAN KONSEP AI (A: INFORMATIF, B: SINEMATIK, C: PROMOSI CEPAT) */}
                {studioStep === "concepts" && (
                  <section className="studio-section">
                    <div className="section-header-row">
                      <div>
                        <h2 className="section-title">
                          Tiga Pilihan Konsep AI (Preview Ringan Tanpa Render
                          Berat)
                        </h2>
                        <p className="section-subtitle">
                          Dibuat dari media, Deskripsi Unit (fakta terkunci),
                          dan Perintah Editing AI. Pilih konsep untuk
                          menerapkannya ke timeline editor.
                        </p>
                      </div>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={analyzingBrief}
                        onClick={() =>
                          void handleAnalyzeBriefAndGenerateConcepts()
                        }
                      >
                        {analyzingBrief
                          ? "Menyusun..."
                          : "Buat Ulang Semua Konsep"}
                      </button>
                    </div>

                    <div className="concepts-grid">
                      {displayedConcepts.map((concept) => {
                        const isSelected =
                          activeProject.selectedConceptId === concept.id;
                        const isEditing = editingConceptId === concept.id;
                        return (
                          <article
                            key={concept.id}
                            className={`concept-card ${
                              isSelected ? "concept-card-selected" : ""
                            }`}
                          >
                            <div>
                              <div className="template-card-top">
                                <span className="template-card-name">
                                  {concept.title}
                                </span>
                                <span className="scene-info-meta tabular-nums">
                                  ~{concept.estimatedDurationSec}d
                                </span>
                              </div>
                              <p
                                className="template-card-desc"
                                style={{ marginBottom: 10 }}
                              >
                                {concept.subtitle}
                              </p>

                              {isEditing ? (
                                <div
                                  className="field-group"
                                  style={{ marginBottom: 10 }}
                                >
                                  <label className="field-label">
                                    Edit Hook Pembuka:
                                  </label>
                                  <input
                                    type="text"
                                    className="studio-input"
                                    value={concept.hook}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      handleUpdateConceptField(
                                        concept.id,
                                        (prev) => ({ ...prev, hook: val }),
                                      );
                                    }}
                                  />
                                  <label className="field-label">
                                    Edit Naskah Narasi:
                                  </label>
                                  <textarea
                                    className="studio-textarea"
                                    rows={3}
                                    value={concept.narrationScript}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      handleUpdateConceptField(
                                        concept.id,
                                        (prev) => ({
                                          ...prev,
                                          narrationScript: val,
                                        }),
                                      );
                                    }}
                                  />
                                </div>
                              ) : (
                                <>
                                  <div
                                    style={{
                                      fontSize: "0.82rem",
                                      marginBottom: 8,
                                    }}
                                  >
                                    <strong>Hook:</strong> {concept.hook}
                                  </div>
                                  <div
                                    style={{
                                      fontSize: "0.8rem",
                                      color: "var(--text-secondary)",
                                      marginBottom: 10,
                                    }}
                                  >
                                    <strong>Naskah Narasi:</strong>{" "}
                                    {concept.narrationScript}
                                  </div>
                                </>
                              )}

                              <div className="storyboard-mini-list">
                                <strong>
                                  Storyboard &amp; Urutan Media (
                                  {concept.storyboard.length} Adegan):
                                </strong>
                                {concept.storyboard.map((sb, i) => (
                                  <div key={`${sb.sceneId}-${i}`}>
                                    {i + 1}. [{sb.roomLabel}]{" "}
                                    <strong>{sb.screenTitle}</strong> —{" "}
                                    {sb.screenText} ({sb.durationSec}d)
                                  </div>
                                ))}
                              </div>
                            </div>

                            <div className="toolbar-left">
                              <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                onClick={() =>
                                  void handleSelectAndApplyConcept(concept)
                                }
                              >
                                {isSelected
                                  ? "Terapkan Ulang ke Timeline"
                                  : `Pilih Konsep ${concept.id}`}
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={() =>
                                  setEditingConceptId(
                                    isEditing ? null : concept.id,
                                  )
                                }
                              >
                                {isEditing ? "Selesai Edit" : "Edit Konsep"}
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                disabled={regeneratingVariant === concept.id}
                                onClick={() =>
                                  void handleAnalyzeBriefAndGenerateConcepts(
                                    concept.id,
                                  )
                                }
                              >
                                {regeneratingVariant === concept.id
                                  ? "..."
                                  : "Buat Ulang"}
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                )}

                {/* STEP 3: EDITOR TIMELINE, ASISTEN EDITING AI & SUBTITLE */}
                {studioStep === "editor" && (
                  <>
                    {/* Asisten Editing AI */}
                    <section
                      className="studio-section"
                      aria-labelledby="heading-ai-assistant"
                    >
                      <div className="section-header-row">
                        <div>
                          <h2
                            id="heading-ai-assistant"
                            className="section-title"
                          >
                            Asisten Editing AI (Perubahan Timeline Terstruktur)
                          </h2>
                          <p className="section-subtitle">
                            Ketik perintah atau klik contoh di bawah. Perubahan
                            divalidasi dan menampilkan ringkasan sebelum
                            diterapkan.
                          </p>
                        </div>
                      </div>

                      <div className="prompt-examples-bar">
                        {ASSISTANT_COMMAND_EXAMPLES.map((cmdEx) => (
                          <button
                            key={cmdEx}
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => void handleRequestAiAssistant(cmdEx)}
                          >
                            {cmdEx}
                          </button>
                        ))}
                      </div>

                      <div className="toolbar-left">
                        <input
                          type="text"
                          aria-label="Perintah Asisten Editing AI"
                          className="studio-input"
                          style={{ flex: 1 }}
                          placeholder="Contoh: Persingkat jadi 30 detik / Utamakan fasad dan ruang tamu / Perbesar tulisan harga"
                          value={assistantCommand}
                          onChange={(e) => setAssistantCommand(e.target.value)}
                        />
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={assistantLoading}
                          onClick={() => void handleRequestAiAssistant()}
                        >
                          {assistantLoading
                            ? "Menyiapkan..."
                            : "Analisis Perubahan"}
                        </button>
                      </div>

                      {pendingProposal && (
                        <div
                          className="provider-status-box"
                          style={{ marginTop: 12 }}
                        >
                          <div className="provider-status-title">
                            Ringkasan Perubahan: {pendingProposal.recognizedIntent}
                          </div>
                          <ul
                            className="conflict-list"
                            style={{ marginBottom: 10 }}
                          >
                            {pendingProposal.summaryItems.map((item, idx) => (
                              <li key={idx}>{item}</li>
                            ))}
                          </ul>
                          <div className="toolbar-left">
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={() =>
                                void handleApplyAssistantProposal()
                              }
                            >
                              Terapkan Perubahan ke Timeline
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => setPendingProposal(null)}
                            >
                              Batal
                            </button>
                          </div>
                        </div>
                      )}
                    </section>

                    {/* Manual Editor Tabs */}
                    <section
                      className="studio-section"
                      aria-label="Kontrol Pengeditan Manual"
                    >
                      <div className="manual-tabs-bar" role="tablist">
                        <button
                          type="button"
                          role="tab"
                          aria-selected={activeTab === "scenes"}
                          className={`manual-tab-btn ${
                            activeTab === "scenes"
                              ? "manual-tab-btn-active"
                              : ""
                          }`}
                          onClick={() => setActiveTab("scenes")}
                        >
                          Adegan ({activeProject.scenes.length})
                        </button>
                        <button
                          type="button"
                          role="tab"
                          aria-selected={activeTab === "text"}
                          className={`manual-tab-btn ${
                            activeTab === "text" ? "manual-tab-btn-active" : ""
                          }`}
                          onClick={() => setActiveTab("text")}
                        >
                          Teks &amp; Harga
                        </button>
                        <button
                          type="button"
                          role="tab"
                          aria-selected={activeTab === "logo"}
                          className={`manual-tab-btn ${
                            activeTab === "logo" ? "manual-tab-btn-active" : ""
                          }`}
                          onClick={() => setActiveTab("logo")}
                        >
                          Logo &amp; Kontak
                        </button>
                        <button
                          type="button"
                          role="tab"
                          aria-selected={activeTab === "audio"}
                          className={`manual-tab-btn ${
                            activeTab === "audio" ? "manual-tab-btn-active" : ""
                          }`}
                          onClick={() => setActiveTab("audio")}
                        >
                          Audio
                        </button>
                        <button
                          type="button"
                          role="tab"
                          aria-selected={activeTab === "subtitles"}
                          className={`manual-tab-btn ${
                            activeTab === "subtitles"
                              ? "manual-tab-btn-active"
                              : ""
                          }`}
                          onClick={() => setActiveTab("subtitles")}
                        >
                          Subtitle ({visibleSubtitles.length})
                        </button>
                      </div>

                      {/* TAB 1: ADEGAN & KOMPOSISI */}
                      {activeTab === "scenes" && (
                        <div>
                          <div className="scene-list">
                            {activeProject.scenes.map((sc, idx) => {
                              const media = mediaMap[sc.mediaId];
                              const timing = timeline.scenes[idx];
                              const isSelected = selectedScene?.id === sc.id;
                              return (
                                <div
                                  key={sc.id}
                                  className={`scene-row-item ${
                                    isSelected ? "scene-row-item-active" : ""
                                  }`}
                                  onClick={() => setSelectedSceneId(sc.id)}
                                >
                                  <div className="scene-row-left">
                                    {media?.thumbUrl ? (
                                      <img
                                        src={media.thumbUrl}
                                        alt={sc.title}
                                        className="scene-thumb"
                                        referrerPolicy="no-referrer"
                                      />
                                    ) : (
                                      <div className="scene-thumb" />
                                    )}
                                    <div>
                                      <div className="scene-info-title">
                                        {idx + 1}. [{sc.roomLabel}]{" "}
                                        {sc.title || "Adegan"}
                                        {sc.prioritized ? " ★" : ""}
                                      </div>
                                      <div className="scene-info-meta tabular-nums">
                                        {sc.kind.toUpperCase()} · Durasi{" "}
                                        {timing?.clipDurationSec.toFixed(1)}d ·
                                        Zoom {(sc.zoomScale || 1).toFixed(1)}x ·
                                        Gerak {sc.motion} · Transisi{" "}
                                        {sc.transitionIn}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="scene-row-actions">
                                    <button
                                      type="button"
                                      className="btn btn-ghost btn-sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const [part1, part2] =
                                          splitSceneAtMidpoint(sc);
                                        handleUpdateProject((prev) => ({
                                          ...prev,
                                          scenes: prev.scenes.flatMap((item) =>
                                            item.id === sc.id
                                              ? [part1, part2]
                                              : [item],
                                          ),
                                          subtitleStale: true,
                                        }));
                                        setStatusBanner(
                                          `Klip "${sc.title}" dipecah menjadi 2 bagian.`,
                                        );
                                      }}
                                    >
                                      Pecah Klip
                                    </button>
                                    <button
                                      type="button"
                                      className="btn btn-ghost btn-sm"
                                      aria-label={`Naikkan adegan ${idx + 1}`}
                                      disabled={idx === 0}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        moveScene(idx, -1);
                                      }}
                                    >
                                      Naik
                                    </button>
                                    <button
                                      type="button"
                                      className="btn btn-ghost btn-sm"
                                      aria-label={`Turunkan adegan ${idx + 1}`}
                                      disabled={
                                        idx === activeProject.scenes.length - 1
                                      }
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        moveScene(idx, 1);
                                      }}
                                    >
                                      Turun
                                    </button>
                                    {activeProject.scenes.length > 1 && (
                                      <button
                                        type="button"
                                        className="btn btn-danger btn-sm"
                                        aria-label={`Hapus adegan ${idx + 1}`}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleUpdateProject((prev) => ({
                                            ...prev,
                                            scenes: prev.scenes.filter(
                                              (item) => item.id !== sc.id,
                                            ),
                                            subtitleStale: true,
                                          }));
                                        }}
                                      >
                                        Hapus
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {selectedScene && selectedSceneComp && (
                            <div className="scene-inspector-panel">
                              <h3 className="section-title">
                                Pengaturan Klip &amp; Komposisi Rasio (
                                {activeProject.aspectRatio}):{" "}
                                {selectedScene.title}
                              </h3>

                              <div className="form-row-3col">
                                <div className="field-group">
                                  <label
                                    htmlFor="scene-room-select"
                                    className="field-label"
                                  >
                                    Label Ruangan
                                  </label>
                                  <select
                                    id="scene-room-select"
                                    className="studio-select"
                                    value={
                                      selectedScene.roomLabel || "Fasad Utama"
                                    }
                                    onChange={(e) =>
                                      updateSelectedScene({
                                        roomLabel: e.target.value,
                                      })
                                    }
                                  >
                                    {ROOM_LABEL_PRESETS.map((lbl) => (
                                      <option key={lbl} value={lbl}>
                                        {lbl}
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                <div className="field-group">
                                  <label
                                    htmlFor="scene-duration-input"
                                    className="field-label"
                                  >
                                    Durasi Klip (detik)
                                  </label>
                                  <input
                                    id="scene-duration-input"
                                    type="number"
                                    step="0.5"
                                    min="0.5"
                                    max="60"
                                    className="studio-input tabular-nums"
                                    value={selectedScene.durationSec}
                                    onChange={(e) => {
                                      const val = Math.max(
                                        0.5,
                                        Number(e.target.value) || 3,
                                      );
                                      updateSelectedScene({
                                        durationSec: val,
                                        trimEndSec:
                                          selectedScene.trimStartSec + val,
                                      });
                                    }}
                                  />
                                </div>

                                <div className="field-group">
                                  <label
                                    htmlFor="scene-zoom-input"
                                    className="field-label"
                                  >
                                    Crop / Zoom Klip (0.5x – 2.5x)
                                  </label>
                                  <input
                                    id="scene-zoom-input"
                                    type="number"
                                    step="0.1"
                                    min="0.5"
                                    max="2.5"
                                    className="studio-input tabular-nums"
                                    value={selectedSceneComp.zoomScale}
                                    onChange={(e) => {
                                      const z = Math.max(
                                        0.5,
                                        Math.min(
                                          2.5,
                                          Number(e.target.value) || 1,
                                        ),
                                      );
                                      updateSelectedScene({
                                        zoomScale: z,
                                        aspectOverrides: {
                                          ...(selectedScene.aspectOverrides ||
                                            {}),
                                          [activeProject.aspectRatio]: {
                                            ...selectedSceneComp,
                                            zoomScale: z,
                                          },
                                        } as SceneItem["aspectOverrides"],
                                      });
                                    }}
                                  />
                                </div>
                              </div>

                              <div className="form-row-3col">
                                <div className="field-group">
                                  <label
                                    htmlFor="scene-fit-select"
                                    className="field-label"
                                  >
                                    Mode Tampilan (Fit / Fill)
                                  </label>
                                  <select
                                    id="scene-fit-select"
                                    className="studio-select"
                                    value={selectedSceneComp.fitMode}
                                    onChange={(e) => {
                                      const fm = e.target.value as FitMode;
                                      updateSelectedScene({
                                        fitMode: fm,
                                        aspectOverrides: {
                                          ...(selectedScene.aspectOverrides ||
                                            {}),
                                          [activeProject.aspectRatio]: {
                                            ...selectedSceneComp,
                                            fitMode: fm,
                                          },
                                        } as SceneItem["aspectOverrides"],
                                      });
                                    }}
                                  >
                                    <option value="cover">
                                      Fill (Penuhi Layar)
                                    </option>
                                    <option value="contain">
                                      Fit (Tampilkan Utuh)
                                    </option>
                                  </select>
                                </div>

                                <div className="field-group">
                                  <label
                                    htmlFor="scene-pos-x-input"
                                    className="field-label"
                                  >
                                    Geser Posisi Horizontal (X)
                                  </label>
                                  <input
                                    id="scene-pos-x-input"
                                    type="number"
                                    min="-100"
                                    max="100"
                                    className="studio-input tabular-nums"
                                    value={selectedSceneComp.positionX}
                                    onChange={(e) => {
                                      const px = Number(e.target.value) || 0;
                                      updateSelectedScene({
                                        positionX: px,
                                        aspectOverrides: {
                                          ...(selectedScene.aspectOverrides ||
                                            {}),
                                          [activeProject.aspectRatio]: {
                                            ...selectedSceneComp,
                                            positionX: px,
                                          },
                                        } as SceneItem["aspectOverrides"],
                                      });
                                    }}
                                  />
                                </div>

                                <div className="field-group">
                                  <label
                                    htmlFor="scene-pos-y-input"
                                    className="field-label"
                                  >
                                    Geser Posisi Vertikal (Y)
                                  </label>
                                  <input
                                    id="scene-pos-y-input"
                                    type="number"
                                    min="-100"
                                    max="100"
                                    className="studio-input tabular-nums"
                                    value={selectedSceneComp.positionY}
                                    onChange={(e) => {
                                      const py = Number(e.target.value) || 0;
                                      updateSelectedScene({
                                        positionY: py,
                                        aspectOverrides: {
                                          ...(selectedScene.aspectOverrides ||
                                            {}),
                                          [activeProject.aspectRatio]: {
                                            ...selectedSceneComp,
                                            positionY: py,
                                          },
                                        } as SceneItem["aspectOverrides"],
                                      });
                                    }}
                                  />
                                </div>
                              </div>

                              <div className="form-row-3col">
                                <div className="field-group">
                                  <label
                                    htmlFor="scene-motion-select"
                                    className="field-label"
                                  >
                                    Gerakan Kamera Halus
                                  </label>
                                  <select
                                    id="scene-motion-select"
                                    className="studio-select"
                                    value={selectedScene.motion}
                                    onChange={(e) =>
                                      updateSelectedScene({
                                        motion: e.target.value as SceneMotion,
                                      })
                                    }
                                  >
                                    <option value="none">Tanpa Gerakan</option>
                                    <option value="zoom-in">
                                      Zoom In Halus
                                    </option>
                                    <option value="zoom-out">
                                      Zoom Out Halus
                                    </option>
                                    <option value="pan-left">
                                      Geser Kiri (Pan Left)
                                    </option>
                                    <option value="pan-right">
                                      Geser Kanan (Pan Right)
                                    </option>
                                  </select>
                                </div>

                                <div className="field-group">
                                  <label
                                    htmlFor="scene-transition-select"
                                    className="field-label"
                                  >
                                    Transisi Masuk
                                  </label>
                                  <select
                                    id="scene-transition-select"
                                    className="studio-select"
                                    value={selectedScene.transitionIn}
                                    onChange={(e) =>
                                      updateSelectedScene({
                                        transitionIn: e.target
                                          .value as TransitionType,
                                      })
                                    }
                                  >
                                    <option value="none">Tanpa Transisi</option>
                                    <option value="fade">
                                      Fade (Pudar Halus)
                                    </option>
                                    <option value="slide">Slide (Geser)</option>
                                    <option value="wipe">Wipe (Sapuan)</option>
                                  </select>
                                </div>

                                <div className="field-group">
                                  <label
                                    htmlFor="scene-trans-dur-input"
                                    className="field-label"
                                  >
                                    Overlap Transisi (detik)
                                  </label>
                                  <input
                                    id="scene-trans-dur-input"
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    max="3"
                                    className="studio-input tabular-nums"
                                    value={selectedScene.transitionDurationSec}
                                    onChange={(e) =>
                                      updateSelectedScene({
                                        transitionDurationSec: Math.max(
                                          0,
                                          Number(e.target.value) || 0,
                                        ),
                                      })
                                    }
                                  />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* TAB 2: TEKS & HARGA */}
                      {activeTab === "text" && (
                        <div>
                          <h3 className="section-title">
                            Badge Harga Properti &amp; Teks Tiap Adegan
                          </h3>

                          <div
                            className="form-row-3col"
                            style={{ marginBottom: 16 }}
                          >
                            <div className="field-group">
                              <label
                                htmlFor="price-badge-text"
                                className="field-label"
                              >
                                Teks Badge Harga Resmi
                              </label>
                              <input
                                id="price-badge-text"
                                type="text"
                                className="studio-input tabular-nums"
                                value={activeProject.textStyle.priceBadgeText}
                                onChange={(e) =>
                                  handleUpdateProject((prev) => ({
                                    ...prev,
                                    textStyle: {
                                      ...prev.textStyle,
                                      priceBadgeText: e.target.value,
                                    },
                                  }))
                                }
                              />
                            </div>

                            <div className="field-group">
                              <label
                                htmlFor="price-font-scale"
                                className="field-label"
                              >
                                Skala Ukuran Tulisan Harga (0.7x – 2.0x)
                              </label>
                              <input
                                id="price-font-scale"
                                type="number"
                                step="0.1"
                                min="0.7"
                                max="2.0"
                                className="studio-input tabular-nums"
                                value={
                                  activeProject.textStyle.priceFontScale || 1.0
                                }
                                onChange={(e) =>
                                  handleUpdateProject((prev) => ({
                                    ...prev,
                                    textStyle: {
                                      ...prev.textStyle,
                                      priceFontScale:
                                        Number(e.target.value) || 1.0,
                                    },
                                  }))
                                }
                              />
                            </div>

                            <div className="field-group">
                              <span className="field-label">
                                Tampilkan Harga
                              </span>
                              <label
                                className="field-label-inline"
                                style={{ marginTop: 10 }}
                              >
                                <input
                                  type="checkbox"
                                  checked={
                                    activeProject.textStyle.showPriceBadge ??
                                    true
                                  }
                                  onChange={(e) =>
                                    handleUpdateProject((prev) => ({
                                      ...prev,
                                      textStyle: {
                                        ...prev.textStyle,
                                        showPriceBadge: e.target.checked,
                                      },
                                    }))
                                  }
                                />{" "}
                                Aktifkan Badge Harga di Layar
                              </label>
                            </div>
                          </div>

                          <div className="cue-list">
                            {activeProject.scenes.map((sc, idx) => {
                              const charLen =
                                `${sc.title} ${sc.bodyText}`.trim().length;
                              const isLong = charLen > SCENE_TEXT_WARN_LENGTH;
                              return (
                                <div key={sc.id} className="cue-item">
                                  <div className="cue-item-header">
                                    <span>
                                      Adegan {idx + 1} [{sc.roomLabel}]
                                    </span>
                                    <span
                                      className="tabular-nums"
                                      style={{
                                        color: isLong ? "#fde68a" : undefined,
                                      }}
                                    >
                                      {charLen}/{SCENE_TEXT_WARN_LENGTH}{" "}
                                      karakter
                                    </span>
                                  </div>
                                  <div
                                    className="form-row-2col"
                                    style={{ marginTop: 0 }}
                                  >
                                    <div className="field-group">
                                      <label
                                        htmlFor={`scene-title-${sc.id}`}
                                        className="field-label"
                                      >
                                        Judul Adegan {idx + 1}
                                      </label>
                                      <input
                                        id={`scene-title-${sc.id}`}
                                        type="text"
                                        className="studio-input"
                                        value={sc.title}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          handleUpdateProject((prev) => ({
                                            ...prev,
                                            scenes: prev.scenes.map((item) =>
                                              item.id === sc.id
                                                ? { ...item, title: val }
                                                : item,
                                            ),
                                          }));
                                        }}
                                      />
                                    </div>
                                    <div className="field-group">
                                      <label
                                        htmlFor={`scene-body-${sc.id}`}
                                        className="field-label"
                                      >
                                        Teks Isi Adegan {idx + 1}
                                      </label>
                                      <input
                                        id={`scene-body-${sc.id}`}
                                        type="text"
                                        className="studio-input"
                                        value={sc.bodyText}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          handleUpdateProject((prev) => ({
                                            ...prev,
                                            scenes: prev.scenes.map((item) =>
                                              item.id === sc.id
                                                ? { ...item, bodyText: val }
                                                : item,
                                            ),
                                          }));
                                        }}
                                      />
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* TAB 3: LOGO & KONTAK */}
                      {activeTab === "logo" && (
                        <div>
                          <div className="section-header-row">
                            <div>
                              <h3 className="section-title">
                                Watermark Logo &amp; Kartu Kontak Agen
                              </h3>
                              <p className="section-subtitle">
                                Kontak dapat tampil sepanjang video atau pada 3
                                detik terakhir.
                              </p>
                            </div>
                            <label
                              className="btn btn-secondary btn-sm"
                              style={{ cursor: "pointer" }}
                            >
                              <span>Unggah Logo PNG/WebP</span>
                              <input
                                type="file"
                                accept="image/png,image/webp,image/svg+xml"
                                className="sr-only"
                                onChange={(e) =>
                                  void handleUploadFiles(e.target.files, "logo")
                                }
                              />
                            </label>
                          </div>

                          <div className="form-row-2col">
                            <div className="field-group">
                              <label
                                htmlFor="agent-name-input"
                                className="field-label"
                              >
                                Nama Agen / Marketing
                              </label>
                              <input
                                id="agent-name-input"
                                type="text"
                                className="studio-input"
                                value={activeProject.logoContact.agentName}
                                onChange={(e) =>
                                  handleUpdateProject((prev) => ({
                                    ...prev,
                                    logoContact: {
                                      ...prev.logoContact,
                                      agentName: e.target.value,
                                    },
                                  }))
                                }
                              />
                            </div>

                            <div className="field-group">
                              <label
                                htmlFor="agency-name-input"
                                className="field-label"
                              >
                                Nama Kantor Agensi
                              </label>
                              <input
                                id="agency-name-input"
                                type="text"
                                className="studio-input"
                                value={activeProject.logoContact.agency}
                                onChange={(e) =>
                                  handleUpdateProject((prev) => ({
                                    ...prev,
                                    logoContact: {
                                      ...prev.logoContact,
                                      agency: e.target.value,
                                    },
                                  }))
                                }
                              />
                            </div>
                          </div>

                          <div className="form-row-2col">
                            <div className="field-group">
                              <label
                                htmlFor="whatsapp-input"
                                className="field-label"
                              >
                                Nomor WhatsApp / Telepon
                              </label>
                              <input
                                id="whatsapp-input"
                                type="text"
                                className="studio-input tabular-nums"
                                value={activeProject.logoContact.whatsapp}
                                onChange={(e) =>
                                  handleUpdateProject((prev) => ({
                                    ...prev,
                                    logoContact: {
                                      ...prev.logoContact,
                                      whatsapp: e.target.value,
                                      phone: e.target.value,
                                    },
                                  }))
                                }
                              />
                            </div>

                            <div className="field-group">
                              <label
                                htmlFor="contact-display-select"
                                className="field-label"
                              >
                                Waktu Tampil Kontak
                              </label>
                              <select
                                id="contact-display-select"
                                className="studio-select"
                                value={activeProject.logoContact.contactDisplay}
                                onChange={(e) =>
                                  handleUpdateProject((prev) => ({
                                    ...prev,
                                    logoContact: {
                                      ...prev.logoContact,
                                      contactDisplay: e.target.value as
                                        | "always"
                                        | "outro-3s",
                                    },
                                  }))
                                }
                              >
                                <option value="always">Sepanjang Video</option>
                                <option value="outro-3s">
                                  3 Detik Terakhir Saja
                                </option>
                              </select>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* TAB 4: AUDIO */}
                      {activeTab === "audio" && (
                        <div>
                          <div className="section-header-row">
                            <div>
                              <h3 className="section-title">
                                Musik Latar, Voice-Over &amp; Auto Ducking
                              </h3>
                              <p className="section-subtitle">
                                Ducking otomatis menurunkan musik menjadi 30%
                                selama voice-over atau video bersuara aktif.
                              </p>
                            </div>
                            <label
                              className="btn btn-secondary btn-sm"
                              style={{ cursor: "pointer" }}
                            >
                              <span>Unggah MP3/WAV/M4A</span>
                              <input
                                type="file"
                                accept="audio/*"
                                className="sr-only"
                                onChange={(e) =>
                                  void handleUploadFiles(
                                    e.target.files,
                                    "audio",
                                  )
                                }
                              />
                            </label>
                          </div>

                          <div className="form-row-2col">
                            <div className="field-group">
                              <label
                                htmlFor="music-select"
                                className="field-label"
                              >
                                Trek Musik Latar
                              </label>
                              <select
                                id="music-select"
                                className="studio-select"
                                value={activeProject.musicTrack.mediaId ?? ""}
                                onChange={(e) =>
                                  handleUpdateProject((prev) => ({
                                    ...prev,
                                    musicTrack: {
                                      ...prev.musicTrack,
                                      mediaId: e.target.value || null,
                                    },
                                  }))
                                }
                              >
                                <option value="">Tanpa Musik Latar</option>
                                {mediaList
                                  .filter((m) => m.kind === "audio")
                                  .map((m) => (
                                    <option key={m.id} value={m.id}>
                                      {m.originalName}
                                    </option>
                                  ))}
                              </select>
                            </div>

                            <div className="field-group">
                              <label
                                htmlFor="vo-select"
                                className="field-label"
                              >
                                Trek Voice-Over Narasi
                              </label>
                              <select
                                id="vo-select"
                                className="studio-select"
                                value={
                                  activeProject.voiceoverTrack.mediaId ?? ""
                                }
                                onChange={(e) =>
                                  handleUpdateProject((prev) => ({
                                    ...prev,
                                    voiceoverTrack: {
                                      ...prev.voiceoverTrack,
                                      mediaId: e.target.value || null,
                                    },
                                    subtitleStale: true,
                                  }))
                                }
                              >
                                <option value="">Tanpa Voice-Over</option>
                                {mediaList
                                  .filter((m) => m.kind === "audio")
                                  .map((m) => (
                                    <option key={m.id} value={m.id}>
                                      {m.originalName}
                                    </option>
                                  ))}
                              </select>
                            </div>
                          </div>

                          <div className="form-row-3col">
                            <div className="field-group">
                              <label
                                htmlFor="music-vol-input"
                                className="field-label"
                              >
                                Volume Musik (0 - 1)
                              </label>
                              <input
                                id="music-vol-input"
                                type="number"
                                step="0.05"
                                min="0"
                                max="1"
                                className="studio-input tabular-nums"
                                value={activeProject.musicTrack.volume}
                                onChange={(e) =>
                                  handleUpdateProject((prev) => ({
                                    ...prev,
                                    musicTrack: {
                                      ...prev.musicTrack,
                                      volume: Number(e.target.value) || 0,
                                    },
                                  }))
                                }
                              />
                            </div>

                            <div className="field-group">
                              <label
                                htmlFor="music-fade-in"
                                className="field-label"
                              >
                                Fade In / Out Musik (detik)
                              </label>
                              <input
                                id="music-fade-in"
                                type="number"
                                step="0.5"
                                min="0"
                                max="5"
                                className="studio-input tabular-nums"
                                value={activeProject.musicTrack.fadeInSec}
                                onChange={(e) => {
                                  const f = Math.max(
                                    0,
                                    Number(e.target.value) || 0,
                                  );
                                  handleUpdateProject((prev) => ({
                                    ...prev,
                                    musicTrack: {
                                      ...prev.musicTrack,
                                      fadeInSec: f,
                                      fadeOutSec: f,
                                    },
                                  }));
                                }}
                              />
                            </div>

                            <div className="field-group">
                              <span className="field-label">Opsi Audio</span>
                              <div
                                className="toolbar-left"
                                style={{ marginTop: 6 }}
                              >
                                <label className="field-label-inline">
                                  <input
                                    type="checkbox"
                                    checked={activeProject.duckingEnabled}
                                    onChange={(e) =>
                                      handleUpdateProject((prev) => ({
                                        ...prev,
                                        duckingEnabled: e.target.checked,
                                      }))
                                    }
                                  />{" "}
                                  Ducking 30%
                                </label>
                                <label className="field-label-inline">
                                  <input
                                    type="checkbox"
                                    checked={activeProject.musicTrack.loop}
                                    onChange={(e) =>
                                      handleUpdateProject((prev) => ({
                                        ...prev,
                                        musicTrack: {
                                          ...prev.musicTrack,
                                          loop: e.target.checked,
                                        },
                                      }))
                                    }
                                  />{" "}
                                  Ulang Musik
                                </label>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* TAB 5: SUBTITLE & GAYA SUBTITLE */}
                      {activeTab === "subtitles" && (
                        <div>
                          <div className="section-header-row">
                            <div>
                              <h3 className="section-title">
                                Auto Subtitle &amp; Pengaturan Tampilan
                              </h3>
                              <p className="section-subtitle">
                                {whisperStatus?.statusText ||
                                  "Transformers.js + ONNX Runtime CPU (q8)"}
                              </p>
                            </div>
                            <div className="toolbar-left">
                              {!whisperStatus?.ready ? (
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => setShowWhisperConfirm(true)}
                                >
                                  Unduh &amp; Siapkan Model Lokal
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                disabled={transcribing}
                                onClick={() => {
                                  if (activeProject.subtitles.length > 0) {
                                    setShowRegenConfirm(true);
                                  } else {
                                    void handleRunTranscription();
                                  }
                                }}
                              >
                                {transcribing
                                  ? "Mentranskripsi..."
                                  : activeProject.subtitles.length > 0
                                    ? "Generate Ulang Subtitle"
                                    : "Generate Subtitle Otomatis"}
                              </button>
                            </div>
                          </div>

                          {showWhisperConfirm && (
                            <div className="notice-banner notice-warning">
                              <p style={{ margin: "0 0 8px 0" }}>
                                <strong>
                                  Konfirmasi Penyiapan Model Whisper Lokal:
                                </strong>{" "}
                                Mesin menggunakan{" "}
                                <code>
                                  onnx-community/whisper-tiny_timestamped
                                </code>{" "}
                                (q8) di <code>studio-data/models/</code>.
                              </p>
                              <div className="toolbar-left">
                                <button
                                  type="button"
                                  className="btn btn-primary btn-sm"
                                  onClick={() =>
                                    void handlePrepareWhisperModel()
                                  }
                                >
                                  Setuju &amp; Siapkan Model
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-sm"
                                  onClick={() => setShowWhisperConfirm(false)}
                                >
                                  Batal
                                </button>
                              </div>
                            </div>
                          )}

                          {showRegenConfirm && (
                            <div className="conflict-alert-box">
                              <div className="conflict-alert-title">
                                Ganti Koreksi Subtitle Saat Ini?
                              </div>
                              <div className="toolbar-left">
                                <button
                                  type="button"
                                  className="btn btn-primary btn-sm"
                                  onClick={() => void handleRunTranscription()}
                                >
                                  Ya, Generate Ulang
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-sm"
                                  onClick={() => setShowRegenConfirm(false)}
                                >
                                  Batal
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Pengaturan Font, Ukuran, Posisi, Outline & Background Subtitle */}
                          <div className="form-row-3col">
                            <div className="field-group">
                              <label
                                htmlFor="sub-size-input"
                                className="field-label"
                              >
                                Ukuran Font Subtitle (px)
                              </label>
                              <input
                                id="sub-size-input"
                                type="number"
                                min="18"
                                max="48"
                                className="studio-input tabular-nums"
                                value={activeProject.subtitleStyle.fontSize}
                                onChange={(e) =>
                                  handleUpdateProject((prev) => ({
                                    ...prev,
                                    subtitleStyle: {
                                      ...prev.subtitleStyle,
                                      fontSize: Number(e.target.value) || 28,
                                    },
                                  }))
                                }
                              />
                            </div>

                            <div className="field-group">
                              <label
                                htmlFor="sub-pos-select"
                                className="field-label"
                              >
                                Posisi Subtitle
                              </label>
                              <select
                                id="sub-pos-select"
                                className="studio-select"
                                value={activeProject.subtitleStyle.position}
                                onChange={(e) =>
                                  handleUpdateProject((prev) => ({
                                    ...prev,
                                    subtitleStyle: {
                                      ...prev.subtitleStyle,
                                      position: e.target.value as
                                        | "bottom"
                                        | "middle"
                                        | "top",
                                    },
                                  }))
                                }
                              >
                                <option value="bottom">Bawah</option>
                                <option value="middle">Tengah</option>
                                <option value="top">Atas</option>
                              </select>
                            </div>

                            <div className="field-group">
                              <label
                                htmlFor="sub-bg-input"
                                className="field-label"
                              >
                                Opacity Latar Subtitle (0 - 1)
                              </label>
                              <input
                                id="sub-bg-input"
                                type="number"
                                step="0.05"
                                min="0"
                                max="1"
                                className="studio-input tabular-nums"
                                value={activeProject.subtitleStyle.bgOpacity}
                                onChange={(e) =>
                                  handleUpdateProject((prev) => ({
                                    ...prev,
                                    subtitleStyle: {
                                      ...prev.subtitleStyle,
                                      bgOpacity: Number(e.target.value) || 0.85,
                                    },
                                  }))
                                }
                              />
                            </div>
                          </div>

                          <div
                            className="toolbar-left"
                            style={{ marginTop: 12 }}
                          >
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => {
                                const newCue: SubtitleCue = {
                                  id: `manual-${Date.now()}`,
                                  sourceType: "manual",
                                  sourceMediaId: null,
                                  sourceStartSec: 0,
                                  sourceEndSec: 2.5,
                                  startSec: 0,
                                  endSec: 2.5,
                                  text: "Subtitle manual baru",
                                  words: [],
                                  hidden: false,
                                  isManual: true,
                                };
                                handleUpdateProject((prev) => ({
                                  ...prev,
                                  subtitles: [...prev.subtitles, newCue],
                                }));
                              }}
                            >
                              + Baris Manual
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() =>
                                handleDownloadTextFile(
                                  `${activeProject.id}.srt`,
                                  formatSrt(mappedSubtitles),
                                )
                              }
                            >
                              Unduh SRT
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() =>
                                handleDownloadTextFile(
                                  `${activeProject.id}.vtt`,
                                  formatVtt(mappedSubtitles),
                                )
                              }
                            >
                              Unduh VTT
                            </button>
                          </div>

                          <div className="cue-list">
                            {visibleSubtitles.map((cue, idx) => (
                              <div key={cue.id} className="cue-item">
                                <div className="cue-item-header">
                                  <span className="tabular-nums">
                                    #{idx + 1} · {cue.startSec.toFixed(2)}d –{" "}
                                    {cue.endSec.toFixed(2)}d ·{" "}
                                    {cue.words.length > 0
                                      ? `${cue.words.length} kata bertimestamp`
                                      : "Teks biasa"}
                                  </span>
                                  <div className="toolbar-left">
                                    <button
                                      type="button"
                                      className="btn btn-ghost btn-sm"
                                      onClick={() => {
                                        const [a, b] = splitSubtitleCue(cue);
                                        handleUpdateProject((prev) => ({
                                          ...prev,
                                          subtitles: prev.subtitles.flatMap(
                                            (item) =>
                                              item.id === cue.id
                                                ? [a, b]
                                                : [item],
                                          ),
                                        }));
                                      }}
                                    >
                                      Pecah
                                    </button>
                                    {idx < visibleSubtitles.length - 1 && (
                                      <button
                                        type="button"
                                        className="btn btn-ghost btn-sm"
                                        onClick={() => {
                                          const nextCue =
                                            visibleSubtitles[idx + 1];
                                          const merged = mergeSubtitleCues(
                                            cue,
                                            nextCue,
                                          );
                                          handleUpdateProject((prev) => ({
                                            ...prev,
                                            subtitles: prev.subtitles
                                              .filter(
                                                (item) =>
                                                  item.id !== nextCue.id,
                                              )
                                              .map((item) =>
                                                item.id === cue.id
                                                  ? merged
                                                  : item,
                                              ),
                                          }));
                                        }}
                                      >
                                        Gabung Berikutnya
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      className="btn btn-danger btn-sm"
                                      onClick={() =>
                                        handleUpdateProject((prev) => ({
                                          ...prev,
                                          subtitles: prev.subtitles.filter(
                                            (item) => item.id !== cue.id,
                                          ),
                                        }))
                                      }
                                    >
                                      Hapus
                                    </button>
                                  </div>
                                </div>

                                <div
                                  className="form-row-3col"
                                  style={{ marginBottom: 8, marginTop: 0 }}
                                >
                                  <div className="field-group">
                                    <label className="field-label">
                                      Mulai (detik)
                                    </label>
                                    <input
                                      type="number"
                                      step="0.1"
                                      min="0"
                                      className="studio-input tabular-nums"
                                      value={cue.startSec}
                                      onChange={(e) => {
                                        const st = Math.max(
                                          0,
                                          Number(e.target.value) || 0,
                                        );
                                        handleUpdateProject((prev) => ({
                                          ...prev,
                                          subtitles: prev.subtitles.map(
                                            (item) =>
                                              item.id === cue.id
                                                ? {
                                                    ...item,
                                                    startSec: st,
                                                    sourceStartSec: st,
                                                    isManual: true,
                                                  }
                                                : item,
                                          ),
                                        }));
                                      }}
                                    />
                                  </div>
                                  <div className="field-group">
                                    <label className="field-label">
                                      Selesai (detik)
                                    </label>
                                    <input
                                      type="number"
                                      step="0.1"
                                      min="0.2"
                                      className="studio-input tabular-nums"
                                      value={cue.endSec}
                                      onChange={(e) => {
                                        const en = Math.max(
                                          cue.startSec + 0.2,
                                          Number(e.target.value) || 1,
                                        );
                                        handleUpdateProject((prev) => ({
                                          ...prev,
                                          subtitles: prev.subtitles.map(
                                            (item) =>
                                              item.id === cue.id
                                                ? {
                                                    ...item,
                                                    endSec: en,
                                                    sourceEndSec: en,
                                                    isManual: true,
                                                  }
                                                : item,
                                          ),
                                        }));
                                      }}
                                    />
                                  </div>
                                  <div className="field-group">
                                    <label className="field-label">
                                      Koreksi Teks
                                    </label>
                                    <input
                                      type="text"
                                      aria-label={`Teks Subtitle ${idx + 1}`}
                                      className="studio-input"
                                      value={cue.text}
                                      onChange={(e) => {
                                        const newText = e.target.value;
                                        handleUpdateProject((prev) => ({
                                          ...prev,
                                          subtitles: prev.subtitles.map(
                                            (item) =>
                                              item.id === cue.id
                                                ? updateSubtitleCueText(
                                                    item,
                                                    newText,
                                                  )
                                                : item,
                                          ),
                                        }));
                                      }}
                                    />
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>

                          {hiddenSubtitles.length > 0 && (
                            <div className="legacy-archive-box">
                              <div className="legacy-archive-header">
                                <span className="legacy-archive-title">
                                  Subtitle Tersembunyi (Di Luar Trim Klip:{" "}
                                  {hiddenSubtitles.length})
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </section>
                  </>
                )}
              </div>

              {/* RIGHT COLUMN: Live Remotion Player Preview, Safe Area, Ratio & Export */}
              <aside
                className="editor-right-column"
                aria-label="Preview dan Export"
              >
                <section className="studio-section">
                  <div className="section-header-row">
                    <div>
                      <h2 className="section-title">Preview Komposisi Live</h2>
                      <p className="section-subtitle tabular-nums">
                        Rasio {activeProject.aspectRatio} · Total{" "}
                        {timeline.totalDurationSec.toFixed(1)} detik (
                        {timeline.totalFrames} frame @ 30 fps)
                      </p>
                    </div>
                    <div className="toolbar-left">
                      <select
                        aria-label="Rasio Cepat Preview"
                        className="studio-select studio-select-sm"
                        value={activeProject.aspectRatio}
                        onChange={(e) =>
                          handleUpdateProject((prev) => ({
                            ...prev,
                            aspectRatio: e.target.value as AspectRatio,
                          }))
                        }
                      >
                        <option value="9:16">9:16</option>
                        <option value="16:9">16:9</option>
                        <option value="1:1">1:1</option>
                      </select>
                      <select
                        aria-label="Kualitas Preview"
                        className="studio-select studio-select-sm"
                        value={previewQuality}
                        onChange={(e) =>
                          setPreviewQuality(
                            e.target.value as "proxy" | "full",
                          )
                        }
                      >
                        <option value="proxy">Proxy Ringan (720p)</option>
                        <option value="full">Penuh (1080p)</option>
                      </select>
                      <label className="field-label-inline">
                        <input
                          type="checkbox"
                          checked={showSafeArea}
                          onChange={(e) => setShowSafeArea(e.target.checked)}
                        />{" "}
                        Safe Area
                      </label>
                    </div>
                  </div>

                  <div className="player-preview-wrapper">
                    <Player
                      ref={playerRef}
                      component={StudioVideo}
                      inputProps={{
                        project: activeProject,
                        mediaMap,
                        showSafeArea,
                      }}
                      durationInFrames={timeline.totalFrames}
                      fps={30}
                      compositionWidth={playerDims.width}
                      compositionHeight={playerDims.height}
                      style={{
                        width: previewWidth,
                        height: previewHeight,
                        borderRadius: 8,
                      }}
                      controls
                      acknowledgeRemotionLicense
                    />
                  </div>

                  {/* Timeline Strip */}
                  <div className="timeline-strip" aria-label="Timeline Adegan">
                    {timeline.scenes.map((st) => {
                      const sc = activeProject.scenes[st.index];
                      if (!sc) return null;
                      const active = selectedScene?.id === sc.id;
                      return (
                        <button
                          key={sc.id}
                          type="button"
                          className={`timeline-chip ${
                            active ? "timeline-chip-active" : ""
                          }`}
                          onClick={() => {
                            setSelectedSceneId(sc.id);
                            playerRef.current?.seekTo(st.startFrame);
                          }}
                        >
                          <div style={{ fontWeight: 700 }}>
                            #{st.index + 1} {sc.roomLabel || sc.title.slice(0, 12)}
                          </div>
                          <div className="tabular-nums">
                            {st.startSec.toFixed(1)}d – {st.endSec.toFixed(1)}d
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>

                {/* Export Video Panel */}
                <section
                  className="studio-section"
                  aria-labelledby="heading-export-video"
                >
                  <h2 id="heading-export-video" className="section-title">
                    Export Video (MP4 H.264 Media Asli)
                  </h2>
                  <p className="section-subtitle">
                    Menggunakan komposisi yang konsisten dengan preview dan
                    menyimpan hasil ke Home.
                  </p>

                  <div className="form-row-2col">
                    <div className="field-group">
                      <label htmlFor="export-res-select" className="field-label">
                        Resolusi Output
                      </label>
                      <select
                        id="export-res-select"
                        className="studio-select"
                        value={exportResolution}
                        onChange={(e) =>
                          setExportResolution(
                            e.target.value as "720p" | "1080p",
                          )
                        }
                      >
                        <option value="720p">720p HD (Cepat &amp; Ringan)</option>
                        <option value="1080p">1080p Full HD (Media Asli)</option>
                      </select>
                    </div>

                    <div className="field-group">
                      <label htmlFor="export-fps-select" className="field-label">
                        Frame Rate (FPS)
                      </label>
                      <select
                        id="export-fps-select"
                        className="studio-select"
                        value={exportFps}
                        onChange={(e) =>
                          setExportFps(Number(e.target.value) as 24 | 30)
                        }
                      >
                        <option value={30}>30 FPS (Reels/TikTok)</option>
                        <option value={24}>24 FPS (Sinematik)</option>
                      </select>
                    </div>
                  </div>

                  <div className="field-group" style={{ marginTop: 12 }}>
                    <label
                      htmlFor="export-filename-input"
                      className="field-label"
                    >
                      Nama File MP4
                    </label>
                    <input
                      id="export-filename-input"
                      type="text"
                      className="studio-input"
                      value={exportFileName}
                      onChange={(e) => setExportFileName(e.target.value)}
                    />
                  </div>

                  <div
                    style={{
                      marginTop: 12,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                    }}
                  >
                    <label className="field-label-inline">
                      <input
                        type="checkbox"
                        checked={activeProject.subtitleBurnIn}
                        onChange={(e) =>
                          handleUpdateProject((prev) => ({
                            ...prev,
                            subtitleBurnIn: e.target.checked,
                          }))
                        }
                      />{" "}
                      Subtitle Menyatu di Video
                    </label>

                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => void handleExportVideo()}
                    >
                      Export Video
                    </button>
                  </div>
                </section>
              </aside>
            </div>
          </div>
        )}

        {/* =========================================================
            VIEW 3: HASIL VIDEO (RENDER JOBS)
           ========================================================= */}
        {viewMode === "renders" && (
          <section className="studio-section">
            <div className="section-header-row">
              <div>
                <h1 className="section-title" style={{ fontSize: "1.25rem" }}>
                  Hasil Video &amp; Antrean Export MP4
                </h1>
                <p className="section-subtitle">
                  Mendukung pembatalan (Cancel), pengulangan (Retry), pemutaran
                  langsung, unduhan SRT/VTT, serta lokasi file lokal.
                </p>
              </div>
              <div className="toolbar-left">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => void handleSwitchView("home")}
                >
                  Ke Beranda (Home)
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => void handleSwitchView("studio", "editor")}
                >
                  Kembali ke Editor
                </button>
              </div>
            </div>

            {playingRenderJob && playingRenderJob.mp4Url && (
              <div
                className="studio-section"
                style={{
                  marginBottom: 20,
                  backgroundColor: "var(--bg-input)",
                }}
              >
                <div className="section-header-row">
                  <div>
                    <h2 className="section-title">
                      Memutar: {playingRenderJob.outputFileName}
                    </h2>
                    <p className="section-subtitle tabular-nums">
                      Proyek: {playingRenderJob.projectName} ·{" "}
                      {playingRenderJob.resolution} @ {playingRenderJob.fps} fps
                      · Lokasi: {playingRenderJob.localFilePath}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setPlayingRenderJob(null)}
                  >
                    Tutup Pemutar
                  </button>
                </div>
                <video
                  src={playingRenderJob.mp4Url}
                  controls
                  autoPlay
                  style={{
                    width: "100%",
                    maxHeight: 420,
                    borderRadius: 8,
                    backgroundColor: "#000",
                  }}
                />
              </div>
            )}

            {renderJobs.length === 0 ? (
              <p className="empty-state-text">
                Belum ada hasil video yang diexport. Buka Editor lalu tekan
                tombol Export Video.
              </p>
            ) : (
              <div className="renders-grid">
                {renderJobs.map((job) => (
                  <article key={job.id} className="render-card">
                    <div className="render-thumb-box">
                      {job.thumbUrl ? (
                        <img
                          src={job.thumbUrl}
                          alt={job.projectName}
                          className="render-thumb-img"
                          referrerPolicy="no-referrer"
                        />
                      ) : null}
                    </div>

                    <div>
                      <div
                        style={{
                          fontWeight: 700,
                          fontSize: "0.96rem",
                          color: "var(--text-primary)",
                        }}
                      >
                        {job.outputFileName}
                      </div>
                      <div className="scene-info-meta tabular-nums">
                        {job.projectName} · {job.resolution} · {job.fps} FPS ·{" "}
                        {job.durationSec.toFixed(1)}d · Status:{" "}
                        {job.status.toUpperCase()} ({job.stageLabel})
                      </div>
                      <div
                        className="scene-info-meta tabular-nums"
                        style={{ marginTop: 4 }}
                      >
                        Lokasi File: <code>{job.localFilePath}</code>
                      </div>
                    </div>

                    <div className="progress-bar-track">
                      <div
                        className="progress-bar-fill"
                        style={{ width: `${job.progress}%` }}
                      />
                    </div>

                    {job.error && (
                      <div
                        className="conflict-alert-box"
                        style={{ marginTop: 0 }}
                      >
                        {job.error}
                      </div>
                    )}

                    <div className="toolbar-left">
                      {job.status === "completed" && job.mp4Url && (
                        <>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => setPlayingRenderJob(job)}
                          >
                            Putar
                          </button>
                          <a
                            href={job.mp4Url}
                            download={job.outputFileName}
                            className="btn btn-secondary btn-sm"
                            style={{ textDecoration: "none" }}
                          >
                            Unduh MP4
                          </a>
                        </>
                      )}
                      {(job.status === "queued" ||
                        job.status === "rendering") && (
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => void handleCancelRenderJob(job.id)}
                        >
                          Batalkan
                        </button>
                      )}
                      {(job.status === "failed" ||
                        job.status === "cancelled") && (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => void handleRetryRenderJob(job.id)}
                        >
                          Coba Lagi
                        </button>
                      )}
                      {job.srtUrl && (
                        <a
                          href={job.srtUrl}
                          download={`${job.id}.srt`}
                          className="btn btn-ghost btn-sm"
                          style={{ textDecoration: "none" }}
                        >
                          SRT
                        </a>
                      )}
                      {job.vttUrl && (
                        <a
                          href={job.vttUrl}
                          download={`${job.id}.vtt`}
                          className="btn btn-ghost btn-sm"
                          style={{ textDecoration: "none" }}
                        >
                          VTT
                        </a>
                      )}
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                          const target = projects.find(
                            (p) => p.id === job.projectId,
                          );
                          if (target) {
                            setSelectedProjectId(target.id);
                            void handleSwitchView("studio", "editor");
                          }
                        }}
                      >
                        Buka Proyek
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => setConfirmDeleteRenderId(job.id)}
                      >
                        Hapus
                      </button>
                    </div>

                    {confirmDeleteRenderId === job.id && (
                      <div
                        className="conflict-alert-box"
                        style={{ marginTop: 4 }}
                      >
                        <p style={{ margin: "0 0 8px 0" }}>
                          Hapus file hasil render{" "}
                          <strong>{job.outputFileName}</strong>?
                        </p>
                        <div className="toolbar-left">
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={() => void handleDeleteRenderJob(job.id)}
                          >
                            Ya, Hapus Hasil
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => setConfirmDeleteRenderId(null)}
                          >
                            Batal
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
};
