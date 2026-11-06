import { SubtitleCue, SubtitleWord, WhisperModelStatus } from "../shared/model";

export function getWhisperModelId(): string;
export function readWhisperState(modelsDir: string): WhisperModelStatus;
export function writeWhisperReadyState(modelsDir: string): WhisperModelStatus;
export function buildWordTimestampsForSegment(
  text: string,
  startSec: number,
  endSec: number,
): SubtitleWord[];
export function transcribeAudioSource(params: {
  sourceType: "video" | "voiceover";
  sourceMediaId: string | null;
  durationSec: number;
  language: "id" | "en" | "auto";
  sceneTitle: string;
}): SubtitleCue[];
