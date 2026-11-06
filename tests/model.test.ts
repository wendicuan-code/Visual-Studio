import test from "node:test";
import assert from "node:assert/strict";
import {
  appendArchiveText,
  buildEditAnalysisEnvelope,
  detectBriefConflicts,
  extractPropertyFacts,
  migrateLegacyBriefFields,
} from "../shared/edit-brief";
import {
  computeTimeline,
  distributeUnitDescriptionToScenes,
  formatSrt,
  formatVtt,
  getMusicEffectiveVolumeAtSec,
  mapSourceSubtitlesToTimeline,
  mergeSubtitleCues,
  SceneItem,
  splitSubtitleCue,
  SubtitleCue,
  updateSubtitleCueText,
  generateThreeConceptsFromProject,
  applyConceptToProject,
  buildAiAssistantProposal,
  splitSceneAtMidpoint,
  getSceneCompositionForAspect,
  Project,
} from "../shared/model";

const sampleScenes: SceneItem[] = [
  {
    id: "s1",
    mediaId: "m1",
    kind: "image",
    roomLabel: "Fasad Utama",
    prioritized: false,
    title: "Fasad Utama",
    bodyText: "Ruko 3 lantai siap pakai",
    durationSec: 4,
    trimStartSec: 0,
    trimEndSec: 4,
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
    id: "s2",
    mediaId: "m2",
    kind: "video",
    roomLabel: "Interior Lantai 1",
    prioritized: true,
    title: "Interior Lantai 1",
    bodyText: "Area komersial luas",
    durationSec: 6,
    trimStartSec: 1,
    trimEndSec: 5, // effective 4s
    volume: 0.9,
    muted: false,
    fitMode: "cover",
    positionX: 0,
    positionY: 0,
    zoomScale: 1,
    motion: "pan-right",
    transitionIn: "fade",
    transitionDurationSec: 1, // 1s overlap
  },
  {
    id: "s3",
    mediaId: "m3",
    kind: "image",
    roomLabel: "Lokasi Strategis",
    prioritized: false,
    title: "Lokasi Strategis",
    bodyText: "Dekat pelabuhan & pusat bisnis",
    durationSec: 3,
    trimStartSec: 0,
    trimEndSec: 3,
    volume: 1,
    muted: true,
    fitMode: "cover",
    positionX: 0,
    positionY: 0,
    zoomScale: 1,
    motion: "zoom-out",
    transitionIn: "slide",
    transitionDurationSec: 5, // should be clamped to max half of min(4s, 3s) = 1.5s
  },
];

test("computeTimeline calculates frame-accurate durations, clamped overlaps, and ducking", () => {
  const tl = computeTimeline(
    {
      scenes: sampleScenes,
      voiceoverTrack: {
        mediaId: "vo-1",
        startSec: 0.5,
        volume: 1,
        fadeInSec: 0,
        fadeOutSec: 0,
        loop: false,
      },
      duckingEnabled: true,
    },
    30,
    2.5,
  );

  assert.equal(tl.scenes.length, 3);
  assert.equal(tl.scenes[0].startSec, 0);
  assert.equal(tl.scenes[0].endSec, 4);
  // Scene 2 overlaps by 1s -> starts at 3s, ends at 7s
  assert.equal(tl.scenes[1].startSec, 3);
  assert.equal(tl.scenes[1].endSec, 7);
  // Scene 3 requested 5s overlap, clamped to floor(min(120, 90)/2) = 45 frames = 1.5s -> starts at 5.5s, ends at 8.5s
  assert.equal(tl.scenes[2].overlapInSec, 1.5);
  assert.equal(tl.scenes[2].startSec, 5.5);
  assert.equal(tl.scenes[2].endSec, 8.5);
  assert.equal(tl.totalDurationSec, 8.5);

  // Ducking intervals include video scene 2 (3s..7s) and voiceover (0.5s..3s)
  assert.equal(tl.duckIntervals.length, 2);
  const musicTrack = {
    mediaId: "music-1",
    startSec: 0,
    volume: 0.8,
    fadeInSec: 0,
    fadeOutSec: 0,
    loop: true,
  };
  // At 0.2s (not ducked) -> 0.8
  assert.equal(
    getMusicEffectiveVolumeAtSec(musicTrack, tl.duckIntervals, 0.2, tl.totalDurationSec),
    0.8,
  );
  // At 1.0s (ducked by voiceover) -> 0.8 * 0.3 = 0.24
  assert.equal(
    getMusicEffectiveVolumeAtSec(musicTrack, tl.duckIntervals, 1.0, tl.totalDurationSec),
    0.24,
  );
});

