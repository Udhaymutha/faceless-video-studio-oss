import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Film,
  FolderPlus,
  Layers,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  ScrollText,
  Sliders,
  Sparkles,
  Trash2,
  Upload,
  User,
  Users,
  X,
} from "lucide-react";
import {
  DEFAULT_DURATION_MINUTES,
  DEFAULT_SCRIPT_BRIEF,
  DURATION_QUICK_OPTIONS,
  EPISODE_FORMAT_OPTIONS,
  MAX_EPISODES_PER_SEASON,
  SCRIPT_BRIEF_VERSION,
  SCRIPT_GENRES,
  SHORTS_MULTI_DURATION_OPTIONS,
  SHORT_REEL_SECONDS,
  SHORT_REEL_WORDS,
  STORY_DIRECTION_PRESETS,
  WORDS_PER_MINUTE,
  calculateShortsSegmentCount,
  calculateTargetWords,
  countSpokenWords,
  createEmptyScriptProject,
  createInitialScriptWorkspace,
  isSerializedFormat,
} from "../data/scriptMasterPrompt";
import type {
  CharacterMode,
  ContinuityState,
  EndingStyle,
  EpisodeFormat,
  ResearchSource,
  ScriptBackupPayload,
  ScriptCharacter,
  ScriptEpisode,
  ScriptGenre,
  ScriptProject,
  ScriptSeason,
  ScriptWriterWorkspaceState,
  TopicSuggestion,
} from "../types/scriptWriter";
import type { BatchSettings, ToastMessage } from "../types/studio";
import {
  loadScriptWriterState,
  saveScriptWriterState,
} from "../utils/batchCache";
import { ScriptBriefModal } from "./ScriptBriefModal";

interface ScriptWriterViewProps {
  studioSettings: BatchSettings;
  onImportStudioSettings: (patch: Partial<BatchSettings>) => void;
  onNotify: (text: string, tone?: ToastMessage["tone"]) => void;
}

interface NextEpisodeTarget {
  seasonNumber: number;
  episodeNumber: number;
  opensNewSeason: boolean;
  isSeasonFinale: boolean;
}

function normalizeProject(raw: ScriptProject): ScriptProject {
  const planned =
    typeof raw.plannedEpisodeCount === "number" &&
    Number.isFinite(raw.plannedEpisodeCount)
      ? Math.max(1, Math.min(MAX_EPISODES_PER_SEASON, Math.floor(raw.plannedEpisodeCount)))
      : MAX_EPISODES_PER_SEASON;
  return {
    ...raw,
    shortsMode: Boolean(raw.shortsMode),
    plannedEpisodeCount: planned,
    customStoryNotes:
      typeof raw.customStoryNotes === "string" ? raw.customStoryNotes : "",
  };
}

function getAllProjectEpisodes(project: ScriptProject): ScriptEpisode[] {
  return project.seasons
    .slice()
    .sort((a, b) => a.seasonNumber - b.seasonNumber)
    .flatMap((season) =>
      season.episodes
        .slice()
        .sort((a, b) => a.episodeNumber - b.episodeNumber)
    );
}

function computeNextEpisodeTarget(project: ScriptProject): NextEpisodeTarget {
  if (!isSerializedFormat(project.format)) {
    return {
      seasonNumber: 1,
      episodeNumber: 1,
      opensNewSeason: false,
      isSeasonFinale: false,
    };
  }

  const seasonCap = Math.max(
    1,
    Math.min(
      MAX_EPISODES_PER_SEASON,
      project.plannedEpisodeCount || MAX_EPISODES_PER_SEASON
    )
  );

  const sortedSeasons = project.seasons
    .slice()
    .sort((a, b) => a.seasonNumber - b.seasonNumber);

  if (sortedSeasons.length === 0) {
    return {
      seasonNumber: 1,
      episodeNumber: 1,
      opensNewSeason: false,
      isSeasonFinale: seasonCap === 1,
    };
  }

  const latestSeason = sortedSeasons[sortedSeasons.length - 1];
  const episodeCount = latestSeason.episodes.length;

  if (episodeCount < seasonCap) {
    const highestEp = latestSeason.episodes.reduce(
      (max, ep) => Math.max(max, ep.episodeNumber),
      0
    );
    const nextEpNum = Math.min(seasonCap, highestEp + 1);
    return {
      seasonNumber: latestSeason.seasonNumber,
      episodeNumber: nextEpNum,
      opensNewSeason: false,
      isSeasonFinale: nextEpNum >= seasonCap,
    };
  }

  return {
    seasonNumber: latestSeason.seasonNumber + 1,
    episodeNumber: 1,
    opensNewSeason: true,
    isSeasonFinale: seasonCap === 1,
  };
}

function mergeDiscoveredCharacters(
  existing: ScriptCharacter[],
  addedByUser: Array<{ name: string; role: string }>,
  discovered: Array<{ name: string; role: string; status: string }>,
  episodeCode: string
): ScriptCharacter[] {
  const byName = new Map<string, ScriptCharacter>();

  for (const ch of existing) {
    const key = ch.name.trim().toLowerCase();
    if (!key) continue;
    byName.set(key, ch);
  }

  for (const ch of addedByUser) {
    const name = ch.name.trim();
    const key = name.toLowerCase();
    if (!key) continue;
    if (!byName.has(key)) {
      byName.set(key, {
        id: `char-${crypto.randomUUID()}`,
        name,
        role: ch.role.trim() || "Survivor",
        status: "Active",
        introducedIn: episodeCode,
      });
    }
  }

  for (const ch of discovered) {
    const name = ch.name.trim();
    const key = name.toLowerCase();
    if (!key) continue;
    const prev = byName.get(key);
    if (prev) {
      byName.set(key, {
        ...prev,
        role: prev.role || ch.role.trim() || "Survivor",
        status: ch.status.trim() || prev.status || "Active",
      });
    } else {
      byName.set(key, {
        id: `char-${crypto.randomUUID()}`,
        name,
        role: ch.role.trim() || "Survivor",
        status: ch.status.trim() || "Active",
        introducedIn: episodeCode,
      });
    }
  }

  return Array.from(byName.values());
}

function sanitizeFilename(input: string): string {
  return (
    input
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "script"
  );
}

