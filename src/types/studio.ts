export type AspectRatio = "16:9" | "4:3" | "1:1" | "3:4" | "9:16";

export type ImageModel =
  | "gemini-3.1-flash-lite-image"
  | "gemini-nano-banana-2.1";

export type ImageSize = "1K" | "2K";

export type ThemeMode = "dark" | "light" | "system";

export type SceneStatus =
  | "idle"
  | "queued"
  | "generating"
  | "completed"
  | "error";

export type StudioView =
  | "script"
  | "narration"
  | "breakdown"
  | "storyboard"
  | "bulk"
  | "config"
  | "presets"
  | "export";

export type SceneFilter = "all" | "completed" | "pending" | "error";

export interface InstructionPreset {
  id: string;
  name: string;
  summary: string;
  instructions: string;
  negativeRules: string;
  defaultAspectRatio: AspectRatio;
  isBuiltIn?: boolean;
  updatedAt: number;
}

export interface ReferenceImage {
  name: string;
  characterName: string;
  characterNotes: string;
  data: string; // raw base64 without data URL prefix
  mimeType: string;
  previewUrl: string;
}

export interface MasterPromptReview {
  styleLock: string;
  characterProfile: string;
  activeRules: string[];
  readyForBatch: boolean;
  reviewedWithReference: boolean;
  reviewedAt: number;
  signature: string;
}

export interface SceneItem {
  id: string;
  prompt: string;
  narration?: string;
  useReferenceCharacter: boolean;
  status: SceneStatus;
  imageDataUrl?: string;
  mimeType?: string;
  compiledPrompt?: string;
  errorMessage?: string;
  generatedAt?: number;
}

export interface BatchPromptEntry {
  id: string;
  prompt: string;
  narration?: string;
}

export interface SequenceBatch {
  batchIndex: number; // 0-based (0 = Batch 1)
  startNumber: number; // 1, 21, 41, ...
  prompts: BatchPromptEntry[]; // up to 20 prompts in this batch
  completedCount: number;
  failedCount: number;
  isCached: boolean;
  lastCachedAt?: number;
}

export interface BatchSettings {
  activePresetId: string;
  aspectRatio: AspectRatio;
  model: ImageModel;
  imageSize: ImageSize;
  concurrency: 1 | 2 | 3;
  startNumber: number;
  lastUsedSceneNumber: number;
  targetImageCount: number; // 1..400
  theme: ThemeMode;
  autoGenerateNextSequence: boolean;
}

export interface ToastMessage {
  id: string;
  text: string;
  tone: "neutral" | "success" | "error";
}