test("distributeUnitDescriptionToScenes deterministically distributes lines and puts remainder in last scene", () => {
  const unitDescription = [
    "Harga Penawaran: Rp 1.850.000.000",
    "Dimensi Bangunan: LT/LB 90/210 m2",
    "Fasilitas Kamar: 3 KT dan 3 KM lengkap",
    "Legalitas: UWTO 2045, Hadap Timur",
  ].join("\n");

  const result = distributeUnitDescriptionToScenes(unitDescription, sampleScenes);
  assert.equal(result.scenes.length, 3);
  assert.equal(result.scenes[0].title, "Harga Penawaran");
  assert.equal(result.scenes[0].bodyText, "Rp 1.850.000.000");
  assert.equal(result.scenes[1].title, "Dimensi Bangunan");
  assert.equal(result.scenes[1].bodyText, "LT/LB 90/210 m2");
  // Remainder lines (3rd and 4th) are merged into the last scene
  assert.equal(result.scenes[2].title, "Fasilitas Kamar");
  assert.equal(
    result.scenes[2].bodyText,
    "3 KT dan 3 KM lengkap • Legalitas: UWTO 2045, Hadap Timur",
  );
});

test("migrateLegacyBriefFields preserves legacy description/direction without guessing and defaults alternativeCount to 3", () => {
  const migrated = migrateLegacyBriefFields({
    description: "Teks deskripsi lama utuh",
    direction: "Arahan lama utuh",
  });
  assert.equal(migrated.description, "Teks deskripsi lama utuh");
  assert.equal(migrated.direction, "Arahan lama utuh");
  assert.equal(migrated.unitDescription, "");
  assert.equal(migrated.editPrompt, "");
  assert.equal(migrated.alternativeCount, 3);

  const appended = appendArchiveText("Baris 1", "Baris Arsip");
  assert.equal(appended, "Baris 1\nBaris Arsip");
});

test("extractPropertyFacts and detectBriefConflicts catch explicit factual discrepancies", () => {
  const unitText =
    "Harga Rp 1.850.000.000\nLT/LB: 90/210\n3 KT, 3 KM\nUWTO 2045\nHadap Timur";
  const promptText =
    "Tolong buat transisi cepat, tulis harga Rp 1.650.000.000 dan 4 KT Hadap Barat";

  const facts = extractPropertyFacts(unitText);
  assert.equal(facts.hargaRp, "Rp 1.850.000.000");
  assert.equal(facts.ltLb, "90/210");
  assert.equal(facts.kamarTidur, "3 KT");
  assert.equal(facts.kamarMandi, "3 KM");
  assert.equal(facts.uwto, "UWTO 2045");
  assert.equal(facts.hadap, "Hadap Timur");

  const conflicts = detectBriefConflicts(unitText, promptText);
  assert.equal(conflicts.length, 3);
  assert.deepEqual(
    conflicts.map((c) => c.field),
    ["hargaRp", "kamarTidur", "hadap"],
  );

  const envelope = buildEditAnalysisEnvelope({
    projectId: "proj-1",
    unitDescription: unitText,
    editPrompt: promptText,
    alternativeCount: 3,
    mediaSceneCount: 3,
  });
  assert.equal(envelope.providerStatus.available, false);
  assert.equal(envelope.constraints.forbidAutoRender, true);
  assert.equal(envelope.conflicts.length, 3);
});

