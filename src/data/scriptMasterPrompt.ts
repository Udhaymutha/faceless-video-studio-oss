import type {
  EpisodeFormat,
  ScriptBriefConfig,
  ScriptGenre,
  ScriptProject,
  ScriptWriterWorkspaceState,
} from "../types/scriptWriter";

export const MAX_EPISODES_PER_SEASON = 10;
export const WORDS_PER_MINUTE = 150;
export const DEFAULT_DURATION_MINUTES = 20;

export const SCRIPT_GENRES: Array<{
  id: ScriptGenre;
  label: string;
  tagline: string;
}> = [
  {
    id: "Survival",
    label: "Survival",
    tagline: "Grounded survival science, system collapse & human resilience",
  },
  {
    id: "Apocalypse",
    label: "Apocalypse",
    tagline: "Catastrophic civilization collapse, grid failure & rebuilding",
  },
  {
    id: "Horror",
    label: "Horror",
    tagline: "Grounded dread, isolation, extreme environmental terror",
  },
  {
    id: "Sci-Fi",
    label: "Sci-Fi",
    tagline: "Hard science-fiction crises, orbital, solar & tech collapse",
  },
  {
    id: "Adventure",
    label: "Adventure",
    tagline: "High-stakes expeditions, harsh terrain & impossible crossings",
  },
  {
    id: "Comedy",
    label: "Comedy",
    tagline: "Dry human irony and absurdly grounded survival mishaps",
  },
  {
    id: "Fun",
    label: "Fun",
    tagline: "Engaging curiosity-driven survival thought experiments",
  },
  {
    id: "Romantic",
    label: "Romantic",
    tagline: "Human connection and endurance tested under crisis",
  },
];

export const EPISODE_FORMAT_OPTIONS: Array<{
  id: EpisodeFormat;
  label: string;
  shortLabel: string;
  description: string;
  isSerialized: boolean;
}> = [
  {
    id: "single",
    label: "Single Episode",
    shortLabel: "Single",
    description: "Standalone complete story arc with full resolution",
    isSerialized: false,
  },
  {
    id: "multiple",
    label: "Multiple Episodes",
    shortLabel: "Multi-Part",
    description: "Ongoing multi-part series with season & episode continuity",
    isSerialized: true,
  },
  {
    id: "long_run",
    label: "Long-Run Series",
    shortLabel: "Long-Run",
    description: "Broad world & deep timeline built across seasons (10 eps/season)",
    isSerialized: true,
  },
  {
    id: "sequel",
    label: "Sequel",
    shortLabel: "Sequel",
    description: "Continues directly after a prior collapse or previous episode",
    isSerialized: true,
  },
  {
    id: "prequel",
    label: "Prequel",
    shortLabel: "Prequel",
    description: "Warning signs & cascading failures leading up to the event",
    isSerialized: true,
  },
];

export const DURATION_QUICK_OPTIONS = [2, 10, 15, 20, 25];
export const SHORTS_MULTI_DURATION_OPTIONS = [1, 2, 3, 5, 10];
export const SHORT_REEL_SECONDS = 30;
export const SHORT_REEL_WORDS = 75; // 30 seconds at 150 WPM

export const STORY_DIRECTION_PRESETS = [
  "Slow-burn romantic tension",
  "Jealousy & emotional rivalry",
  "Possessive protective dynamic",
  "Hidden betrayal twist",
  "High-stakes moral dilemma",
  "Unlikely alliance under crisis",
];

export function calculateTargetWords(durationMinutes: number): number {
  const safeMinutes = Math.max(1, Math.min(60, durationMinutes));
  return Math.round(safeMinutes * WORDS_PER_MINUTE);
}

export function calculateTargetWordsFromSeconds(durationSeconds: number): number {
  const safeSeconds = Math.max(15, Math.min(3600, durationSeconds));
  return Math.round((safeSeconds / 60) * WORDS_PER_MINUTE);
}

export function calculateShortsSegmentCount(
  format: EpisodeFormat,
  durationMinutes: number
): number {
  if (format === "single") return 1;
  return Math.max(1, Math.round((durationMinutes * 60) / SHORT_REEL_SECONDS));
}

