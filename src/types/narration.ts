export type TtsModelId = "gemini-3.8-flash-tts" | "gemini-3.8-flash-lite-tts";

export type NarrationPace =
  | "slow_suspense"
  | "measured_doc"
  | "natural"
  | "urgent_tense"
  | "fast_thriller";

export type NarrationPunctuationMode =
  | "natural_breath"
  | "dramatic_pauses"
  | "tight_shorts"
  | "strict_literal";

export type NarrationEmotion =
  | "documentary_grit"
  | "whispered_suspense"
  | "bold_authoritative"
  | "loud_urgent"
  | "warm_intimate"
  | "dark_haunting"
  | "calm_reflective"
  | "tense_breathless"
  | "emotional_raw";

export interface VoiceProfile {
  name: string;
  gender: "Male" | "Female";
  tone: string;
  bestFor: string;
  sampleLine: string;
}

export interface NarrationSegment {
  id: string;
  index: number;
  type: "speech" | "pause";
  text: string;
  pauseSeconds?: number;
  styleOverride?: string;
  cueLabel?: string;
  status: "idle" | "generating" | "completed" | "error";
  wavBase64?: string;
  durationSeconds?: number;
  errorMessage?: string;
}

export interface NarrationWorkspaceState {
  scriptText: string;
  sourceTitle: string;
  sourceEpisodeCode: string;
  voiceName: string;
  model: TtsModelId;
  pace: NarrationPace;
  punctuationMode: NarrationPunctuationMode;
  emotion: NarrationEmotion;
  customDirection: string;
  lastAudioBlob?: Blob | null;
  lastAudioDuration?: number;
  lastAudioVoice?: string;
  lastGeneratedAt?: number;
  updatedAt: number;
}
