export interface BeatLine {
  sceneNumber: number;
  text: string;
}

export interface CoverageCheckMetrics {
  totalLines: number;
  totalScriptWords: number;
  totalBeatWords: number;
  estimatedTotalSeconds: number;
  averageLineSeconds: number;
  linesPerMinute: number;
  exactCoverageMatch: boolean;
  coverageMessage: string;
}

export interface BreakdownScenePrompt {
  sceneNumber: number;
  narrationCovered: string;
  characterPresent: boolean;
  imagePrompt: string;
  videoPrompt: string; // Empty string when no video prompt is needed for this scene
  status: "idle" | "generating" | "completed" | "error";
  errorMessage?: string;
}

export interface SceneBreakdownPromptConfig {
  module1BeatPrompt: string;
  module2VisualPrompt: string;
}

export interface CharacterSheetAttachment {
  name: string;
  mimeType: string;
  size: number;
  kind: "image" | "pdf" | "text";
  data?: string;
  previewUrl?: string;
  textContent?: string;
}

export interface SceneBreakdownWorkspaceState {
  scriptText: string;
  sourceTitle: string;
  sourceEpisodeCode: string;
  wpm: number;
  characterSheet: string;
  characterSheetFile?: CharacterSheetAttachment | null;
  beats: BeatLine[];
  coverageCheck: CoverageCheckMetrics | null;
  scenePrompts: BreakdownScenePrompt[];
  promptConfig: SceneBreakdownPromptConfig;
  updatedAt: number;
}