test("mapSourceSubtitlesToTimeline hides trimmed cues, trims overlaps, and formats SRT/VTT", () => {
  const rawCues: SubtitleCue[] = [
    {
      id: "c1",
      sourceType: "video",
      sourceMediaId: "m2",
      sourceStartSec: 0,
      sourceEndSec: 0.8, // before trimStartSec=1 -> hidden!
      startSec: 0,
      endSec: 0.8,
      text: "Bagian yang terpotong awal",
      words: [],
      hidden: false,
      isManual: false,
    },
    {
      id: "c2",
      sourceType: "video",
      sourceMediaId: "m2",
      sourceStartSec: 1.5,
      sourceEndSec: 3.5, // maps to scene 2 start (3s) + (1.5-1) = 3.5s .. 5.5s
      startSec: 1.5,
      endSec: 3.5,
      text: "Lantai satu siap untuk usaha ritel",
      words: [
        { word: "Lantai", startSec: 1.5, endSec: 2.0 },
        { word: "satu", startSec: 2.0, endSec: 2.5 },
      ],
      hidden: false,
      isManual: false,
    },
    {
      id: "c3",
      sourceType: "manual",
      sourceMediaId: null,
      sourceStartSec: 5.0,
      sourceEndSec: 6.5, // overlaps with c2 at 5.0s -> c2 should be trimmed to 5.0s
      startSec: 5.0,
      endSec: 6.5,
      text: "Hubungi agen kami sekarang",
      words: [],
      hidden: false,
      isManual: true,
    },
  ];

  const mapped = mapSourceSubtitlesToTimeline(
    {
      scenes: sampleScenes,
      voiceoverTrack: {
        mediaId: null,
        startSec: 0,
        volume: 1,
        fadeInSec: 0,
        fadeOutSec: 0,
        loop: false,
      },
      subtitles: rawCues,
    },
    30,
  );

  assert.equal(mapped[0].hidden, true);
  assert.equal(mapped[1].hidden, false);
  assert.equal(mapped[1].startSec, 3.5);
  assert.equal(mapped[1].endSec, 5.0); // trimmed from 5.5 to 5.0 due to c3 starting at 5.0

  // Editing text clears word-level timestamps
  const edited = updateSubtitleCueText(mapped[1], "Lantai satu luas dan terang");
  assert.equal(edited.words.length, 0);

  // Split & Merge
  const [splitA, splitB] = splitSubtitleCue(mapped[2], 5.8);
  assert.equal(splitA.endSec, 5.8);
  assert.equal(splitB.startSec, 5.8);
  const merged = mergeSubtitleCues(splitA, splitB);
  assert.equal(merged.startSec, 5.0);
  assert.equal(merged.endSec, 6.5);
  assert.equal(merged.isManual, true);

  const srt = formatSrt(mapped);
  const vtt = formatVtt(mapped);
  assert.ok(srt.includes("00:00:03,500 --> 00:00:05,000"));
  assert.ok(vtt.startsWith("WEBVTT"));
  assert.ok(vtt.includes("00:00:05.000 --> 00:00:06.500"));
});

