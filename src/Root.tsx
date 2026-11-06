import React from "react";
import { Composition } from "remotion";
import { HelloWorld } from "./HelloWorld";
import { StudioVideo } from "./StudioVideo";
import { Project, TEMPLATE_PRESETS } from "../shared/model";

const defaultProject: Project = {
  id: "default-remotion-studio",
  name: "Ruko Komersial Nagoya Hill",
  workflowStage: "editor",
  description: "",
  direction: "",
  unitDescription:
    "Harga Penawaran: Rp 1.850.000.000\nDimensi: LT/LB 90/210 m2\nFasilitas: 3 KT, 3 KM, UWTO 2045",
  editPrompt: "Tonjolkan lokasi strategis pusat bisnis Nagoya.",
  alternativeCount: 3,
  lastAnalysisEnvelope: null,
  aiConcepts: [],
  selectedConceptId: null,
  template: "properti-elegan",
  aspectRatio: "9:16",
  scenes: [],
  textStyle: TEMPLATE_PRESETS["properti-elegan"].textStyle,
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
    logoOpacity: 0.9,
    agentName: "Hendra Wijaya",
    phone: "0812-7788-9900",
    whatsapp: "WA 0812-7788-9900",
    agency: "Batam Properti Utama",
    contactDisplay: "always",
  },
  musicTrack: {
    mediaId: null,
    startSec: 0,
    volume: 0.6,
    fadeInSec: 1,
    fadeOutSec: 1.5,
    loop: true,
  },
  voiceoverTrack: {
    mediaId: null,
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
  updatedAt: new Date().toISOString(),
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="HelloWorld"
        component={HelloWorld as unknown as React.FC<Record<string, unknown>>}
        durationInFrames={150}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          titleText: "Selamat Datang di Batam Video Studio",
          titleColor: "#F8FAFC",
        }}
      />
      <Composition
        id="StudioVideo"
        component={StudioVideo as unknown as React.FC<Record<string, unknown>>}
        durationInFrames={300}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          project: defaultProject,
          mediaMap: {},
        }}
      />
    </>
  );
};
