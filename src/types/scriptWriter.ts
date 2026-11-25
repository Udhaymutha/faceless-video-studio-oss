export type ScriptGenre =
  | "Survival"
  | "Apocalypse"
  | "Horror"
  | "Sci-Fi"
  | "Adventure"
  | "Comedy"
  | "Fun"
  | "Romantic";

export type EpisodeFormat =
  | "single"
  | "multiple"
  | "long_run"
  | "sequel"
  | "prequel";

export type CharacterMode = "solo" | "custom" | "ai_choose";

export type EndingStyle =
  | "continuing"
  | "season_partial_conclusion"
  | "full_conclusion"
  | "tight_suspense";

export type TopicFamily =
  | "Immediate Survival"
  | "Systemic Collapse"
  | "Aftermath & Rebuilding";

export interface TopicSuggestion {
  id: string;
  title: string;
  family: TopicFamily;
  formula: "I Survived" | "Stranded in" | "Genre Hook";
  genre: ScriptGenre;
}

export interface ScriptCharacter {
  id: string;
  name: string;
  role: string;
  status: string;
  introducedIn: string;
}

export interface ContinuityState {
  catastrophePhase: string;
  elapsedTimeline: string;
  primarySetting: string;
  systemsAndResources: string;
  activeCastSummary: string;
  unresolvedCliffhanger: string;
  lastEpisodeEndingExcerpt: string;
}

export interface ResearchSource {
  title: string;
  uri: string;
}

export interface ScriptEpisode {
  id: string;
  seasonNumber: number;
  episodeNumber: number; // 1..10 per season
  episodeTitle: string;
  scriptText: string; // Strictly TTS-ready spoken words only
  wordCount: number;
  targetMinutes: number;
  targetSeconds?: number;
  isShortsMode?: boolean;
  shortsSegmentCount?: number;
  endingStyle: EndingStyle;
  researchSources: ResearchSource[];
  continuitySnapshot?: ContinuityState;
  generatedAt: number;
  updatedAt: number;
}

export interface ScriptSeason {
  seasonNumber: number;
  episodes: ScriptEpisode[]; // max 10 episodes per season
}

export interface ScriptProject {
  id: string;
  title: string;
  genre: ScriptGenre;
  format: EpisodeFormat;
  shortsMode: boolean; // Checkbox: 30s reels for Single Episode, or 30s-segmented continuity scripts for Multi-Episode
  plannedEpisodeCount: number; // Number of episodes planned per season (1..10, default 10)
  durationMinutes: number; // default 20 (3,000 words at 150 WPM)
  customStoryNotes: string; // Freeform user direction (e.g. romance, jealousy, possessiveness, plot twists)
  characterMode: CharacterMode;
  characters: ScriptCharacter[];
  seasons: ScriptSeason[];
  continuityState: ContinuityState | null;
  concludingSeries: boolean;
  endingStyle: EndingStyle;
  createdAt: number;
  updatedAt: number;
}

export interface ScriptBriefConfig {
  part1TopicAndTitleRules: string;
  part2ContinuityAndScopeRules: string;
  part3ScriptDnaAndTtsRules: string;
}

export interface ScriptWriterWorkspaceState {
  projects: ScriptProject[];
  activeProjectId: string;
  selectedGenre: ScriptGenre;
  suggestedTopics: TopicSuggestion[];
  analyzedTopics: string[];
  briefConfig: ScriptBriefConfig;
  briefVersion?: number;
  updatedAt: number;
}

export interface ScriptBackupPayload {
  version: number;
  exportedAt: number;
  appName: "FrameForge";
  scriptWriter: ScriptWriterWorkspaceState;
  studioSettings?: Record<string, unknown>;
}