function splitIntoShortSegments(scriptText: string): string[] {
  return scriptText
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function ScriptWriterView({
  studioSettings,
  onImportStudioSettings,
  onNotify,
}: ScriptWriterViewProps) {
  const [workspace, setWorkspace] = useState<ScriptWriterWorkspaceState>(() =>
    createInitialScriptWorkspace()
  );
  const [isHydrated, setIsHydrated] = useState(false);

  // UI view state
  const [selectedSeasonNumber, setSelectedSeasonNumber] = useState(1);
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | null>(
    null
  );
  const [isBriefModalOpen, setIsBriefModalOpen] = useState(false);
  const [showContinuityPanel, setShowContinuityPanel] = useState(false);
  const [showSourcesPanel, setShowSourcesPanel] = useState(false);
  const [showShortSplitsPanel, setShowShortSplitsPanel] = useState(false);
  const [showRevisionForm, setShowRevisionForm] = useState(false);
  const [revisionInput, setRevisionInput] = useState("");
  const [copiedTts, setCopiedTts] = useState(false);
  const [copiedSegmentIdx, setCopiedSegmentIdx] = useState<number | null>(null);

  // Character drafts (Stage 3 custom entry & Episode 2+ inline new character prompt)
  const [newCharName, setNewCharName] = useState("");
  const [newCharRole, setNewCharRole] = useState("");
  const [nextEpCharChoice, setNextEpCharChoice] = useState<
    "none" | "custom" | "ai_choose"
  >("none");
  const [nextEpCustomChars, setNextEpCustomChars] = useState<
    Array<{ id: string; name: string; role: string }>
  >([]);

  // Async loading & error states
  const [isLoadingTopics, setIsLoadingTopics] = useState(false);
  const [topicError, setTopicError] = useState<string | null>(null);
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [generatingStatusLabel, setGeneratingStatusLabel] = useState("");
  const [isRevisingScript, setIsRevisingScript] = useState(false);

  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const scriptOutputRef = useRef<HTMLDivElement | null>(null);
  const hasAutoFetchedTopicsRef = useRef(false);

  // Hydrate workspace from IndexedDB on mount
  useEffect(() => {
    let cancelled = false;
    const hydrate = async () => {
      try {
        const saved = await loadScriptWriterState();
        if (
          !cancelled &&
          saved &&
          Array.isArray(saved.projects) &&
          saved.projects.length > 0
        ) {
          const normalizedProjects = saved.projects.map(normalizeProject);
          const needsBriefUpgrade =
            (saved.briefVersion ?? 1) < SCRIPT_BRIEF_VERSION;
          const restored: ScriptWriterWorkspaceState = {
            ...saved,
            projects: normalizedProjects,
            briefConfig: needsBriefUpgrade
              ? { ...DEFAULT_SCRIPT_BRIEF }
              : saved.briefConfig,
            briefVersion: SCRIPT_BRIEF_VERSION,
          };
          setWorkspace(restored);
          const activeProj =
            normalizedProjects.find((p) => p.id === restored.activeProjectId) ??
            normalizedProjects[0];
          const allEps = getAllProjectEpisodes(activeProj);
          if (allEps.length > 0) {
            const latest = allEps[allEps.length - 1];
            setSelectedSeasonNumber(latest.seasonNumber);
            setSelectedEpisodeId(latest.id);
          } else {
            setSelectedSeasonNumber(1);
            setSelectedEpisodeId(null);
          }
        }
      } catch {
        // Use initial workspace fallback
      } finally {
        if (!cancelled) setIsHydrated(true);
      }
    };
    void hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-persist workspace to IndexedDB whenever it mutates after hydration
  useEffect(() => {
    if (!isHydrated) return;
    void saveScriptWriterState(workspace).catch(() => undefined);
  }, [workspace, isHydrated]);

  const activeProject = useMemo(
    () =>
      normalizeProject(
        workspace.projects.find((p) => p.id === workspace.activeProjectId) ??
          workspace.projects[0]
      ),
    [workspace.projects, workspace.activeProjectId]
  );

  const serialized = isSerializedFormat(activeProject.format);
  const isSingleShortReel = activeProject.shortsMode && !serialized;
  const plannedEpisodeCount = activeProject.plannedEpisodeCount;
  const shortsSegmentCount = activeProject.shortsMode
    ? calculateShortsSegmentCount(
        activeProject.format,
        activeProject.durationMinutes
      )
    : 0;

  const allEpisodes = useMemo(
    () => getAllProjectEpisodes(activeProject),
    [activeProject]
  );
  const nextEpisodeTarget = useMemo(
    () => computeNextEpisodeTarget(activeProject),
    [activeProject]
  );

  const activeSeason: ScriptSeason = useMemo(() => {
    return (
      activeProject.seasons.find(
        (s) => s.seasonNumber === selectedSeasonNumber
      ) ??
      activeProject.seasons[activeProject.seasons.length - 1] ?? {
        seasonNumber: 1,
        episodes: [],
      }
    );
  }, [activeProject.seasons, selectedSeasonNumber]);

  const viewedEpisode: ScriptEpisode | null = useMemo(() => {
    if (allEpisodes.length === 0) return null;
    if (selectedEpisodeId) {
      const found = allEpisodes.find((ep) => ep.id === selectedEpisodeId);
      if (found) return found;
    }
    return allEpisodes[allEpisodes.length - 1];
  }, [allEpisodes, selectedEpisodeId]);

  const viewedShortSegments = useMemo(() => {
    if (!viewedEpisode?.isShortsMode) return [];
    return splitIntoShortSegments(viewedEpisode.scriptText);
  }, [viewedEpisode]);

  const updateActiveProject = useCallback(
    (updater: (prev: ScriptProject) => ScriptProject) => {
      setWorkspace((prev) => ({
        ...prev,
        projects: prev.projects.map((p) =>
          p.id === prev.activeProjectId
            ? { ...updater(normalizeProject(p)), updatedAt: Date.now() }
            : p
        ),
        updatedAt: Date.now(),
      }));
    },
    []
  );

  // Fetch 10 fresh viral topics for the chosen genre
  const fetchTopics = useCallback(
    async (
      targetGenre: ScriptGenre,
      extraExcludes: string[] = [],
      silent = false
    ) => {
      setIsLoadingTopics(true);
      setTopicError(null);
      try {
        const excludeSet = new Set<string>([
          ...workspace.analyzedTopics,
          ...workspace.suggestedTopics.map((t) => t.title),
          ...extraExcludes,
        ]);

        const res = await fetch("/api/script/topics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            genre: targetGenre,
            excludeTopics: Array.from(excludeSet),
            briefPart1: workspace.briefConfig.part1TopicAndTitleRules,
          }),
        });
        const payload = await res.json();
        if (!res.ok) {
          throw new Error(
            payload?.error || "Could not generate viral topic suggestions."
          );
        }

        const freshTopics: TopicSuggestion[] = (
          Array.isArray(payload.topics) ? payload.topics : []
        ).map(
          (item: {
            title: string;
            family: TopicSuggestion["family"];
            formula: TopicSuggestion["formula"];
            genre: ScriptGenre;
          }) => ({
            id: `topic-${crypto.randomUUID()}`,
            title: item.title,
            family: item.family,
            formula: item.formula,
            genre: item.genre || targetGenre,
          })
        );

        setWorkspace((prev) => ({
          ...prev,
          selectedGenre: targetGenre,
          suggestedTopics: freshTopics,
          updatedAt: Date.now(),
        }));

        if (!silent) {
          onNotify(
            `Generated ${freshTopics.length} fresh ${targetGenre} topics`,
            "success"
          );
        }
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : "Failed to fetch topic suggestions.";
        setTopicError(msg);
        if (!silent) onNotify(msg, "error");
      } finally {
        setIsLoadingTopics(false);
      }
    },
    [
      onNotify,
      workspace.analyzedTopics,
      workspace.briefConfig.part1TopicAndTitleRules,
      workspace.suggestedTopics,
    ]
  );

  // Auto-execute Part 1 topic generation on first visit if empty
  useEffect(() => {
    if (!isHydrated || hasAutoFetchedTopicsRef.current) return;
    if (workspace.suggestedTopics.length === 0) {
      hasAutoFetchedTopicsRef.current = true;
      void fetchTopics(workspace.selectedGenre, [], true);
    } else {
      hasAutoFetchedTopicsRef.current = true;
    }
  }, [
    isHydrated,
    workspace.suggestedTopics.length,
    workspace.selectedGenre,
    fetchTopics,
  ]);

  // Switch active project
  const handleSelectProject = (projectId: string) => {
    const target = workspace.projects.find((p) => p.id === projectId);
    if (!target) return;
    setWorkspace((prev) => ({
      ...prev,
      activeProjectId: projectId,
      selectedGenre: target.genre,
      updatedAt: Date.now(),
    }));
    const eps = getAllProjectEpisodes(target);
    if (eps.length > 0) {
      const latest = eps[eps.length - 1];
      setSelectedSeasonNumber(latest.seasonNumber);
      setSelectedEpisodeId(latest.id);
    } else {
      setSelectedSeasonNumber(1);
      setSelectedEpisodeId(null);
    }
    setShowRevisionForm(false);
    setShowShortSplitsPanel(false);
    setNextEpCharChoice("none");
    setNextEpCustomChars([]);
  };

  const handleCreateNewProject = () => {
    const fresh = createEmptyScriptProject(workspace.selectedGenre);
    setWorkspace((prev) => ({
      ...prev,
      projects: [fresh, ...prev.projects],
      activeProjectId: fresh.id,
      updatedAt: Date.now(),
    }));
    setSelectedSeasonNumber(1);
    setSelectedEpisodeId(null);
    setShowRevisionForm(false);
    setShowContinuityPanel(false);
    setShowShortSplitsPanel(false);
    setNextEpCharChoice("none");
    setNextEpCustomChars([]);
    onNotify("Started a new script project", "neutral");
  };

  const handleDeleteCurrentProject = () => {
    if (workspace.projects.length <= 1) {
      const fresh = createEmptyScriptProject(workspace.selectedGenre);
      setWorkspace((prev) => ({
        ...prev,
        projects: [fresh],
        activeProjectId: fresh.id,
        updatedAt: Date.now(),
      }));
      setSelectedSeasonNumber(1);
      setSelectedEpisodeId(null);
      onNotify("Cleared current script project", "neutral");
      return;
    }

    const remaining = workspace.projects.filter(
      (p) => p.id !== activeProject.id
    );
    const nextProj = remaining[0];
    setWorkspace((prev) => ({
      ...prev,
      projects: remaining,
      activeProjectId: nextProj.id,
      updatedAt: Date.now(),
    }));
    const eps = getAllProjectEpisodes(nextProj);
    setSelectedSeasonNumber(
      eps.length > 0 ? eps[eps.length - 1].seasonNumber : 1
    );
    setSelectedEpisodeId(eps.length > 0 ? eps[eps.length - 1].id : null);
    onNotify("Deleted script project", "neutral");
  };

  // Genre switch
  const handleGenreChange = (nextGenre: ScriptGenre) => {
    setWorkspace((prev) => ({
      ...prev,
      selectedGenre: nextGenre,
      projects: prev.projects.map((p) =>
        p.id === prev.activeProjectId
          ? { ...p, genre: nextGenre, updatedAt: Date.now() }
          : p
      ),
      updatedAt: Date.now(),
    }));
    void fetchTopics(nextGenre, [], false);
  };

  // Select topic card (checkbox style)
  const handleSelectTopicSuggestion = (topic: TopicSuggestion) => {
    updateActiveProject((proj) => ({
      ...proj,
      title: topic.title,
      genre: topic.genre,
    }));
  };

  // Format selection
  const handleSelectFormat = (nextFormat: EpisodeFormat) => {
    updateActiveProject((proj) => ({
      ...proj,
      format: nextFormat,
      // When switching to serialized while Shorts Mode is active and duration was default 20m,
      // suggest a crisp 2-minute Shorts-ready duration so 4 × 30s segments are immediately clear.
      durationMinutes:
        proj.shortsMode &&
        nextFormat !== "single" &&
        proj.durationMinutes === DEFAULT_DURATION_MINUTES
          ? 2
          : proj.durationMinutes,
      concludingSeries:
        nextFormat === "single" ? false : proj.concludingSeries,
      endingStyle:
        nextFormat === "single"
          ? "full_conclusion"
          : proj.concludingSeries
            ? proj.endingStyle
            : "continuing",
    }));
  };

  // Shorts / Reels mode toggle
  const handleToggleShortsMode = (enabled: boolean) => {
    updateActiveProject((proj) => ({
      ...proj,
      shortsMode: enabled,
      durationMinutes:
        enabled &&
        isSerializedFormat(proj.format) &&
        proj.durationMinutes === DEFAULT_DURATION_MINUTES
          ? 2
          : proj.durationMinutes,
    }));
  };

  // Append a quick story direction tag cleanly into customStoryNotes
  const handleAppendStoryDirection = (preset: string) => {
    updateActiveProject((proj) => {
      const current = proj.customStoryNotes.trim();
      if (current.toLowerCase().includes(preset.toLowerCase())) {
        return proj;
      }
      return {
        ...proj,
        customStoryNotes: current ? `${current}; ${preset}` : preset,
      };
    });
  };

  // Stage 3 custom character management
  const handleAddRosterCharacter = () => {
    const trimmedName = newCharName.trim();
    if (!trimmedName) return;
    const exists = activeProject.characters.some(
      (c) => c.name.trim().toLowerCase() === trimmedName.toLowerCase()
    );
    if (exists) {
      onNotify(`"${trimmedName}" is already in the cast roster.`, "neutral");
      return;
    }
    const created: ScriptCharacter = {
      id: `char-${crypto.randomUUID()}`,
      name: trimmedName,
      role: newCharRole.trim() || "Survivor",
      status: "Active",
      introducedIn: `S${nextEpisodeTarget.seasonNumber}E${nextEpisodeTarget.episodeNumber}`,
    };
    updateActiveProject((proj) => ({
      ...proj,
      characterMode: "custom",
      characters: [...proj.characters, created],
    }));
    setNewCharName("");
    setNewCharRole("");
  };

  const handleRemoveRosterCharacter = (charId: string) => {
    updateActiveProject((proj) => ({
      ...proj,
      characters: proj.characters.filter((c) => c.id !== charId),
    }));
  };

  const handleUpdateRosterCharacter = (
    charId: string,
    patch: Partial<Pick<ScriptCharacter, "name" | "role" | "status">>
  ) => {
    updateActiveProject((proj) => ({
      ...proj,
      characters: proj.characters.map((c) =>
        c.id === charId ? { ...c, ...patch } : c
      ),
    }));
  };

  // Generate episode script (standalone, 30s reel, Ep 1, or serialized Ep 2+ / next Season)
  const handleGenerateEpisode = async (options?: {
    overrideTarget?: NextEpisodeTarget;
    newEpMode?: "none" | "custom" | "ai_choose";
    newEpCharacters?: Array<{ name: string; role: string }>;
  }) => {
    const title = activeProject.title.trim();
    if (!title) {
      onNotify(
        "Select one of the topic cards or enter your own title first.",
        "error"
      );
      return;
    }

    const target = options?.overrideTarget ?? nextEpisodeTarget;
    const isEp2Plus =
      serialized && (target.seasonNumber > 1 || target.episodeNumber > 1);

    const effectiveEndingStyle: EndingStyle = !serialized
      ? "full_conclusion"
      : activeProject.concludingSeries
        ? activeProject.endingStyle === "tight_suspense" ||
          activeProject.endingStyle === "season_partial_conclusion"
          ? activeProject.endingStyle
          : "full_conclusion"
        : target.isSeasonFinale
          ? "season_partial_conclusion"
          : "continuing";

    const addedChars = (options?.newEpCharacters ?? [])
      .map((c) => ({ name: c.name.trim(), role: c.role.trim() || "Survivor" }))
      .filter((c) => c.name.length > 0);

    setIsGeneratingScript(true);
    setGeneratingStatusLabel(
      isSingleShortReel
        ? `Researching real-world facts & writing 30-second Short / Reel (~${SHORT_REEL_WORDS} words)…`
        : serialized
          ? `Researching real-world facts & writing Season ${target.seasonNumber}, Episode ${target.episodeNumber}${
              target.isSeasonFinale ? " (Season Finale · Partial Conclusion)" : ""
            }${
              activeProject.shortsMode
                ? ` · ${shortsSegmentCount} × 30s continuity segments`
                : ` (~${calculateTargetWords(activeProject.durationMinutes).toLocaleString()} words)`
            }…`
          : `Researching real-world facts & writing standalone script (~${calculateTargetWords(activeProject.durationMinutes).toLocaleString()} words)…`
    );

    try {
      const response = await fetch("/api/script/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          genre: activeProject.genre,
          format: activeProject.format,
          shortsMode: activeProject.shortsMode,
          plannedEpisodeCount: activeProject.plannedEpisodeCount,
          durationMinutes: activeProject.durationMinutes,
          customStoryNotes: activeProject.customStoryNotes,
          seasonNumber: target.seasonNumber,
          episodeNumber: target.episodeNumber,
          characterMode: activeProject.characterMode,
          characters: activeProject.characters,
          newEpisodeCharacterMode: isEp2Plus
            ? (options?.newEpMode ?? "none")
            : "none",
          newEpisodeCharacters: isEp2Plus ? addedChars : [],
          continuityState: isEp2Plus ? activeProject.continuityState : null,
          endingStyle: effectiveEndingStyle,
          briefConfig: workspace.briefConfig,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(
          payload?.error || "Script generation failed. Please retry."
        );
      }

      const scriptText: string = String(payload.scriptText || "").trim();
      const wordCount: number =
        typeof payload.wordCount === "number"
          ? payload.wordCount
          : countSpokenWords(scriptText);
      const researchSources: ResearchSource[] = Array.isArray(
        payload.researchSources
      )
        ? payload.researchSources
        : [];
      const nextContinuity: ContinuityState | null =
        payload.continuityState ?? null;
      const discoveredChars: Array<{
        name: string;
        role: string;
        status: string;
      }> = Array.isArray(payload.discoveredCharacters)
        ? payload.discoveredCharacters
        : [];

      const episodeCode = `S${target.seasonNumber}E${target.episodeNumber}`;
      const newEpisode: ScriptEpisode = {
        id: `ep-${crypto.randomUUID()}`,
        seasonNumber: target.seasonNumber,
        episodeNumber: target.episodeNumber,
        episodeTitle:
          typeof payload.episodeTitle === "string" &&
          payload.episodeTitle.trim()
            ? payload.episodeTitle.trim()
            : serialized
              ? `Episode ${target.episodeNumber}`
              : title,
        scriptText,
        wordCount,
        targetMinutes:
          typeof payload.targetMinutes === "number"
            ? payload.targetMinutes
            : isSingleShortReel
              ? 0.5
              : activeProject.durationMinutes,
        targetSeconds:
          typeof payload.targetSeconds === "number"
            ? payload.targetSeconds
            : isSingleShortReel
              ? SHORT_REEL_SECONDS
              : activeProject.durationMinutes * 60,
        isShortsMode: activeProject.shortsMode,
        shortsSegmentCount:
          typeof payload.shortsSegmentCount === "number"
            ? payload.shortsSegmentCount
            : activeProject.shortsMode
              ? shortsSegmentCount
              : undefined,
        endingStyle: payload.endingStyle || effectiveEndingStyle,
        researchSources,
        continuitySnapshot: nextContinuity ?? undefined,
        generatedAt: payload.generatedAt || Date.now(),
        updatedAt: Date.now(),
      };

      setWorkspace((prev) => {
        const updatedAnalyzed = prev.analyzedTopics.some(
          (t) => t.toLowerCase() === title.toLowerCase()
        )
          ? prev.analyzedTopics
          : [...prev.analyzedTopics, title];

        const updatedProjects = prev.projects.map((rawProj) => {
          const proj = normalizeProject(rawProj);
          if (proj.id !== prev.activeProjectId) return proj;

          const seasonCap = proj.plannedEpisodeCount || MAX_EPISODES_PER_SEASON;

          let nextSeasons: ScriptSeason[];
          if (!isSerializedFormat(proj.format)) {
            nextSeasons = [{ seasonNumber: 1, episodes: [newEpisode] }];
          } else {
            const seasonExists = proj.seasons.some(
              (s) => s.seasonNumber === target.seasonNumber
            );
            const baseSeasons = seasonExists
              ? proj.seasons
              : [
                  ...proj.seasons,
                  { seasonNumber: target.seasonNumber, episodes: [] },
                ];

            nextSeasons = baseSeasons.map((season) => {
              if (season.seasonNumber !== target.seasonNumber) return season;
              const existingIdx = season.episodes.findIndex(
                (ep) => ep.episodeNumber === target.episodeNumber
              );
              const nextEps =
                existingIdx >= 0
                  ? season.episodes.map((ep, idx) =>
                      idx === existingIdx ? newEpisode : ep
                    )
                  : [...season.episodes, newEpisode].sort(
                      (a, b) => a.episodeNumber - b.episodeNumber
                    );
              return { ...season, episodes: nextEps };
            });

            // Auto-unlock Season N+1 when Season N reaches its planned episode count (or partial conclusion finale)
            const updatedTargetSeason = nextSeasons.find(
              (s) => s.seasonNumber === target.seasonNumber
            );
            if (
              updatedTargetSeason &&
              updatedTargetSeason.episodes.length >= seasonCap &&
              !nextSeasons.some(
                (s) => s.seasonNumber === target.seasonNumber + 1
              )
            ) {
              nextSeasons = [
                ...nextSeasons,
                { seasonNumber: target.seasonNumber + 1, episodes: [] },
              ];
            }
          }

          const shouldTrackCast =
            proj.characterMode !== "solo" ||
            addedChars.length > 0 ||
            options?.newEpMode === "ai_choose";
          const nextCharacters = shouldTrackCast
            ? mergeDiscoveredCharacters(
                proj.characters,
                addedChars,
                discoveredChars,
                episodeCode
              )
            : proj.characters;

          return {
            ...proj,
            seasons: nextSeasons,
            characters: nextCharacters,
            continuityState: nextContinuity ?? proj.continuityState,
            updatedAt: Date.now(),
          };
        });

        return {
          ...prev,
          projects: updatedProjects,
          analyzedTopics: updatedAnalyzed,
          updatedAt: Date.now(),
        };
      });

      setSelectedSeasonNumber(target.seasonNumber);
      setSelectedEpisodeId(newEpisode.id);
      setNextEpCharChoice("none");
      setNextEpCustomChars([]);
      setShowRevisionForm(false);
      setShowShortSplitsPanel(
        Boolean(newEpisode.isShortsMode && (newEpisode.shortsSegmentCount ?? 1) > 1)
      );

      const unlockedMsg =
        serialized && target.isSeasonFinale
          ? ` Partial conclusion complete — Season ${target.seasonNumber + 1} is unlocked as a fresh chapter!`
          : "";
      onNotify(
        `${
          isSingleShortReel
            ? "30-second Short / Reel"
            : serialized
              ? `Season ${target.seasonNumber} · Episode ${target.episodeNumber}`
              : "Script"
        } ready (${wordCount.toLocaleString()} words) and cached locally.${unlockedMsg}`,
        "success"
      );

      setTimeout(() => {
        scriptOutputRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 80);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Script generation failed.";
      onNotify(msg, "error");
    } finally {
      setIsGeneratingScript(false);
      setGeneratingStatusLabel("");
    }
  };

  // Revise currently viewed episode script
  const handleReviseViewedEpisode = async () => {
    if (!viewedEpisode || !revisionInput.trim()) return;

    setIsRevisingScript(true);
    try {
      const res = await fetch("/api/script/revise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: activeProject.title || viewedEpisode.episodeTitle,
          genre: activeProject.genre,
          seasonNumber: viewedEpisode.seasonNumber,
          episodeNumber: viewedEpisode.episodeNumber,
          durationMinutes: activeProject.durationMinutes,
          shortsMode: viewedEpisode.isShortsMode ?? activeProject.shortsMode,
          targetSeconds: viewedEpisode.targetSeconds,
          shortsSegmentCount: viewedEpisode.shortsSegmentCount,
          customStoryNotes: activeProject.customStoryNotes,
          currentScript: viewedEpisode.scriptText,
          revisionInstructions: revisionInput.trim(),
          characters: activeProject.characters,
          briefConfig: {
            part2ContinuityAndScopeRules:
              workspace.briefConfig.part2ContinuityAndScopeRules,
            part3ScriptDnaAndTtsRules:
              workspace.briefConfig.part3ScriptDnaAndTtsRules,
          },
        }),
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload?.error || "Could not revise script.");
      }

      const revisedText = String(payload.scriptText || "").trim();
      const revisedWordCount =
        typeof payload.wordCount === "number"
          ? payload.wordCount
          : countSpokenWords(revisedText);
      const revisedSources: ResearchSource[] = Array.isArray(
        payload.researchSources
      )
        ? payload.researchSources
        : viewedEpisode.researchSources;
      const revisedContinuity: ContinuityState | undefined =
        payload.continuityState ?? viewedEpisode.continuitySnapshot;
      const discoveredChars: Array<{
        name: string;
        role: string;
        status: string;
      }> = Array.isArray(payload.discoveredCharacters)
        ? payload.discoveredCharacters
        : [];

      const isLatestEpisode =
        allEpisodes.length > 0 &&
        allEpisodes[allEpisodes.length - 1].id === viewedEpisode.id;

      updateActiveProject((proj) => ({
        ...proj,
        seasons: proj.seasons.map((season) =>
          season.seasonNumber !== viewedEpisode.seasonNumber
            ? season
            : {
                ...season,
                episodes: season.episodes.map((ep) =>
                  ep.id !== viewedEpisode.id
                    ? ep
                    : {
                        ...ep,
                        episodeTitle:
                          typeof payload.episodeTitle === "string" &&
                          payload.episodeTitle.trim()
                            ? payload.episodeTitle.trim()
                            : ep.episodeTitle,
                        scriptText: revisedText,
                        wordCount: revisedWordCount,
                        researchSources:
                          revisedSources.length > 0
                            ? revisedSources
                            : ep.researchSources,
                        continuitySnapshot: revisedContinuity,
                        updatedAt: Date.now(),
                      }
                ),
              }
        ),
        continuityState:
          isLatestEpisode && revisedContinuity
            ? revisedContinuity
            : proj.continuityState,
        characters:
          proj.characterMode !== "solo" && discoveredChars.length > 0
            ? mergeDiscoveredCharacters(
                proj.characters,
                [],
                discoveredChars,
                `S${viewedEpisode.seasonNumber}E${viewedEpisode.episodeNumber}`
              )
            : proj.characters,
      }));

      setRevisionInput("");
      setShowRevisionForm(false);
      onNotify(
        `Script revised cleanly (${revisedWordCount.toLocaleString()} words)`,
        "success"
      );
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to revise script.";
      onNotify(msg, "error");
    } finally {
      setIsRevisingScript(false);
    }
  };

  // Copy pure spoken TTS script
  const handleCopyTts = async () => {
    if (!viewedEpisode?.scriptText) return;
    try {
      await navigator.clipboard.writeText(viewedEpisode.scriptText);
      setCopiedTts(true);
      onNotify("Copied pure TTS-ready script to clipboard", "success");
      setTimeout(() => setCopiedTts(false), 2000);
    } catch {
      onNotify(
        "Clipboard unavailable. Select inside the script box to copy.",
        "error"
      );
    }
  };

  const handleCopyShortSegment = async (text: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSegmentIdx(idx);
      onNotify(`Copied 30s Reel #${idx + 1} to clipboard`, "success");
      setTimeout(() => setCopiedSegmentIdx(null), 1800);
    } catch {
      onNotify("Clipboard unavailable.", "error");
    }
  };

  // Download single episode as .txt
  const handleDownloadTxt = () => {
    if (!viewedEpisode?.scriptText) return;
    const slug = sanitizeFilename(
      activeProject.title || viewedEpisode.episodeTitle
    );
    const suffix = serialized
      ? `-s${viewedEpisode.seasonNumber}e${viewedEpisode.episodeNumber}`
      : viewedEpisode.isShortsMode
        ? "-30s-short"
        : "";
    const blob = new Blob([viewedEpisode.scriptText], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug}${suffix}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onNotify(`Downloaded ${slug}${suffix}.txt`, "neutral");
  };

  // Export complete backup (.json) with all projects, seasons, episodes, character details, brief & studio settings
  const handleExportBackup = () => {
    const payload: ScriptBackupPayload = {
      version: 1,
      exportedAt: Date.now(),
      appName: "FrameForge",
      scriptWriter: workspace,
      studioSettings: { ...studioSettings },
    };
    const slug = sanitizeFilename(activeProject.title || "frameforge-scripts");
    const dateTag = new Date().toISOString().slice(0, 10);
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `frameforge-backup-${slug}-${dateTag}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onNotify(
      "Exported full backup (all seasons, episodes, characters & settings)",
      "success"
    );
  };

  // Import backup (.json)
  const handleImportBackupFile = async (file: File) => {
    try {
      const rawText = await file.text();
      const parsed = JSON.parse(rawText) as Partial<ScriptBackupPayload>;

      const importedWorkspace = parsed?.scriptWriter;
      if (
        !importedWorkspace ||
        !Array.isArray(importedWorkspace.projects) ||
        importedWorkspace.projects.length === 0
      ) {
        throw new Error(
          "Invalid backup file. Expected a FrameForge Script Writer JSON backup."
        );
      }

      const normalizedProjects = importedWorkspace.projects.map(normalizeProject);
      const validActiveId = normalizedProjects.some(
        (p) => p.id === importedWorkspace.activeProjectId
      )
        ? importedWorkspace.activeProjectId
        : normalizedProjects[0].id;

      const restoredWorkspace: ScriptWriterWorkspaceState = {
        projects: normalizedProjects,
        activeProjectId: validActiveId,
        selectedGenre: importedWorkspace.selectedGenre || "Survival",
        suggestedTopics: Array.isArray(importedWorkspace.suggestedTopics)
          ? importedWorkspace.suggestedTopics
          : [],
        analyzedTopics: Array.isArray(importedWorkspace.analyzedTopics)
          ? importedWorkspace.analyzedTopics
          : [],
        briefConfig: importedWorkspace.briefConfig
          ? {
              part1TopicAndTitleRules:
                importedWorkspace.briefConfig.part1TopicAndTitleRules ||
                DEFAULT_SCRIPT_BRIEF.part1TopicAndTitleRules,
              part2ContinuityAndScopeRules:
                importedWorkspace.briefConfig.part2ContinuityAndScopeRules ||
                DEFAULT_SCRIPT_BRIEF.part2ContinuityAndScopeRules,
              part3ScriptDnaAndTtsRules:
                importedWorkspace.briefConfig.part3ScriptDnaAndTtsRules ||
                DEFAULT_SCRIPT_BRIEF.part3ScriptDnaAndTtsRules,
            }
          : { ...DEFAULT_SCRIPT_BRIEF },
        updatedAt: Date.now(),
      };

      setWorkspace(restoredWorkspace);
      void saveScriptWriterState(restoredWorkspace).catch(() => undefined);

      if (
        parsed.studioSettings &&
        typeof parsed.studioSettings === "object"
      ) {
        onImportStudioSettings(parsed.studioSettings as Partial<BatchSettings>);
      }

      const activeProj =
        restoredWorkspace.projects.find((p) => p.id === validActiveId) ??
        restoredWorkspace.projects[0];
      const eps = getAllProjectEpisodes(activeProj);
      setSelectedSeasonNumber(
        eps.length > 0 ? eps[eps.length - 1].seasonNumber : 1
      );
      setSelectedEpisodeId(eps.length > 0 ? eps[eps.length - 1].id : null);

      const totalEps = restoredWorkspace.projects.reduce(
        (acc, p) => acc + getAllProjectEpisodes(p).length,
        0
      );
      onNotify(
        `Imported ${restoredWorkspace.projects.length} project(s), ${totalEps} episode(s), character rosters & settings`,
        "success"
      );
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Could not read backup file.";
      onNotify(msg, "error");
    } finally {
      if (importFileInputRef.current) {
        importFileInputRef.current.value = "";
      }
    }
  };

  const targetWords = isSingleShortReel
    ? SHORT_REEL_WORDS
    : calculateTargetWords(activeProject.durationMinutes);
  const currentGenreMeta =
    SCRIPT_GENRES.find((g) => g.id === workspace.selectedGenre) ??
    SCRIPT_GENRES[0];
  const durationButtons =
    activeProject.shortsMode && serialized
      ? SHORTS_MULTI_DURATION_OPTIONS
      : DURATION_QUICK_OPTIONS;

  const isBusy = isGeneratingScript || isRevisingScript;

  return (
    <div className="space-y-6 min-w-0 max-w-full">
      {/* Top Studio Header & Utility Strip */}
      <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] p-4 sm:p-5 space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-display text-xl sm:text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                Script Writer
              </h1>
              <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                {allEpisodes.length > 0
                  ? `${allEpisodes.length} episode${allEpisodes.length === 1 ? "" : "s"} cached`
                  : "Auto-saved locally"}
              </span>
            </div>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              {currentGenreMeta.tagline}
            </p>
          </div>

          {/* Utility Actions: Script Brief, Export Backup (Arrow Up), Import Backup (Arrow Down) */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setIsBriefModalOpen(true)}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#18181B] px-3 py-1.5 text-xs font-medium text-zinc-800 dark:text-zinc-200 hover:border-[#F2B705] hover:text-zinc-950 dark:hover:text-white transition-colors"
            >
              <ScrollText className="h-3.5 w-3.5 text-amber-600 dark:text-[#F2B705]" />
              Script Brief
            </button>

            <button
              type="button"
              onClick={handleExportBackup}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#18181B] px-3 py-1.5 text-xs font-medium text-zinc-800 dark:text-zinc-200 hover:border-zinc-400 dark:hover:border-zinc-500 transition-colors"
              title="Export all stories, seasons, episodes, character rosters & settings to JSON"
            >
              <Upload className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400" />
              Export Backup
            </button>

            <button
              type="button"
              onClick={() => importFileInputRef.current?.click()}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#18181B] px-3 py-1.5 text-xs font-medium text-zinc-800 dark:text-zinc-200 hover:border-zinc-400 dark:hover:border-zinc-500 transition-colors"
              title="Import previously exported FrameForge Script Writer backup (.json)"
            >
              <Download className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400" />
              Import Backup
            </button>
            <input
              ref={importFileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleImportBackupFile(file);
              }}
            />
          </div>
        </div>

        {/* Project Switcher & Genre Dropdown Row */}
        <div className="grid grid-cols-1 gap-3 border-t border-zinc-200 dark:border-zinc-800 pt-4 md:grid-cols-12">
          {/* Active Project Selector */}
          <div className="md:col-span-7 space-y-1.5 min-w-0">
            <label
              htmlFor="script-project-select"
              className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
            >
              Story Project
            </label>
            <div className="flex items-center gap-2">
              <select
                id="script-project-select"
                value={activeProject.id}
                onChange={(e) => handleSelectProject(e.target.value)}
                className="min-h-[40px] min-w-0 flex-1 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] px-3 py-2 text-xs font-medium text-zinc-900 dark:text-zinc-100 focus:border-[#F2B705] focus:outline-none"
              >
                {workspace.projects.map((proj, idx) => {
                  const epCount = getAllProjectEpisodes(proj).length;
                  return (
                    <option key={proj.id} value={proj.id}>
                      {proj.title.trim() || `Untitled Story ${idx + 1}`} ·{" "}
                      {proj.genre} ({epCount} ep{epCount === 1 ? "" : "s"})
                    </option>
                  );
                })}
              </select>

              <button
                type="button"
                onClick={handleCreateNewProject}
                disabled={isBusy}
                title="New Story Project"
                className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#18181B] px-3 text-xs font-medium text-zinc-800 dark:text-zinc-200 hover:border-[#F2B705] disabled:opacity-40 transition-colors"
              >
                <FolderPlus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">New Story</span>
              </button>

              <button
                type="button"
                onClick={handleDeleteCurrentProject}
                disabled={isBusy}
                aria-label="Delete or reset story project"
                title="Delete story project"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] text-zinc-500 hover:border-red-400 hover:text-red-500 disabled:opacity-40 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Genre Selection Dropdown */}
          <div className="md:col-span-5 space-y-1.5 min-w-0">
            <label
              htmlFor="script-genre-select"
              className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
            >
              Genre
            </label>
            <select
              id="script-genre-select"
              value={workspace.selectedGenre}
              disabled={isLoadingTopics || isBusy}
              onChange={(e) =>
                handleGenreChange(e.target.value as ScriptGenre)
              }
              className="min-h-[40px] w-full rounded-lg border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] px-3 py-2 text-xs font-semibold text-zinc-900 dark:text-zinc-100 focus:border-[#F2B705] focus:outline-none disabled:opacity-50"
            >
              {SCRIPT_GENRES.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* STAGE 1: Title & Topic Selection (Auto-runs on mount + custom title input) */}
      <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] p-4 sm:p-5 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] font-semibold text-amber-600 dark:text-[#F2B705]">
                01
              </span>
              <h2 className="font-display text-base font-semibold text-zinc-900 dark:text-zinc-100">
                Title &amp; Topic Selection
              </h2>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Select a generated viral title below or enter your own story topic.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void fetchTopics(workspace.selectedGenre)}
            disabled={isLoadingTopics || isBusy}
            className="inline-flex min-h-[38px] w-full sm:w-auto items-center justify-center gap-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#18181B] px-3.5 py-1.5 text-xs font-medium text-zinc-800 dark:text-zinc-200 hover:border-[#F2B705] disabled:opacity-50 transition-colors shrink-0"
          >
            {isLoadingTopics ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-600 dark:text-[#F2B705]" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {isLoadingTopics ? "Generating Topics…" : "Generate 10 More"}
          </button>
        </div>

        {/* Custom Title / Selected Topic Input */}
        <div className="space-y-1.5">
          <label
            htmlFor="script-topic-title-input"
            className="block text-xs font-medium text-zinc-700 dark:text-zinc-300"
          >
            Selected Title / Custom Idea
          </label>
          <div className="flex items-center gap-2">
            <input
              id="script-topic-title-input"
              type="text"
              value={activeProject.title}
              onChange={(e) =>
                updateActiveProject((proj) => ({
                  ...proj,
                  title: e.target.value,
                }))
              }
              placeholder="e.g. I Survived Thirty Days After the Power Grid Collapsed"
              className="min-h-[42px] w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#09090B] px-3.5 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:border-[#F2B705] focus:outline-none"
            />
            {activeProject.title && (
              <button
                type="button"
                onClick={() =>
                  updateActiveProject((proj) => ({ ...proj, title: "" }))
                }
                aria-label="Clear title"
                className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-lg border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Suggested 10 Topics Grid (Checkbox / Clickable Cards) */}
        {topicError && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-300 dark:border-red-500/35 bg-red-50 dark:bg-red-950/30 px-3.5 py-2.5 text-xs text-red-700 dark:text-red-300">
            <span>{topicError}</span>
            <button
              type="button"
              onClick={() => void fetchTopics(workspace.selectedGenre)}
              className="font-semibold underline underline-offset-2"
            >
              Retry
            </button>
          </div>
        )}

        {isLoadingTopics && workspace.suggestedTopics.length === 0 ? (
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div
                key={idx}
                className="h-[68px] animate-pulse rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-[#18181B]"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
            {workspace.suggestedTopics.map((topic) => {
              const isSelected =
                activeProject.title.trim().toLowerCase() ===
                topic.title.trim().toLowerCase();
              const isAlreadyUsed = workspace.analyzedTopics.some(
                (t) => t.toLowerCase() === topic.title.toLowerCase()
              );
              return (
                <button
                  key={topic.id}
                  type="button"
                  onClick={() => handleSelectTopicSuggestion(topic)}
                  className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B705] ${
                    isSelected
                      ? "border-[#F2B705] bg-amber-50/70 dark:bg-[#1A160B]"
                      : "border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-[#0D0D10] hover:border-zinc-400 dark:hover:border-zinc-600"
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                      isSelected
                        ? "border-[#F2B705] bg-[#F2B705] text-[#09090B]"
                        : "border-zinc-400 dark:border-zinc-600 bg-white dark:bg-[#09090B]"
                    }`}
                  >
                    {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                  </span>

                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-xs sm:text-sm font-medium leading-snug text-zinc-900 dark:text-zinc-100">
                      {topic.title}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                      <span>{topic.family}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono">{topic.formula}</span>
                      {isAlreadyUsed && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                            Generated
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* STAGE 2: Format, Shorts Mode, Duration & Continuity / Season Manager */}
      <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] p-4 sm:p-5 space-y-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] font-semibold text-amber-600 dark:text-[#F2B705]">
                02
              </span>
              <h2 className="font-display text-base font-semibold text-zinc-900 dark:text-zinc-100">
                Format, Shorts Mode &amp; Series Structure
              </h2>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Choose standalone or serialized episodes, and optionally pace scripts for 30-second Shorts / Reels.
            </p>
          </div>
        </div>

        {/* 5 Exact Format Cards */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {EPISODE_FORMAT_OPTIONS.map((opt) => {
            const active = activeProject.format === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleSelectFormat(opt.id)}
                className={`flex flex-col justify-between rounded-lg border p-3 text-left transition-colors ${
                  active
                    ? "border-[#F2B705] bg-amber-50/70 dark:bg-[#1A160B]"
                    : "border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-[#0D0D10] hover:border-zinc-400 dark:hover:border-zinc-600"
                }`}
              >
                <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                  {opt.label}
                </span>
                <span className="mt-1 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
                  {opt.description}
                </span>
              </button>
            );
          })}
        </div>

        {/* Shorts / Instagram Reels Format Checkbox */}
        <label
          className={`flex items-start gap-3 rounded-lg border p-3.5 cursor-pointer select-none transition-colors ${
            activeProject.shortsMode
              ? "border-[#F2B705] bg-amber-50/70 dark:bg-[#1A160B]"
              : "border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#0D0D10] hover:border-zinc-400 dark:hover:border-zinc-600"
          }`}
        >
          <input
            type="checkbox"
            checked={activeProject.shortsMode}
            onChange={(e) => handleToggleShortsMode(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-400 dark:border-zinc-600 accent-[#F2B705] cursor-pointer"
          />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Film className="h-3.5 w-3.5 text-amber-600 dark:text-[#F2B705] shrink-0" />
              <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                Shorts / Instagram Reels Mode (30-Second Pacing)
              </span>
              {activeProject.shortsMode && (
                <span className="font-mono text-[11px] font-semibold text-amber-700 dark:text-[#F2B705] tabular-nums">
                  {isSingleShortReel
                    ? "1 × 30s Reel"
                    : `${shortsSegmentCount} × 30s Continuity Segments`}
                </span>
              )}
            </div>
            <p className="text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-400">
              {!serialized
                ? "With Single Episode selected, generates a single 30-second Short / Instagram Reel script (~75 spoken words)."
                : `With ${
                    EPISODE_FORMAT_OPTIONS.find(
                      (o) => o.id === activeProject.format
                    )?.label ?? "Multi-Episode"
                  } selected, structures your ${activeProject.durationMinutes}-minute script into ${shortsSegmentCount} seamless 30-second reel segments (~75 words each) with natural continuity pauses ready for scene & prompt breakdown.`}
            </p>
          </div>
        </label>

        {/* Duration Selector (Locked to 30s when Single Episode + Shorts Mode; otherwise customizable) */}
        <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#0D0D10] p-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-800 dark:text-zinc-200">
              <Clock className="h-3.5 w-3.5 text-amber-600 dark:text-[#F2B705]" />
              {isSingleShortReel
                ? "Short / Reel Length (Locked)"
                : "Target Episode Length"}
            </div>
            <p className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
              {isSingleShortReel ? (
                <>
                  30 seconds · ~{SHORT_REEL_WORDS} spoken words at{" "}
                  {WORDS_PER_MINUTE} WPM (uncheck Shorts Mode for longer single
                  episodes)
                </>
              ) : (
                <>
                  ~{targetWords.toLocaleString()} spoken words at{" "}
                  {WORDS_PER_MINUTE} WPM
                  {activeProject.shortsMode
                    ? ` · ${shortsSegmentCount} × 30s reels`
                    : activeProject.durationMinutes === DEFAULT_DURATION_MINUTES
                      ? " (Prompt Default)"
                      : activeProject.durationMinutes < 3
                        ? " (Compressed Short Arc)"
                        : ""}
                </>
              )}
            </p>
          </div>

          {isSingleShortReel ? (
            <div className="inline-flex min-h-[34px] items-center rounded-md bg-[#F2B705] px-3 font-mono text-xs font-semibold text-[#09090B] tabular-nums shrink-0">
              30 sec Reel
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              {durationButtons.map((mins) => {
                const active = activeProject.durationMinutes === mins;
                return (
                  <button
                    key={mins}
                    type="button"
                    onClick={() =>
                      updateActiveProject((proj) => ({
                        ...proj,
                        durationMinutes: mins,
                      }))
                    }
                    className={`min-h-[34px] rounded-md px-2.5 text-xs font-mono font-medium tabular-nums transition-colors ${
                      active
                        ? "bg-[#F2B705] text-[#09090B] font-semibold"
                        : "border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#18181B] text-zinc-700 dark:text-zinc-300 hover:border-zinc-400 dark:hover:border-zinc-500"
                    }`}
                  >
                    {mins}m
                  </button>
                );
              })}

              <div className="flex items-center gap-1.5 pl-1">
                <input
                  type="number"
                  min={1}
                  max={60}
                  aria-label="Custom duration in minutes"
                  value={activeProject.durationMinutes}
                  onChange={(e) => {
                    const val = Math.max(
                      1,
                      Math.min(60, Math.floor(Number(e.target.value) || 1))
                    );
                    updateActiveProject((proj) => ({
                      ...proj,
                      durationMinutes: val,
                    }));
                  }}
                  className="h-[34px] w-16 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] px-2 text-center font-mono text-xs text-zinc-900 dark:text-zinc-100 tabular-nums focus:border-[#F2B705] focus:outline-none"
                />
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  min
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Serialized Format Controls: Season & Episode Manager + Planned Episode Count + Partial Conclusion + Continuity Ledger */}
        {serialized && (
          <div className="space-y-4 border-t border-zinc-200 dark:border-zinc-800 pt-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-amber-600 dark:text-[#F2B705]" />
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                    Seasons &amp; Episodes
                  </h3>
                </div>

                {/* Number of Episodes per Season Selector (1..10) */}
                <div className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#0D0D10] px-2.5 py-1 text-xs">
                  <label
                    htmlFor="planned-episodes-input"
                    className="text-[11px] text-zinc-600 dark:text-zinc-400 whitespace-nowrap"
                  >
                    Episodes / Season
                  </label>
                  <input
                    id="planned-episodes-input"
                    type="number"
                    min={1}
                    max={MAX_EPISODES_PER_SEASON}
                    value={plannedEpisodeCount}
                    onChange={(e) => {
                      const val = Math.max(
                        1,
                        Math.min(
                          MAX_EPISODES_PER_SEASON,
                          Math.floor(Number(e.target.value) || 1)
                        )
                      );
                      updateActiveProject((proj) => ({
                        ...proj,
                        plannedEpisodeCount: val,
                      }));
                    }}
                    className="h-6 w-12 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] px-1 text-center font-mono text-xs font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums focus:border-[#F2B705] focus:outline-none"
                  />
                </div>
              </div>

              {/* Season Tabs */}
              <div className="flex flex-wrap items-center gap-1.5">
                {activeProject.seasons
                  .slice()
                  .sort((a, b) => a.seasonNumber - b.seasonNumber)
                  .map((season) => {
                    const isActive =
                      season.seasonNumber === activeSeason.seasonNumber;
                    return (
                      <button
                        key={season.seasonNumber}
                        type="button"
                        onClick={() =>
                          setSelectedSeasonNumber(season.seasonNumber)
                        }
                        className={`rounded-md px-3 py-1.5 text-xs font-mono font-medium tabular-nums transition-colors ${
                          isActive
                            ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-950"
                            : "border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#18181B] text-zinc-700 dark:text-zinc-300 hover:border-zinc-400"
                        }`}
                      >
                        Season {season.seasonNumber} ({season.episodes.length}/
                        {plannedEpisodeCount})
                      </button>
                    );
                  })}
              </div>
            </div>

            {/* Episode Slots Grid for Active Season (1..plannedEpisodeCount) */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {Array.from({ length: plannedEpisodeCount }, (_, idx) => {
                const epNum = idx + 1;
                const existingEp = activeSeason.episodes.find(
                  (ep) => ep.episodeNumber === epNum
                );
                const isNextSlot =
                  nextEpisodeTarget.seasonNumber ===
                    activeSeason.seasonNumber &&
                  nextEpisodeTarget.episodeNumber === epNum;
                const isFinaleSlot = epNum === plannedEpisodeCount;
                const isViewing = existingEp?.id === viewedEpisode?.id;

                return (
                  <button
                    key={epNum}
                    type="button"
                    disabled={!existingEp}
                    onClick={() => {
                      if (existingEp) {
                        setSelectedEpisodeId(existingEp.id);
                        scriptOutputRef.current?.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        });
                      }
                    }}
                    className={`flex flex-col items-start rounded-lg border px-2.5 py-2 text-left transition-colors ${
                      isViewing
                        ? "border-[#F2B705] bg-amber-50/70 dark:bg-[#1A160B]"
                        : existingEp
                          ? "border-emerald-300/80 dark:border-emerald-500/35 bg-emerald-50/50 dark:bg-[#0E1713] hover:border-emerald-400"
                          : isNextSlot
                            ? "border-dashed border-[#F2B705]/80 bg-zinc-50 dark:bg-[#0D0D10]"
                            : "border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/40 dark:bg-[#0A0A0D] opacity-60 cursor-default"
                    }`}
                  >
                    <div className="flex w-full items-center justify-between gap-1">
                      <span className="font-mono text-[11px] font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums">
                        S{activeSeason.seasonNumber}E{epNum}
                      </span>
                      {isFinaleSlot && (
                        <span className="font-mono text-[9px] uppercase tracking-wide text-amber-600 dark:text-[#F2B705]">
                          Finale
                        </span>
                      )}
                    </div>
                    <span className="mt-0.5 line-clamp-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                      {existingEp
                        ? existingEp.episodeTitle
                        : isNextSlot
                          ? isFinaleSlot
                            ? "Partial conclusion"
                            : "Up next"
                          : isFinaleSlot
                            ? "Season finale"
                            : "Locked"}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Season Finale Partial Conclusion Info Banner (shown automatically on final episode of season) */}
            {nextEpisodeTarget.isSeasonFinale && !activeProject.concludingSeries && (
              <div className="rounded-lg border border-amber-300/80 dark:border-[#F2B705]/35 bg-amber-50/70 dark:bg-[#19150C] px-3.5 py-2.5 text-xs text-amber-950 dark:text-amber-100">
                <strong className="font-semibold">
                  Season {nextEpisodeTarget.seasonNumber} Finale — Partial Conclusion:
                </strong>{" "}
                Episode {nextEpisodeTarget.episodeNumber} will conclude this season&apos;s main crisis in a satisfying way while leaving suspenseful momentum so Season{" "}
                {nextEpisodeTarget.seasonNumber + 1} opens cleanly as a fresh chapter in the same voice.
              </div>
            )}

            {/* Ending Style Control + Collapsible 6-Point Continuity Ledger */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#0D0D10] px-3.5 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-2 text-xs font-medium text-zinc-800 dark:text-zinc-200 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={activeProject.concludingSeries}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      updateActiveProject((proj) => ({
                        ...proj,
                        concludingSeries: checked,
                        endingStyle: checked
                          ? proj.endingStyle === "tight_suspense" ||
                            proj.endingStyle === "season_partial_conclusion"
                            ? proj.endingStyle
                            : "season_partial_conclusion"
                          : "continuing",
                      }));
                    }}
                    className="h-4 w-4 rounded border-zinc-400 accent-[#F2B705]"
                  />
                  Override ending style on next episode
                </label>

                {activeProject.concludingSeries && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(
                      [
                        {
                          id: "season_partial_conclusion",
                          label: "Partial Conclusion (Season Finale)",
                        },
                        { id: "full_conclusion", label: "Full Conclusion" },
                        {
                          id: "tight_suspense",
                          label: "Tight Suspenseful Ending",
                        },
                      ] as Array<{ id: EndingStyle; label: string }>
                    ).map((style) => (
                      <button
                        key={style.id}
                        type="button"
                        onClick={() =>
                          updateActiveProject((proj) => ({
                            ...proj,
                            endingStyle: style.id,
                          }))
                        }
                        className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                          activeProject.endingStyle === style.id
                            ? "bg-[#F2B705] text-[#09090B] font-semibold"
                            : "border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#18181B] text-zinc-700 dark:text-zinc-300"
                        }`}
                      >
                        {style.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {activeProject.continuityState && (
                <button
                  type="button"
                  onClick={() => setShowContinuityPanel((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-[#F2B705] hover:underline shrink-0"
                >
                  <BookOpen className="h-3.5 w-3.5" />
                  Continuity Ledger
                  {showContinuityPanel ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                </button>
              )}
            </div>

            {showContinuityPanel && activeProject.continuityState && (
              <div className="grid grid-cols-1 gap-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] p-4 sm:grid-cols-2 lg:grid-cols-3 text-xs">
                <div>
                  <span className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                    Catastrophe Phase
                  </span>
                  <p className="mt-1 text-zinc-800 dark:text-zinc-200">
                    {activeProject.continuityState.catastrophePhase}
                  </p>
                </div>
                <div>
                  <span className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                    Elapsed Timeline
                  </span>
                  <p className="mt-1 text-zinc-800 dark:text-zinc-200">
                    {activeProject.continuityState.elapsedTimeline}
                  </p>
                </div>
                <div>
                  <span className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                    Primary Setting
                  </span>
                  <p className="mt-1 text-zinc-800 dark:text-zinc-200">
                    {activeProject.continuityState.primarySetting}
                  </p>
                </div>
                <div>
                  <span className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                    Systems &amp; Resources
                  </span>
                  <p className="mt-1 text-zinc-800 dark:text-zinc-200">
                    {activeProject.continuityState.systemsAndResources}
                  </p>
                </div>
                <div>
                  <span className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                    Active Cast Summary
                  </span>
                  <p className="mt-1 text-zinc-800 dark:text-zinc-200">
                    {activeProject.continuityState.activeCastSummary}
                  </p>
                </div>
                <div>
                  <span className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                    Unresolved Cliffhanger
                  </span>
                  <p className="mt-1 text-zinc-800 dark:text-zinc-200">
                    {activeProject.continuityState.unresolvedCliffhanger}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* STAGE 3: Character Cast Setup & Custom Story Direction */}
      <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] p-4 sm:p-5 space-y-5">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] font-semibold text-amber-600 dark:text-[#F2B705]">
              03
            </span>
            <h2 className="font-display text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Character Cast &amp; Story Direction
            </h2>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Lock recurring character names and add custom emotional, romantic, or plot instructions.
          </p>
        </div>

        {/* 3 Cast Mode Cards */}
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {(
            [
              {
                id: "solo",
                label: "Single Protagonist",
                desc: "Personal first-person journey focused tightly on the narrator.",
                icon: User,
              },
              {
                id: "custom",
                label: "Add Character Name(s)",
                desc: "Enter exact recurring names & roles you want in the story.",
                icon: Users,
              },
              {
                id: "ai_choose",
                label: "AI Chooses For You",
                desc: "AI generates realistic names & locks them for future episodes.",
                icon: Sparkles,
              },
            ] as Array<{
              id: CharacterMode;
              label: string;
              desc: string;
              icon: typeof User;
            }>
          ).map((opt) => {
            const Icon = opt.icon;
            const active = activeProject.characterMode === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() =>
                  updateActiveProject((proj) => ({
                    ...proj,
                    characterMode: opt.id,
                  }))
                }
                className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                  active
                    ? "border-[#F2B705] bg-amber-50/70 dark:bg-[#1A160B]"
                    : "border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-[#0D0D10] hover:border-zinc-400 dark:hover:border-zinc-600"
                }`}
              >
                <Icon
                  className={`mt-0.5 h-4 w-4 shrink-0 ${
                    active
                      ? "text-amber-600 dark:text-[#F2B705]"
                      : "text-zinc-500 dark:text-zinc-400"
                  }`}
                />
                <div className="min-w-0">
                  <span className="block text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                    {opt.label}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
                    {opt.desc}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Add Character Name Input Row (shown for custom mode, or whenever user wants to edit locked cast) */}
        {(activeProject.characterMode === "custom" ||
          activeProject.characters.length > 0) && (
          <div className="space-y-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#0D0D10] p-3.5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                type="text"
                value={newCharName}
                onChange={(e) => setNewCharName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddRosterCharacter();
                  }
                }}
                placeholder="Character name (e.g. Marcus Vance)"
                className="min-h-[38px] flex-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] px-3 py-1.5 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:border-[#F2B705] focus:outline-none"
              />
              <input
                type="text"
                value={newCharRole}
                onChange={(e) => setNewCharRole(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddRosterCharacter();
                  }
                }}
                placeholder="Role / relationship (e.g. ER Nurse, Neighbor)"
                className="min-h-[38px] flex-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] px-3 py-1.5 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:border-[#F2B705] focus:outline-none"
              />
              <button
                type="button"
                onClick={handleAddRosterCharacter}
                disabled={!newCharName.trim()}
                className="inline-flex min-h-[38px] shrink-0 items-center justify-center gap-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#18181B] px-3.5 text-xs font-medium text-zinc-800 dark:text-zinc-200 hover:border-[#F2B705] disabled:opacity-40 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Character
              </button>
            </div>

            {activeProject.characters.length > 0 && (
              <div className="space-y-2 pt-1">
                <span className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Locked Cast Roster ({activeProject.characters.length})
                </span>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {activeProject.characters.map((ch) => (
                    <div
                      key={ch.id}
                      className="flex items-center gap-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] px-3 py-2"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={ch.name}
                            onChange={(e) =>
                              handleUpdateRosterCharacter(ch.id, {
                                name: e.target.value,
                              })
                            }
                            aria-label="Character name"
                            className="w-full bg-transparent text-xs font-semibold text-zinc-900 dark:text-zinc-100 focus:outline-none"
                          />
                          <span className="shrink-0 font-mono text-[10px] text-zinc-400">
                            {ch.introducedIn}
                          </span>
                        </div>
                        <input
                          type="text"
                          value={ch.role}
                          onChange={(e) =>
                            handleUpdateRosterCharacter(ch.id, {
                              role: e.target.value,
                            })
                          }
                          aria-label="Character role"
                          className="w-full bg-transparent text-[11px] text-zinc-500 dark:text-zinc-400 focus:outline-none"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveRosterCharacter(ch.id)}
                        aria-label={`Remove ${ch.name}`}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-400 hover:bg-red-500/10 hover:text-red-500 transition-colors"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* User Custom Story Direction & Emotional/Plot Inputs */}
        <div className="space-y-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#0D0D10] p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label
              htmlFor="custom-story-direction-input"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-800 dark:text-zinc-200"
            >
              <Sliders className="h-3.5 w-3.5 text-amber-600 dark:text-[#F2B705]" />
              Custom Story Direction &amp; Creative Inputs
              <span className="font-normal text-zinc-500 dark:text-zinc-400">
                (Optional)
              </span>
            </label>
            {activeProject.customStoryNotes.trim() && (
              <button
                type="button"
                onClick={() =>
                  updateActiveProject((proj) => ({
                    ...proj,
                    customStoryNotes: "",
                  }))
                }
                className="text-[11px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
              >
                Clear notes
              </button>
            )}
          </div>

          <textarea
            id="custom-story-direction-input"
            rows={3}
            value={activeProject.customStoryNotes}
            onChange={(e) =>
              updateActiveProject((proj) => ({
                ...proj,
                customStoryNotes: e.target.value,
              }))
            }
            placeholder="Describe any custom plot angles, emotional dynamics, or twists (e.g., slow-burn romance between two survivors, jealousy when a newcomer joins the bunker, possessive protective streak, hidden betrayal)…"
            className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] px-3 py-2 text-xs leading-relaxed text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:border-[#F2B705] focus:outline-none"
          />

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-zinc-500 dark:text-zinc-400 mr-1">
              Quick add:
            </span>
            {STORY_DIRECTION_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => handleAppendStoryDirection(preset)}
                className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#18181B] px-2.5 py-1 text-[11px] font-medium text-zinc-700 dark:text-zinc-300 hover:border-[#F2B705] hover:text-zinc-950 dark:hover:text-white transition-colors"
              >
                + {preset}
              </button>
            ))}
          </div>
        </div>

        {/* Primary Generate Script Action Bar */}
        <div className="flex flex-col gap-3 border-t border-zinc-200 dark:border-zinc-800 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            {activeProject.title.trim() ? (
              <span>
                Ready to write{" "}
                <strong className="text-zinc-800 dark:text-zinc-200">
                  {isSingleShortReel
                    ? "30-Second Short / Reel"
                    : serialized
                      ? `Season ${nextEpisodeTarget.seasonNumber}, Episode ${nextEpisodeTarget.episodeNumber}${
                          nextEpisodeTarget.isSeasonFinale ? " (Finale)" : ""
                        }`
                      : "Standalone Script"}
                </strong>{" "}
                ·{" "}
                {isSingleShortReel
                  ? `30 sec (~${SHORT_REEL_WORDS} words)`
                  : activeProject.shortsMode
                    ? `${activeProject.durationMinutes} min (${shortsSegmentCount} × 30s reels · ~${targetWords.toLocaleString()} words)`
                    : `${activeProject.durationMinutes} min (~${targetWords.toLocaleString()} words)`}
              </span>
            ) : (
              <span>
                Select a topic card or type a custom title above to begin.
              </span>
            )}
          </div>

          <button
            type="button"
            disabled={!activeProject.title.trim() || isBusy}
            onClick={() => void handleGenerateEpisode()}
            className="inline-flex min-h-[44px] w-full sm:w-auto items-center justify-center gap-2 rounded-lg bg-[#F2B705] px-5 py-2.5 text-sm font-semibold text-[#09090B] hover:bg-[#f7c52a] disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            {isGeneratingScript ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Writing Script…
              </>
            ) : (
              <>
                <FileText className="h-4 w-4" />
                {isSingleShortReel
                  ? allEpisodes.length > 0
                    ? "Regenerate 30s Reel"
                    : "Generate 30s Short / Reel"
                  : serialized
                    ? allEpisodes.length > 0
                      ? `Generate S${nextEpisodeTarget.seasonNumber} · Episode ${nextEpisodeTarget.episodeNumber}`
                      : "Generate Season 1 · Episode 1"
                    : allEpisodes.length > 0
                      ? "Regenerate Script"
                      : "Generate Script"}
              </>
            )}
          </button>
        </div>

        {/* Live Generation Progress Banner */}
        {isGeneratingScript && (
          <div className="flex items-center gap-3 rounded-lg border border-amber-300 dark:border-[#F2B705]/40 bg-amber-50 dark:bg-[#19150C] px-4 py-3 text-xs text-amber-900 dark:text-amber-100">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-amber-600 dark:text-[#F2B705]" />
            <span>{generatingStatusLabel}</span>
          </div>
        )}
      </section>

      {/* TTS SCRIPT OUTPUT & POST-DELIVERY HANDOFF BAR */}
      {viewedEpisode && (
        <section
          ref={scriptOutputRef}
          className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] overflow-hidden"
        >
          {/* Output Header (Outside copyable TTS script) */}
          <div className="flex flex-col gap-3 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#0D0D10] px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-semibold text-amber-700 dark:text-[#F2B705]">
                  {serialized
                    ? `S${viewedEpisode.seasonNumber}E${viewedEpisode.episodeNumber}`
                    : viewedEpisode.isShortsMode
                      ? "30S REEL"
                      : "STANDALONE"}
                </span>
                <h2 className="font-display text-base sm:text-lg font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                  {viewedEpisode.episodeTitle}
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                <span>
                  {viewedEpisode.wordCount.toLocaleString()} spoken words
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  {viewedEpisode.targetSeconds && viewedEpisode.targetSeconds < 60
                    ? `~${Math.round((viewedEpisode.wordCount / WORDS_PER_MINUTE) * 60)} sec at ${WORDS_PER_MINUTE} WPM`
                    : `~${(viewedEpisode.wordCount / WORDS_PER_MINUTE).toFixed(1)} min at ${WORDS_PER_MINUTE} WPM`}
                </span>
                {viewedEpisode.isShortsMode && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-amber-700 dark:text-[#F2B705]">
                      Shorts Mode (
                      {viewedEpisode.shortsSegmentCount ??
                        Math.max(1, viewedShortSegments.length)}{" "}
                      × 30s)
                    </span>
                  </>
                )}
                {viewedEpisode.endingStyle === "season_partial_conclusion" && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-emerald-600 dark:text-emerald-400">
                      Partial Conclusion
                    </span>
                  </>
                )}
                <span aria-hidden="true">·</span>
                <span>Pure TTS Ready</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void handleCopyTts()}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-[#F2B705] px-3.5 py-1.5 text-xs font-semibold text-[#09090B] hover:bg-[#f7c52a] transition-colors"
              >
                {copiedTts ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    Copied TTS Script
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copy for TTS
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleDownloadTxt}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#18181B] px-3 py-1.5 text-xs font-medium text-zinc-800 dark:text-zinc-200 hover:border-zinc-400 dark:hover:border-zinc-500 transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                Download .txt
              </button>
            </div>
          </div>

          {/* Strictly Spoken-Words-Only Copyable TTS Block */}
          <div className="p-4 sm:p-5">
            <pre
              aria-label="TTS-ready spoken script"
              className="max-h-[540px] overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] p-4 sm:p-6 font-sans text-sm leading-7 text-zinc-900 dark:text-zinc-100 select-all"
            >
              {viewedEpisode.scriptText}
            </pre>
          </div>

          {/* Collapsible 30-Second Reel Splits Preview (Strictly Outside Main TTS Block) */}
          {viewedEpisode.isShortsMode && viewedShortSegments.length > 1 && (
            <div className="border-t border-zinc-200 dark:border-zinc-800 px-4 py-3 sm:px-5">
              <button
                type="button"
                onClick={() => setShowShortSplitsPanel((prev) => !prev)}
                className="flex w-full items-center justify-between text-xs font-medium text-amber-700 dark:text-[#F2B705]"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Film className="h-3.5 w-3.5" />
                  30-Second Reel Splits Preview ({viewedShortSegments.length}{" "}
                  continuity segments)
                </span>
                {showShortSplitsPanel ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>

              {showShortSplitsPanel && (
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                  {viewedShortSegments.map((seg, idx) => {
                    const segWords = countSpokenWords(seg);
                    const estSec = Math.round(
                      (segWords / WORDS_PER_MINUTE) * 60
                    );
                    return (
                      <div
                        key={idx}
                        className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] p-3 space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 tabular-nums">
                            Reel {idx + 1} · {segWords} words (~{estSec}s)
                          </span>
                          <button
                            type="button"
                            onClick={() => void handleCopyShortSegment(seg, idx)}
                            className="inline-flex items-center gap-1 rounded border border-zinc-300 dark:border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-600 dark:text-zinc-300 hover:border-[#F2B705]"
                          >
                            {copiedSegmentIdx === idx ? (
                              <>
                                <Check className="h-3 w-3 text-emerald-500" />
                                Copied
                              </>
                            ) : (
                              <>
                                <Copy className="h-3 w-3" />
                                Copy
                              </>
                            )}
                          </button>
                        </div>
                        <p className="text-xs leading-relaxed text-zinc-800 dark:text-zinc-200">
                          {seg}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Collapsible Research Sources (Strictly Outside Spoken Block) */}
          {viewedEpisode.researchSources.length > 0 && (
            <div className="border-t border-zinc-200 dark:border-zinc-800 px-4 py-3 sm:px-5">
              <button
                type="button"
                onClick={() => setShowSourcesPanel((prev) => !prev)}
                className="flex w-full items-center justify-between text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
              >
                <span>
                  Verified Research Sources (
                  {viewedEpisode.researchSources.length})
                </span>
                {showSourcesPanel ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>

              {showSourcesPanel && (
                <ul className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {viewedEpisode.researchSources.map((src) => (
                    <li key={src.uri} className="min-w-0">
                      <a
                        href={src.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex max-w-full items-center gap-1.5 text-xs text-amber-700 dark:text-[#F2B705] hover:underline"
                      >
                        <ExternalLink className="h-3 w-3 shrink-0" />
                        <span className="truncate">{src.title}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Post-Script Handoff Bar: Revise Script + Continue Next Episode + Part 2 Status */}
          <div className="border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#0D0D10] p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowRevisionForm((prev) => !prev)}
                  disabled={isBusy}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#18181B] px-3.5 py-1.5 text-xs font-medium text-zinc-800 dark:text-zinc-200 hover:border-[#F2B705] disabled:opacity-40 transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Request Revisions
                </button>
              </div>

              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Scene Breakdown &amp; Storyboard Handoff (Part 2 module coming
                next)
              </span>
            </div>

            {/* Inline Revision Request Box */}
            {showRevisionForm && (
              <div className="space-y-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] p-3.5">
                <label
                  htmlFor="script-revision-notes"
                  className="block text-xs font-semibold text-zinc-800 dark:text-zinc-200"
                >
                  What should change in this script?
                </label>
                <textarea
                  id="script-revision-notes"
                  rows={3}
                  value={revisionInput}
                  onChange={(e) => setRevisionInput(e.target.value)}
                  placeholder="e.g. Make the winter blackout scene tenser, add romantic tension in the shelter, and keep the pacing crisp..."
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#09090B] px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:border-[#F2B705] focus:outline-none"
                />
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowRevisionForm(false)}
                    className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!revisionInput.trim() || isBusy}
                    onClick={() => void handleReviseViewedEpisode()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#F2B705] px-4 py-1.5 text-xs font-semibold text-[#09090B] hover:bg-[#f7c52a] disabled:opacity-40 transition-colors"
                  >
                    {isRevisingScript ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Revising Script…
                      </>
                    ) : (
                      "Apply Revisions"
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Serialized Next Episode Continuation Panel (Starts directly where previous episode left off) */}
            {serialized && (
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] p-4 space-y-3.5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-0.5">
                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      {nextEpisodeTarget.opensNewSeason
                        ? `Launch Season ${nextEpisodeTarget.seasonNumber}, Episode 1 (Fresh Chapter)`
                        : `Continue to Season ${nextEpisodeTarget.seasonNumber}, Episode ${nextEpisodeTarget.episodeNumber}${
                            nextEpisodeTarget.isSeasonFinale
                              ? " (Season Finale · Partial Conclusion)"
                              : ""
                          }`}
                    </h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {nextEpisodeTarget.opensNewSeason
                        ? `Opens Season ${nextEpisodeTarget.seasonNumber} as a fresh chapter following Season ${nextEpisodeTarget.seasonNumber - 1}'s partial conclusion while keeping the exact same voice, cast, and continuity.`
                        : `Picks up directly where S${viewedEpisode.seasonNumber}E${viewedEpisode.episodeNumber} left off with full timeline, resource, and cast continuity.`}
                    </p>
                  </div>
                </div>

                {/* Inline "Add new characters for this episode?" Choice */}
                <div className="space-y-2.5 border-t border-zinc-200 dark:border-zinc-800 pt-3">
                  <span className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Add new characters for Season{" "}
                    {nextEpisodeTarget.seasonNumber}, Episode{" "}
                    {nextEpisodeTarget.episodeNumber}?
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    {(
                      [
                        { id: "none", label: "No (Keep Current Cast)" },
                        { id: "custom", label: "Add Name(s)" },
                        { id: "ai_choose", label: "AI Chooses New Cast" },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setNextEpCharChoice(opt.id);
                          if (
                            opt.id === "custom" &&
                            nextEpCustomChars.length === 0
                          ) {
                            setNextEpCustomChars([
                              {
                                id: `new-char-${crypto.randomUUID()}`,
                                name: "",
                                role: "",
                              },
                            ]);
                          }
                        }}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                          nextEpCharChoice === opt.id
                            ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-950"
                            : "border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#18181B] text-zinc-700 dark:text-zinc-300 hover:border-zinc-400"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {nextEpCharChoice === "custom" && (
                    <div className="space-y-2 pt-1">
                      {nextEpCustomChars.map((row) => (
                        <div
                          key={row.id}
                          className="flex flex-col gap-2 sm:flex-row sm:items-center"
                        >
                          <input
                            type="text"
                            value={row.name}
                            onChange={(e) =>
                              setNextEpCustomChars((prev) =>
                                prev.map((r) =>
                                  r.id === row.id
                                    ? { ...r, name: e.target.value }
                                    : r
                                )
                              )
                            }
                            placeholder="New character name"
                            className="min-h-[36px] flex-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#09090B] px-3 text-xs text-zinc-900 dark:text-zinc-100 focus:border-[#F2B705] focus:outline-none"
                          />
                          <input
                            type="text"
                            value={row.role}
                            onChange={(e) =>
                              setNextEpCustomChars((prev) =>
                                prev.map((r) =>
                                  r.id === row.id
                                    ? { ...r, role: e.target.value }
                                    : r
                                )
                              )
                            }
                            placeholder="Role (e.g. Radio Operator)"
                            className="min-h-[36px] flex-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#09090B] px-3 text-xs text-zinc-900 dark:text-zinc-100 focus:border-[#F2B705] focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setNextEpCustomChars((prev) =>
                                prev.filter((r) => r.id !== row.id)
                              )
                            }
                            aria-label="Remove character row"
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-300 dark:border-zinc-800 text-zinc-400 hover:text-red-500"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}

                      <button
                        type="button"
                        onClick={() =>
                          setNextEpCustomChars((prev) => [
                            ...prev,
                            {
                              id: `new-char-${crypto.randomUUID()}`,
                              name: "",
                              role: "",
                            },
                          ])
                        }
                        className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-[#F2B705] hover:underline"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add another character
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() =>
                      void handleGenerateEpisode({
                        overrideTarget: nextEpisodeTarget,
                        newEpMode: nextEpCharChoice,
                        newEpCharacters:
                          nextEpCharChoice === "custom"
                            ? nextEpCustomChars
                            : [],
                      })
                    }
                    className="inline-flex min-h-[42px] w-full sm:w-auto items-center justify-center gap-2 rounded-lg bg-[#F2B705] px-4 py-2 text-xs font-semibold text-[#09090B] hover:bg-[#f7c52a] disabled:opacity-40 transition-colors"
                  >
                    {isGeneratingScript ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Writing S{nextEpisodeTarget.seasonNumber}E
                        {nextEpisodeTarget.episodeNumber}…
                      </>
                    ) : (
                      <>
                        Generate Season {nextEpisodeTarget.seasonNumber} ·
                        Episode {nextEpisodeTarget.episodeNumber}
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Master Script Brief Modal */}
      <ScriptBriefModal
        isOpen={isBriefModalOpen}
        briefConfig={workspace.briefConfig}
        onClose={() => setIsBriefModalOpen(false)}
        onUpdateBrief={(next) =>
          setWorkspace((prev) => ({
            ...prev,
            briefConfig: next,
            updatedAt: Date.now(),
          }))
        }
        onResetDefaults={() => {
          setWorkspace((prev) => ({
            ...prev,
            briefConfig: { ...DEFAULT_SCRIPT_BRIEF },
            briefVersion: SCRIPT_BRIEF_VERSION,
            updatedAt: Date.now(),
          }));
          onNotify("Restored default Script Writer Master Brief", "neutral");
        }}
      />
    </div>
  );
}