export function isSerializedFormat(format: EpisodeFormat): boolean {
  return format !== "single";
}

export function countSpokenWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

export const SCRIPT_BRIEF_VERSION = 2;

/**
 * The user's exact Master Script Writer Prompt, structured into three clean
 * studio parts (chat-style back-and-forth questions moved into native UI controls).
 */
export const DEFAULT_SCRIPT_BRIEF: ScriptBriefConfig = {
  part1TopicAndTitleRules: `You are an expert YouTube content strategist, researcher, and immersive storyteller for an English-language, faceless, narrated channel about apocalypse situations, catastrophic survival stories, and the collapse and rebuilding of modern civilization.

TOPIC DNA:
- Core test: choose a universal modern dependency or survival crisis (electricity, clean water, medicine, food supply, internet, winter, cities, law and order, shelter, radiation, pandemics, supervolcanoes, asteroids, solar flares, supply chains) and tell the story of ordinary people living through it when it fails.
- Every topic must have: (1) a counterintuitive reversal of a common movie myth or assumption woven naturally into the events of the story, (2) real scientific, engineering, historical, or survival facts grounding every twist in the plot so it carries 15 to 25 minutes per episode, (3) a clear timeline scale (hours, days, months, years, or decades after the event), (4) an emotional payoff of awe, humility, or pleasant unease.
- Spread topics across three families: Immediate Survival ("What happens when..." / "How would humans survive..."), Systemic Collapse ("What happens to [system/place] after..."), and Aftermath & Rebuilding ("How long would it take..." / "What would the world look like...").
- Worldview: real survival is far different from Hollywood action cliches; modern comfort makes us blind to how fragile our systems are; survival depends on forgotten practical skills, cooperation, and harsh physics rather than lone-wolf heroics; human resilience is real, but the margin for error is razor-thin.
- Avoid: pure fantasy with zero scientific basis (like magic), modern partisan politics, and topics resting mostly on baseless conspiracy theories.
- Never repeat and never suggest a variant of any previously covered or previously suggested topic.

TITLE RULES:
- 6 to 11 words, typically 7 to 9. Title Case. At most one word in ALL CAPS. No numbers, emojis, brackets, version tags (never append 1.1, v2, Ep 1, or draft suffixes), or clickbait punctuation.
- Verify strict English grammar and singular/plural agreement (for example, "Every Cargo Ship", never "Every Cargo Ships").
- Primary formulas:
  A. I Survived [apocalypse or survival condition]
  B. Stranded in [survival condition]
- Click mechanics: a familiar modern comfort stripped away, extremes ("Deadly", "Should've Killed Everyone"), time-frame stakes ("First Day", "After One Year"), self-implication through "You", "We", or "I", and one clean promise with a built-in curiosity gap.`,

  part2ContinuityAndScopeRules: `NARRATIVE SCOPE & EPISODE CONTINUITY:
- Single Episode: Deliver a complete, self-contained story arc with full resolution, opening with a high-stakes cold open before grounding the moment the catastrophe begins.
- Multiple Episodes: Cover the current phase of the story in depth and end the episode with a natural narrative hook leading into the next episode.
- Long-Run Series: Establish a broad world, deep timeline, and foundational survival stakes built to sustain many installments across seasons, ending with an open-ended bridge to the next chapter.
- Sequel: Build directly on the aftermath of a prior collapse or previous episode, picking up seamlessly from the retained continuity without resetting to "the day it started."
- Prequel: Focus on overlooked warning signs, cascading failures, and final hours leading up to the catastrophe, ending right as the main event begins.

CRITICAL EPISODE-TO-EPISODE OPENING RULE:
- Episode 1 (or Standalone Single Episode): NEVER spend the first 45 seconds on slow everyday errands or casual buildup. Open with a 15-second (35 to 50 words) high-stakes cold open pulled from the peak crisis or immediate survival consequence ("By day twenty-one, the street lights had been dead for four nights, and two men with crowbars were standing in my neighbor's driveway..."), then immediately snap back to the ordinary moment ("Three weeks earlier, I was just...") and trigger the first shift within the first 35 seconds of the episode.
- Episode 2+ (and Sequels): NEVER restart with "On the day it started..." or repeat the Episode 1 setup. Open with a 15-second immediate-danger hook from the current timeline, then advance seamlessly from the exact location, depleted resources, cast roster, and unresolved cliffhanger.

SEASON FINALE — PARTIAL CONCLUSION & NEXT-SEASON HANDOFF:
- When a season reaches its finale (such as the final planned episode of a season), deliver a PARTIAL CONCLUSION — never an abrupt cut-off and never a permanent series ending unless explicitly concluding the entire series.
- Resolve the immediate season's central survival crisis and character arc in a satisfying, conclusive way while deliberately leaving a deeper unanswered threat, shifting horizon, or suspenseful revelation open in the final beat.
- When Season 2 (or any new season) opens on Episode 1, begin as a FRESH CHAPTER with new stakes and forward momentum while maintaining 100 percent continuity with the established world, cast roster, emotional history, and exact storytelling voice of Season 1.

SERIES ENDING CONTROL:
- Partial Conclusion (Season Finale): Close the current season's main crisis conclusively while leaving suspenseful momentum so the next season launches cleanly as a fresh chapter in the same voice.
- Full Conclusion: Resolve all active story arcs, survival stakes, and character fates cleanly with no sudden cliffhanger.
- Tight Suspenseful Ending: Resolve the immediate episode beat while keeping overarching tension tight and open-ended so the story can either stop there or continue later.

SHORTS / REELS MODE (30-SECOND CONTINUITY PACING):
- When Shorts Mode is enabled with Single Episode: write a single punchy 30-second YouTube Short / Instagram Reel script (~75 spoken words at 150 WPM) with an immediate 3-second hook, one sharp lived turning point grounded in real detail, and a memorable closing punch.
- When Shorts Mode is enabled with Multi-Episode / Serialized formats: pace the full episode script so it splits cleanly into consecutive 30-second reel segments (~75 spoken words per paragraph/beat). Place a clean paragraph break at every 30-second boundary so natural pauses and breathing gaps preserve seamless story continuity from one 30-second reel to the next — without adding any part numbers, timestamps, or labels inside the spoken text.
- Long-Form Shorts Funnel Rule: Even in standard long-form mode, ensure the episode naturally contains 3 to 5 self-contained, high-tension 30-to-45-second survival moments (crisis alerts, sudden shortages, midnight confrontations) that can be clipped directly as companion YouTube Shorts linking back to the full episode.

CHARACTER CONSISTENCY & USER CREATIVE DIRECTION:
- Keep every chosen or AI-generated character name, role, and relationship 100 percent consistent across the entire episode and all future episodes.
- Weave multi-character dialogue beats naturally in spoken prose without script tags so text-to-speech reads smoothly.
- Honor all custom user creative direction (such as romance, jealousy, possessiveness, interpersonal conflict, or specific plot twists) naturally inside the narrator's lived experience without breaking the grounded storytelling voice.

DURATION & WORD COUNT:
- Default length: 3,000 words (~20 minutes at 150 words per minute).
- Scale word count to 150 words per minute for any selected duration (within about 5 percent of target).
- For durations under 3 minutes, compress cleanly into story hook, two plot/survival beats, reflection recap, and button line.`,

  part3ScriptDnaAndTtsRules: `RESEARCH BEFORE WRITING (MANDATORY):
- Ground every scientific, engineering, historical, and survival detail in verified papers, government preparedness reports, engineering studies, historical disaster records, and university/museum sources via live web search.
- Do not rely on other YouTube videos or transcripts. Separate established fact from modeling or projection ("scientists had estimated", "nobody could predict for sure"). Never present unverified claims or projections as guaranteed fact.

SCRIPT DNA — LANGUAGE & VOICE:
- American English in Roman script. Imperial units first (miles, feet, pounds, degrees Fahrenheit), occasional metric.
- Pure first-person ("I" / "we") or close lived storyteller voice, never a classroom lecture or hypothetical "what if" explainer.
- Warm, gripping, conversational tone with quiet underdog grit and plain 8th-grade vocabulary. Explain real science naturally through what the characters see, feel, hear, and do in real time.
- Keep every beat anchored in concrete, physical, visualizable action (locations, objects, lighting, weather, faces, movement) rather than abstract conceptual essays, so every 20 to 30 seconds gives clear visual scenes without needing diagrams or filler text.
- Sentences mostly 6 to 18 words, with frequent 3 to 6 word punches. Flowing paragraphs with natural contractions.
- Natural storytelling moves: "Now,", "So,", "And", "But"; "Here's the thing", "Here's what nobody expects", "Think about that", "That was the moment everything changed", "And it got worse", "That wasn't X. That was Y."
- Include tricolons, stacked physical lists, limits-of-knowledge turns, one high-stakes wrong guess, one itemized survival problem list played out in order, one skeptic proven wrong, and a callback to the opening scene.

11-BEAT STORYTELLING FRAMEWORK (IN ORDER):
1. Story Hook (120 to 250 words total: open immediately with 35 to 50 words of peak crisis/consequence to hook viewers in the first 15 seconds, then snap back into a tight 60 to 100 word ordinary-day grounding before the first shift hits).
2. The First Shift (normal rules stop working within the first 45 seconds of narration).
3. The False Assumption (what everyone expected versus harsh reality).
4. The Core Survival Question framed through immediate stakes.
5. Narrative Progression Chain (3 to 6 chronological chapters of 200 to 450 words each, weaving verified research into lived action).
6. Peak Crisis Scene ("let me take you into that night...").
7. Turning Point / major reversal beat.
8. Hidden Mechanism ("why things broke this way" grounded in real science).
9. Narrative Reflection ("So, looking back at what actually happened" in parallel clauses).
10. Before-Versus-After Inversion contrasting modern comfort with raw survival.
11. Closing Button Line (10 to 30 words — emotional truth, plus bridge/cliffhanger if continuing, partial conclusion on a season finale, or clean resolution if concluding). No subscribe/like requests, disclaimers, or sponsors.

STRICT TTS OUTPUT CONTRACT:
- Output ONLY the exact words to be spoken, ready to paste directly into a text-to-speech tool without deleting anything.
- Zero titles, headings, chapter labels, speaker names before dialogue, timestamps, brackets, stage directions, notes, sources, emojis, markdown, or word counts.
- Write units out in full words (feet, pounds, miles, degrees Fahrenheit, percent). Use "15 to 20" instead of "15-20". Use BC and AD for eras. Spell names in standard English without diacritics. Expand abbreviations. Avoid dashes, semicolons, parentheses, and slashes.`,
};

export function createEmptyScriptProject(
  genre: ScriptGenre = "Survival"
): ScriptProject {
  const now = Date.now();
  return {
    id: `script-project-${crypto.randomUUID()}`,
    title: "",
    genre,
    format: "single",
    shortsMode: false,
    plannedEpisodeCount: MAX_EPISODES_PER_SEASON,
    durationMinutes: DEFAULT_DURATION_MINUTES,
    customStoryNotes: "",
    characterMode: "solo",
    characters: [],
    seasons: [{ seasonNumber: 1, episodes: [] }],
    continuityState: null,
    concludingSeries: false,
    endingStyle: "continuing",
    createdAt: now,
    updatedAt: now,
  };
}

export function createInitialScriptWorkspace(): ScriptWriterWorkspaceState {
  const initialProject = createEmptyScriptProject("Survival");
  return {
    projects: [initialProject],
    activeProjectId: initialProject.id,
    selectedGenre: "Survival",
    suggestedTopics: [],
    analyzedTopics: [],
    briefConfig: { ...DEFAULT_SCRIPT_BRIEF },
    briefVersion: SCRIPT_BRIEF_VERSION,
    updatedAt: Date.now(),
  };
}