test("generateThreeConceptsFromProject, applyConceptToProject, and buildAiAssistantProposal work deterministically", () => {
  const mockProject: Project = {
    id: "proj-test",
    name: "Ruko Nagoya Hill",
    workflowStage: "input",
    description: "",
    direction: "",
    unitDescription:
      "Nama Unit: Ruko Nagoya Hill\nLokasi: Lubuk Baja, Batam\nHarga Penawaran: Rp 1.850.000.000\nDimensi: LT/LB 90/210 m2\nKamar: 3 KT, 3 KM\nLegalitas: UWTO 2045",
    editPrompt: "Gaya sinematik elegan, fokus fasad dan ruang tamu.",
    alternativeCount: 3,
    lastAnalysisEnvelope: null,
    aiConcepts: [],
    selectedConceptId: null,
    template: "properti-elegan",
    aspectRatio: "9:16",
    textStyle: {
      fontFamily: "Plus Jakarta Sans",
      textColor: "#FFFFFF",
      accentColor: "#f5b841",
      bgOpacity: 0.78,
      position: "bottom",
      showPriceBadge: true,
      priceBadgeText: "Rp 1.850.000.000",
      priceFontScale: 1,
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
      logoMediaId: null,
      logoPosition: "top-right",
      logoScale: 1,
      logoOpacity: 0.95,
      agentName: "Andi Pratama",
      phone: "0812-7788-9900",
      whatsapp: "0812-7788-9900",
      agency: "Batam Properti",
      contactDisplay: "always",
    },
    scenes: [
      { ...sampleScenes[0], roomLabel: "Ruang Tamu", prioritized: false },
      { ...sampleScenes[1], roomLabel: "Fasad Utama", prioritized: true },
      { ...sampleScenes[2], roomLabel: "Lokasi & Akses", prioritized: false },
    ],
    musicTrack: {
      mediaId: "music-1",
      startSec: 0,
      volume: 0.4,
      fadeInSec: 1,
      fadeOutSec: 1,
      loop: true,
    },
    voiceoverTrack: {
      mediaId: "vo-1",
      startSec: 0,
      volume: 1,
      fadeInSec: 0,
      fadeOutSec: 0,
      loop: false,
    },
    duckingEnabled: false,
    subtitles: [],
    subtitleBurnIn: true,
    subtitleSource: "both",
    subtitleLanguage: "id",
    subtitleStale: false,
    transcriptionGenerationId: 1,
    updatedAt: new Date().toISOString(),
  };

  const concepts = generateThreeConceptsFromProject(mockProject);
  assert.equal(concepts.length, 3);
  assert.deepEqual(
    concepts.map((c) => c.id),
    ["A", "B", "C"],
  );
  // Concept A should prioritize m2 (since prioritized=true) first
  assert.equal(concepts[0].storyboard[0].mediaId, "m2");
  assert.ok(concepts[0].hook.includes("Rp 1.850.000.000"));

  const applied = applyConceptToProject(mockProject, concepts[1]);
  assert.equal(applied.selectedConceptId, "B");
  assert.equal(applied.workflowStage, "editor");
  assert.equal(applied.scenes.length, 3);

  // Test AI Assistant commands
  const proposal = buildAiAssistantProposal(
    applied,
    "Persingkat jadi 12 detik. Utamakan fasad dan ruang tamu. Perbesar tulisan harga. Kurangi transisi. Turunkan musik saat narasi berbicara.",
  );
  assert.ok(proposal.summaryItems.length >= 4);
  assert.equal(proposal.updatedProject.duckingEnabled, true);
  assert.ok((proposal.updatedProject.textStyle.priceFontScale ?? 1) > 1);

  // Test splitSceneAtMidpoint and getSceneCompositionForAspect
  const splitPair = splitSceneAtMidpoint(sampleScenes[1]);
  assert.ok(splitPair !== null);
  assert.equal(splitPair[0].trimStartSec, 1);
  assert.equal(splitPair[0].trimEndSec, 3);
  assert.equal(splitPair[1].trimStartSec, 3);
  assert.equal(splitPair[1].trimEndSec, 5);

  const comp11 = getSceneCompositionForAspect(
    {
      ...sampleScenes[0],
      zoomScale: 1.1,
      aspectOverrides: {
        "1:1": { fitMode: "contain", zoomScale: 1.25, positionX: 10, positionY: -5 },
      },
    },
    "1:1",
  );
  assert.equal(comp11.fitMode, "contain");
  assert.equal(comp11.zoomScale, 1.25);
  assert.equal(comp11.positionX, 10);
});

