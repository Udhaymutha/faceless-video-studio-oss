import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  FileDown,
  Loader2,
  Mic,
  Play,
  RefreshCw,
  Search,
  Sliders,
  Sparkles,
  Square,
  Trash2,
  Volume2,
} from "lucide-react";
import {
  buildNarrationStylePrompt,
  createInitialNarrationState,
  GOOGLE_TTS_VOICES,
  INLINE_CUE_TOOLS,
  NARRATION_EMOTION_OPTIONS,
  NARRATION_PACE_OPTIONS,
  NARRATION_PUNCTUATION_OPTIONS,
  TTS_MODELS,
} from "../data/narrationVoices";
import type {
  InlineCueTool,
} from "../data/narrationVoices";
import type {
  NarrationSegment,
  NarrationWorkspaceState,
  VoiceProfile,
} from "../types/narration";
import type { ScriptWriterWorkspaceState } from "../types/scriptWriter";
import type { ToastMessage } from "../types/studio";
import {
  loadNarrationState,
  loadScriptWriterState,
  saveNarrationState,
} from "../utils/batchCache";
import {
  base64ToUint8Array,
  formatAudioDuration,
  parseScriptIntoNarrationSegments,
  parseWavBytes,
  stitchNarrationSegmentsToWav,
} from "../utils/narrationAudio";

interface NarrationViewProps {
  onNotify: (text: string, tone?: ToastMessage["tone"]) => void;
}

interface ImportableEpisodeOption {
  key: string;
  projectTitle: string;
  episodeCode: string;
  episodeTitle: string;
  scriptText: string;
  wordCount: number;
  updatedAt: number;
  isActiveProject: boolean;
}

function collectImportableEpisodes(
  swState: ScriptWriterWorkspaceState | null
): ImportableEpisodeOption[] {
  if (!swState || !Array.isArray(swState.projects)) return [];

  const options: ImportableEpisodeOption[] = [];
  for (const project of swState.projects) {
    const isActiveProject = project.id === swState.activeProjectId;
    for (const season of project.seasons ?? []) {
      for (const ep of season.episodes ?? []) {
        if (!ep.scriptText || !ep.scriptText.trim()) continue;
        const episodeCode = `S${ep.seasonNumber}E${ep.episodeNumber}`;
        options.push({
          key: `${project.id}:${ep.id}`,
          projectTitle: project.title || "Untitled Series",
          episodeCode,
          episodeTitle: ep.episodeTitle || episodeCode,
          scriptText: ep.scriptText,
          wordCount:
            ep.wordCount ||
            ep.scriptText.trim().split(/\s+/).filter(Boolean).length,
          updatedAt: ep.updatedAt || ep.generatedAt || 0,
          isActiveProject,
        });
      }
    }
  }

  // Prioritize active project's latest episode first, then most recently updated
  options.sort((a, b) => {
    if (a.isActiveProject !== b.isActiveProject) {
      return a.isActiveProject ? -1 : 1;
    }
    return b.updatedAt - a.updatedAt;
  });

  return options;
}

function slugifyFilename(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function NarrationView({ onNotify }: NarrationViewProps) {
  const [workspace, setWorkspace] = useState<NarrationWorkspaceState>(
    createInitialNarrationState
  );
  const [isHydrated, setIsHydrated] = useState(false);

  // Importable Script Writer episodes
  const [availableEpisodes, setAvailableEpisodes] = useState<
    ImportableEpisodeOption[]
  >([]);
  const [selectedImportKey, setSelectedImportKey] = useState<string>("");

  // Voice gallery filters & live sample playback
  const [voiceSearch, setVoiceSearch] = useState("");
  const [genderFilter, setGenderFilter] = useState<"All" | "Male" | "Female">(
    "All"
  );
  const [previewLoadingVoice, setPreviewLoadingVoice] = useState<string | null>(
    null
  );
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const [isTestingOpening, setIsTestingOpening] = useState(false);

  // Synthesis state
  const [segments, setSegments] = useState<NarrationSegment[]>([]);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [synthProgress, setSynthProgress] = useState<{
    completed: number;
    total: number;
  }>({ completed: 0, total: 0 });
  const [retryingSegmentId, setRetryingSegmentId] = useState<string | null>(
    null
  );
  const [playingSegmentId, setPlayingSegmentId] = useState<string | null>(null);
  const [showSegmentsDrawer, setShowSegmentsDrawer] = useState(false);

  // Master audio playback URL (from freshly stitched or IndexedDB hydrated Blob)
  const [masterAudioUrl, setMasterAudioUrl] = useState<string | null>(null);
  const [masterAudioBlob, setMasterAudioBlob] = useState<Blob | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const previewCacheRef = useRef<Map<string, string>>(new Map());
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const synthAbortRef = useRef<AbortController | null>(null);
  const masterAudioUrlRef = useRef<string | null>(null);

  // Clean up any active audio element & object URLs on unmount
  useEffect(() => {
    return () => {
      synthAbortRef.current?.abort();
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current.src = "";
      }
      if (masterAudioUrlRef.current) {
        URL.revokeObjectURL(masterAudioUrlRef.current);
      }
    };
  }, []);

  const updateMasterBlob = useCallback((blob: Blob | null) => {
    if (masterAudioUrlRef.current) {
      URL.revokeObjectURL(masterAudioUrlRef.current);
      masterAudioUrlRef.current = null;
    }
    setMasterAudioBlob(blob);
    if (blob) {
      const nextUrl = URL.createObjectURL(blob);
      masterAudioUrlRef.current = nextUrl;
      setMasterAudioUrl(nextUrl);
    } else {
      setMasterAudioUrl(null);
    }
  }, []);

  // Hydrate saved Narration workspace + available Script Writer episodes on mount
  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      try {
        const [savedNarration, savedScriptWriter] = await Promise.all([
          loadNarrationState().catch(() => null),
          loadScriptWriterState().catch(() => null),
        ]);

        if (cancelled) return;

        if (savedNarration) {
          setWorkspace({
            ...createInitialNarrationState(),
            ...savedNarration,
          });
          if (savedNarration.lastAudioBlob instanceof Blob) {
            updateMasterBlob(savedNarration.lastAudioBlob);
          }
        }

        const eps = collectImportableEpisodes(savedScriptWriter);
        setAvailableEpisodes(eps);
        if (eps.length > 0) {
          setSelectedImportKey(eps[0].key);
        }
      } finally {
        if (!cancelled) {
          setIsHydrated(true);
        }
      }
    };

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [updateMasterBlob]);

  // Auto-persist workspace changes to IndexedDB (debounced)
  useEffect(() => {
    if (!isHydrated) return;
    const timer = window.setTimeout(() => {
      void saveNarrationState({
        ...workspace,
        lastAudioBlob: masterAudioBlob,
        updatedAt: Date.now(),
      }).catch(() => undefined);
    }, 350);

    return () => window.clearTimeout(timer);
  }, [isHydrated, workspace, masterAudioBlob]);

  const stopPreviewAudio = useCallback(() => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.currentTime = 0;
      audioPlayerRef.current = null;
    }
    setPlayingVoice(null);
    setPlayingSegmentId(null);
  }, []);

  const playBase64Wav = useCallback(
    (
      audioBase64: string,
      mimeType: string,
      onEnded: () => void
    ) => {
      stopPreviewAudio();
      const audio = new Audio(`data:${mimeType};base64,${audioBase64}`);
      audioPlayerRef.current = audio;
      audio.onended = () => {
        if (audioPlayerRef.current === audio) {
          audioPlayerRef.current = null;
        }
        onEnded();
      };
      audio.onerror = () => {
        if (audioPlayerRef.current === audio) {
          audioPlayerRef.current = null;
        }
        onEnded();
      };
      void audio.play().catch(() => {
        onEnded();
      });
    },
    [stopPreviewAudio]
  );

  // Import directly from Script Writer output stored in IndexedDB (keeps Script Writer untouched)
  const handleImportFromScriptWriter = async (explicitKey?: string) => {
    try {
      const swState = await loadScriptWriterState();
      const episodes = collectImportableEpisodes(swState);
      setAvailableEpisodes(episodes);

      if (episodes.length === 0) {
        onNotify(
          "No generated script found in Script Writer yet. Generate an episode in Script Writer first, or paste your own script below.",
          "error"
        );
        return;
      }

      const targetKey = explicitKey || selectedImportKey || episodes[0].key;
      const chosen =
        episodes.find((ep) => ep.key === targetKey) ?? episodes[0];

      setSelectedImportKey(chosen.key);
      setWorkspace((prev) => ({
        ...prev,
        scriptText: chosen.scriptText,
        sourceTitle: chosen.projectTitle,
        sourceEpisodeCode: `${chosen.episodeCode} · ${chosen.episodeTitle}`,
        updatedAt: Date.now(),
      }));
      setSegments([]);
      onNotify(
        `Imported ${chosen.episodeCode} (${chosen.wordCount.toLocaleString()} words) from Script Writer`,
        "success"
      );
    } catch {
      onNotify("Could not read Script Writer output from local storage.", "error");
    }
  };

  // Insert or wrap expressive Google Flow cue in textarea
  const handleApplyInlineCue = (tool: InlineCueTool) => {
    const textarea = textareaRef.current;
    const currentText = workspace.scriptText;

    if (!textarea) {
      const addition =
        tool.mode === "wrap"
          ? `${tool.openTag}${tool.placeholder || "line"}${tool.closeTag || ""}`
          : tool.openTag;
      setWorkspace((prev) => ({
        ...prev,
        scriptText: `${prev.scriptText}${prev.scriptText ? " " : ""}${addition}`,
      }));
      return;
    }

    const start = textarea.selectionStart ?? currentText.length;
    const end = textarea.selectionEnd ?? currentText.length;
    const selected = currentText.slice(start, end);

    let nextText = currentText;
    let nextSelStart = start;
    let nextSelEnd = end;

    if (tool.mode === "wrap") {
      const inner = selected || tool.placeholder || "text";
      const wrapped = `${tool.openTag}${inner}${tool.closeTag || ""}`;
      nextText =
        currentText.slice(0, start) + wrapped + currentText.slice(end);
      nextSelStart = start + tool.openTag.length;
      nextSelEnd = nextSelStart + inner.length;
    } else {
      nextText =
        currentText.slice(0, start) + tool.openTag + currentText.slice(end);
      nextSelStart = start + tool.openTag.length;
      nextSelEnd = nextSelStart;
    }

    setWorkspace((prev) => ({ ...prev, scriptText: nextText }));

    window.requestAnimationFrame(() => {
      if (!textareaRef.current) return;
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(nextSelStart, nextSelEnd);
    });
  };

  // Audition any of the 30 Google TTS voices (cached after first listen)
  const handlePlayVoiceSample = async (voice: VoiceProfile) => {
    if (playingVoice === voice.name) {
      stopPreviewAudio();
      return;
    }

    stopPreviewAudio();

    const cached = previewCacheRef.current.get(voice.name);
    if (cached) {
      setPlayingVoice(voice.name);
      playBase64Wav(cached, "audio/wav", () => setPlayingVoice(null));
      return;
    }

    setPreviewLoadingVoice(voice.name);
    try {
      const res = await fetch("/api/narration/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voiceName: voice.name,
          sampleText: voice.sampleLine,
          style: `Natural studio voice sample showcasing a ${voice.tone} tone.`,
        }),
      });
      const payload = await res.json();
      if (!res.ok || !payload?.audioBase64) {
        throw new Error(payload?.error || "Voice sample preview failed.");
      }

      previewCacheRef.current.set(voice.name, payload.audioBase64);
      setPlayingVoice(voice.name);
      playBase64Wav(
        payload.audioBase64,
        payload.mimeType || "audio/wav",
        () => setPlayingVoice(null)
      );
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : "Failed to load voice sample.",
        "error"
      );
    } finally {
      setPreviewLoadingVoice(null);
    }
  };

  // Quick audition of the first sentence of the user's current script with active emotion/pace/punctuation settings
  const handleTestOpeningLine = async () => {
    const trimmed = workspace.scriptText.trim();
    if (!trimmed) {
      onNotify("Add or import a script first to audition your voice direction.", "error");
      return;
    }

    stopPreviewAudio();
    const parsed = parseScriptIntoNarrationSegments(
      trimmed,
      workspace.punctuationMode
    );
    const firstSpeech = parsed.find((s) => s.type === "speech");
    if (!firstSpeech) {
      onNotify("No spoken text found in the script.", "error");
      return;
    }

    // Grab up to the first 35 words so audition stays fast (~5-10 seconds)
    const sampleSnippet = firstSpeech.text
      .split(/\s+/)
      .slice(0, 35)
      .join(" ");

    const stylePrompt = buildNarrationStylePrompt({
      emotion: workspace.emotion,
      pace: workspace.pace,
      punctuationMode: workspace.punctuationMode,
      customDirection: workspace.customDirection,
      spanStyleOverride: firstSpeech.styleOverride,
    });

    setIsTestingOpening(true);
    try {
      const res = await fetch("/api/narration/synthesize-chunk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: sampleSnippet,
          voiceName: workspace.voiceName,
          model: workspace.model,
          style: stylePrompt,
        }),
      });
      const payload = await res.json();
      if (!res.ok || !payload?.audioBase64) {
        throw new Error(payload?.error || "Opening line test failed.");
      }

      setPlayingVoice(`test:${workspace.voiceName}`);
      playBase64Wav(
        payload.audioBase64,
        payload.mimeType || "audio/wav",
        () => setPlayingVoice(null)
      );
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : "Failed to audition opening line.",
        "error"
      );
    } finally {
      setIsTestingOpening(false);
    }
  };

  // Full script synthesis -> stitches all speech chunks + pause silence into one master WAV Blob
  const handleGenerateNarration = async () => {
    if (isSynthesizing) return;

    const trimmed = workspace.scriptText.trim();
    if (!trimmed) {
      onNotify(
        "Enter a script or click Import from Script Writer before generating audio.",
        "error"
      );
      return;
    }

    const parsedSegments = parseScriptIntoNarrationSegments(
      trimmed,
      workspace.punctuationMode
    );
    const speechSegments = parsedSegments.filter((s) => s.type === "speech");

    if (speechSegments.length === 0) {
      onNotify("No spoken narration text found to synthesize.", "error");
      return;
    }

    stopPreviewAudio();
    const controller = new AbortController();
    synthAbortRef.current = controller;

    setIsSynthesizing(true);
    setSegments(parsedSegments);
    setSynthProgress({ completed: 0, total: speechSegments.length });

    const workingSegments: NarrationSegment[] = parsedSegments.map((s) => ({
      ...s,
    }));
    let completedSpeech = 0;
    let failedSpeech = 0;

    for (let i = 0; i < workingSegments.length; i++) {
      const seg = workingSegments[i];
      if (seg.type !== "speech") continue;
      if (controller.signal.aborted) break;

      workingSegments[i] = {
        ...seg,
        status: "generating",
        errorMessage: undefined,
      };
      setSegments([...workingSegments]);

      const stylePrompt = buildNarrationStylePrompt({
        emotion: workspace.emotion,
        pace: workspace.pace,
        punctuationMode: workspace.punctuationMode,
        customDirection: workspace.customDirection,
        spanStyleOverride: seg.styleOverride,
      });

      try {
        const res = await fetch("/api/narration/synthesize-chunk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            text: seg.text,
            voiceName: workspace.voiceName,
            model: workspace.model,
            style: stylePrompt,
          }),
        });
        const payload = await res.json();
        if (!res.ok || !payload?.audioBase64) {
          throw new Error(payload?.error || "Segment synthesis failed.");
        }

        const parsedWav = parseWavBytes(
          base64ToUint8Array(payload.audioBase64)
        );
        workingSegments[i] = {
          ...workingSegments[i],
          status: "completed",
          wavBase64: payload.audioBase64,
          durationSeconds: parsedWav.durationSeconds,
          errorMessage: undefined,
        };
        completedSpeech += 1;
      } catch (err) {
        if (controller.signal.aborted) {
          workingSegments[i] = {
            ...workingSegments[i],
            status: "idle",
          };
          break;
        }
        failedSpeech += 1;
        workingSegments[i] = {
          ...workingSegments[i],
          status: "error",
          errorMessage:
            err instanceof Error ? err.message : "Segment synthesis error.",
        };
      }

      setSegments([...workingSegments]);
      setSynthProgress({
        completed: completedSpeech + failedSpeech,
        total: speechSegments.length,
      });
    }

    const stitched = stitchNarrationSegmentsToWav(workingSegments);
    if (stitched) {
      updateMasterBlob(stitched.blob);
      const nextState: NarrationWorkspaceState = {
        ...workspace,
        lastAudioBlob: stitched.blob,
        lastAudioDuration: stitched.durationSeconds,
        lastAudioVoice: workspace.voiceName,
        lastGeneratedAt: Date.now(),
        updatedAt: Date.now(),
      };
      setWorkspace(nextState);
      void saveNarrationState(nextState).catch(() => undefined);
    }

    if (controller.signal.aborted) {
      onNotify(
        stitched
          ? `Generation stopped. Partial clip (${formatAudioDuration(stitched.durationSeconds)}) is ready below.`
          : "Narration generation stopped.",
        "neutral"
      );
    } else if (failedSpeech > 0) {
      setShowSegmentsDrawer(true);
      onNotify(
        `${completedSpeech} of ${speechSegments.length} segments succeeded (${failedSpeech} failed). You can retry failed segments below.`,
        "error"
      );
    } else if (stitched) {
      onNotify(
        `Narration ready (${formatAudioDuration(stitched.durationSeconds)}) with ${workspace.voiceName}`,
        "success"
      );
    }

    synthAbortRef.current = null;
    setIsSynthesizing(false);
  };

  const handleStopSynthesis = () => {
    synthAbortRef.current?.abort();
  };

  // Retry any single segment and seamlessly re-stitch the master WAV
  const handleRetrySegment = async (segmentId: string) => {
    if (isSynthesizing || retryingSegmentId) return;
    const targetIdx = segments.findIndex((s) => s.id === segmentId);
    if (targetIdx === -1) return;
    const seg = segments[targetIdx];
    if (seg.type !== "speech") return;

    setRetryingSegmentId(segmentId);
    setSegments((prev) =>
      prev.map((s) =>
        s.id === segmentId
          ? { ...s, status: "generating", errorMessage: undefined }
          : s
      )
    );

    const stylePrompt = buildNarrationStylePrompt({
      emotion: workspace.emotion,
      pace: workspace.pace,
      punctuationMode: workspace.punctuationMode,
      customDirection: workspace.customDirection,
      spanStyleOverride: seg.styleOverride,
    });

    try {
      const res = await fetch("/api/narration/synthesize-chunk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: seg.text,
          voiceName: workspace.voiceName,
          model: workspace.model,
          style: stylePrompt,
        }),
      });
      const payload = await res.json();
      if (!res.ok || !payload?.audioBase64) {
        throw new Error(payload?.error || "Segment retry failed.");
      }

      const parsedWav = parseWavBytes(base64ToUint8Array(payload.audioBase64));
      const updatedSegments = segments.map((s) =>
        s.id === segmentId
          ? {
              ...s,
              status: "completed" as const,
              wavBase64: payload.audioBase64,
              durationSeconds: parsedWav.durationSeconds,
              errorMessage: undefined,
            }
          : s
      );
      setSegments(updatedSegments);

      const stitched = stitchNarrationSegmentsToWav(updatedSegments);
      if (stitched) {
        updateMasterBlob(stitched.blob);
        const nextState: NarrationWorkspaceState = {
          ...workspace,
          lastAudioBlob: stitched.blob,
          lastAudioDuration: stitched.durationSeconds,
          lastAudioVoice: workspace.voiceName,
          lastGeneratedAt: Date.now(),
          updatedAt: Date.now(),
        };
        setWorkspace(nextState);
        void saveNarrationState(nextState).catch(() => undefined);
      }

      onNotify("Segment re-synthesized and master audio updated", "success");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Segment retry failed.";
      setSegments((prev) =>
        prev.map((s) =>
          s.id === segmentId
            ? { ...s, status: "error", errorMessage: msg }
            : s
        )
      );
      onNotify(msg, "error");
    } finally {
      setRetryingSegmentId(null);
    }
  };

  const handleDownloadWav = () => {
    if (!masterAudioBlob) return;
    const url = URL.createObjectURL(masterAudioBlob);
    const a = document.createElement("a");
    const baseName =
      slugifyFilename(
        workspace.sourceEpisodeCode || workspace.sourceTitle || "narration"
      ) || "narration";
    const voiceSlug = slugifyFilename(
      workspace.lastAudioVoice || workspace.voiceName
    );
    a.href = url;
    a.download = `${baseName}-${voiceSlug}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  // Derived script statistics
  const scriptStats = useMemo(() => {
    const cleaned = workspace.scriptText
      .replace(/\[\/?(whisper|loud|bold|slow|urgent)\]/gi, " ")
      .replace(/\[pause\s+[0-9.]+\s*s?\]/gi, " ")
      .replace(/<(breath|gasp|sigh|laugh)>/gi, " ")
      .trim();
    const words = cleaned ? cleaned.split(/\s+/).filter(Boolean).length : 0;
    const estSeconds = Math.round((words / 150) * 60);
    const previewSegments = parseScriptIntoNarrationSegments(
      workspace.scriptText,
      workspace.punctuationMode
    );
    const speechChunkCount = previewSegments.filter(
      (s) => s.type === "speech"
    ).length;

    return { words, estSeconds, speechChunkCount };
  }, [workspace.scriptText, workspace.punctuationMode]);

  const selectedVoiceProfile = useMemo(
    () =>
      GOOGLE_TTS_VOICES.find((v) => v.name === workspace.voiceName) ??
      GOOGLE_TTS_VOICES[0],
    [workspace.voiceName]
  );

  const filteredVoices = useMemo(() => {
    const q = voiceSearch.trim().toLowerCase();
    return GOOGLE_TTS_VOICES.filter((v) => {
      if (genderFilter !== "All" && v.gender !== genderFilter) return false;
      if (!q) return true;
      return (
        v.name.toLowerCase().includes(q) ||
        v.tone.toLowerCase().includes(q) ||
        v.bestFor.toLowerCase().includes(q)
      );
    });
  }, [voiceSearch, genderFilter]);

  const deliveryTools = useMemo(
    () => INLINE_CUE_TOOLS.filter((t) => t.category === "delivery"),
    []
  );
  const vocalTools = useMemo(
    () => INLINE_CUE_TOOLS.filter((t) => t.category === "vocal"),
    []
  );
  const pauseTools = useMemo(
    () => INLINE_CUE_TOOLS.filter((t) => t.category === "pause"),
    []
  );

  const speechSegmentsCount = useMemo(
    () => segments.filter((s) => s.type === "speech").length,
    [segments]
  );
  const failedSegmentsCount = useMemo(
    () => segments.filter((s) => s.type === "speech" && s.status === "error").length,
    [segments]
  );

  const progressPercent =
    synthProgress.total > 0
      ? Math.round((synthProgress.completed / synthProgress.total) * 100)
      : 0;

  return (
    <div className="space-y-6">
      {/* Studio Page Header */}
      <div className="flex flex-col gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Narration Studio
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Convert Script Writer output or custom scripts into expressive Google
            TTS voiceovers with vocal cues, pauses, and auditionable voices.
          </p>
        </div>

        {/* Direct Import Controls from Script Writer */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 w-full lg:w-auto">
          {availableEpisodes.length > 1 && (
            <select
              aria-label="Choose Script Writer episode to import"
              value={selectedImportKey}
              onChange={(e) => setSelectedImportKey(e.target.value)}
              disabled={isSynthesizing}
              className="min-h-[40px] w-full sm:w-64 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#111114] px-3 py-2 text-xs font-medium text-zinc-800 dark:text-zinc-200 focus:border-[#F2B705] focus:outline-none focus:ring-2 focus:ring-[#F2B705]/30"
            >
              {availableEpisodes.map((ep) => (
                <option key={ep.key} value={ep.key}>
                  {ep.episodeCode} · {ep.projectTitle} ({ep.wordCount}w)
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            onClick={() => {
              void handleImportFromScriptWriter();
            }}
            disabled={isSynthesizing}
            className="inline-flex min-h-[40px] w-full sm:w-auto items-center justify-center gap-2 rounded-lg border border-[#F2B705]/70 bg-amber-50 dark:bg-[#1E1A0E] px-4 py-2 text-xs font-semibold text-amber-900 dark:text-[#F2B705] hover:bg-amber-100 dark:hover:bg-[#2a2310] disabled:opacity-45 transition-colors whitespace-nowrap"
          >
            <FileDown className="h-4 w-4 shrink-0" />
            Import from Script Writer
          </button>
        </div>
      </div>

      {/* Main Two-Column Studio Workspace */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12 items-start">
        {/* LEFT COLUMN (7 cols): Script Input, Expressive Cue Toolbar, Synthesis & Master Audio Player */}
        <div className="space-y-6 xl:col-span-7 min-w-0">
          {/* Script Box + Google Flow Inline Cue Toolbar */}
          <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] shadow-xs overflow-hidden">
            {/* Script Card Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 dark:border-zinc-800 px-4 py-3.5 sm:px-5">
              <div className="min-w-0 space-y-0.5">
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Narration Script
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                  {workspace.sourceEpisodeCode
                    ? `Imported: ${workspace.sourceTitle ? `${workspace.sourceTitle} — ` : ""}${workspace.sourceEpisodeCode}`
                    : "Paste your own script or click Import from Script Writer above"}
                </p>
              </div>

              <div className="flex items-center gap-3 text-xs font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
                <span>{scriptStats.words.toLocaleString()} words</span>
                <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-700">
                  ·
                </span>
                <span>~{formatAudioDuration(scriptStats.estSeconds)}</span>
                {scriptStats.speechChunkCount > 0 && (
                  <>
                    <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-700">
                      ·
                    </span>
                    <span>
                      {scriptStats.speechChunkCount}{" "}
                      {scriptStats.speechChunkCount === 1 ? "part" : "parts"}
                    </span>
                  </>
                )}
                {workspace.scriptText.trim().length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setWorkspace((prev) => ({
                        ...prev,
                        scriptText: "",
                        sourceTitle: "",
                        sourceEpisodeCode: "",
                      }));
                      setSegments([]);
                    }}
                    disabled={isSynthesizing}
                    title="Clear script text"
                    className="inline-flex items-center gap-1 font-sans text-xs text-zinc-500 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-40 transition-colors ml-1"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Expressive Cue Toolbar (Whisper, Loud, Bold, Vocal Bursts, Pauses) */}
            <div className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-[#0C0C0F] px-4 py-3 sm:px-5 space-y-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mr-1">
                  Delivery
                </span>
                {deliveryTools.map((tool) => (
                  <button
                    key={tool.id}
                    type="button"
                    onClick={() => handleApplyInlineCue(tool)}
                    disabled={isSynthesizing}
                    title={tool.description}
                    className="min-h-[30px] rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#16161A] px-2.5 py-1 text-xs font-medium text-zinc-800 dark:text-zinc-200 hover:border-[#F2B705] hover:text-amber-700 dark:hover:text-[#F2B705] disabled:opacity-45 transition-colors"
                  >
                    {tool.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mr-1">
                  Vocal &amp; Pauses
                </span>
                {vocalTools.map((tool) => (
                  <button
                    key={tool.id}
                    type="button"
                    onClick={() => handleApplyInlineCue(tool)}
                    disabled={isSynthesizing}
                    title={tool.description}
                    className="min-h-[30px] rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#16161A] px-2.5 py-1 font-mono text-[11px] font-medium text-zinc-700 dark:text-zinc-300 hover:border-[#F2B705] hover:text-amber-700 dark:hover:text-[#F2B705] disabled:opacity-45 transition-colors"
                  >
                    {tool.label}
                  </button>
                ))}
                <span
                  aria-hidden="true"
                  className="mx-0.5 text-zinc-300 dark:text-zinc-700"
                >
                  |
                </span>
                {pauseTools.map((tool) => (
                  <button
                    key={tool.id}
                    type="button"
                    onClick={() => handleApplyInlineCue(tool)}
                    disabled={isSynthesizing}
                    title={tool.description}
                    className="min-h-[30px] rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#16161A] px-2.5 py-1 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:border-[#F2B705] hover:text-amber-700 dark:hover:text-[#F2B705] disabled:opacity-45 transition-colors"
                  >
                    {tool.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Highlight any line and click{" "}
                <span className="font-medium text-zinc-700 dark:text-zinc-300">
                  Whisper, Loud, Bold, Slow, or Urgent
                </span>{" "}
                to direct that line individually, or place your cursor to insert
                breaths and exact pauses.
              </p>
            </div>

            {/* Editable Script Textarea */}
            <div className="p-4 sm:p-5">
              <textarea
                ref={textareaRef}
                value={workspace.scriptText}
                onChange={(e) =>
                  setWorkspace((prev) => ({
                    ...prev,
                    scriptText: e.target.value,
                  }))
                }
                disabled={isSynthesizing}
                placeholder="Paste your narration script here, or click 'Import from Script Writer' at the top right to pull your generated episode directly..."
                className="min-h-[300px] sm:min-h-[360px] w-full resize-y rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] p-4 text-sm leading-relaxed text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:border-[#F2B705] focus:outline-none focus:ring-2 focus:ring-[#F2B705]/25 disabled:opacity-65"
              />
            </div>
          </section>

          {/* Generate Audio + Master Audio Player */}
          <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] p-4 sm:p-5 space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-0.5">
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Audio Output
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Voice:{" "}
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                    {workspace.voiceName}
                  </span>{" "}
                  ·{" "}
                  {NARRATION_EMOTION_OPTIONS.find(
                    (e) => e.id === workspace.emotion
                  )?.label ?? workspace.emotion}{" "}
                  ·{" "}
                  {NARRATION_PACE_OPTIONS.find((p) => p.id === workspace.pace)
                    ?.label ?? workspace.pace}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => {
                    void handleTestOpeningLine();
                  }}
                  disabled={
                    isSynthesizing ||
                    isTestingOpening ||
                    !workspace.scriptText.trim()
                  }
                  className="inline-flex min-h-[42px] flex-1 sm:flex-none items-center justify-center gap-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#18181B] px-3.5 py-2 text-xs font-semibold text-zinc-800 dark:text-zinc-200 hover:border-[#F2B705] hover:text-amber-700 dark:hover:text-[#F2B705] disabled:opacity-40 transition-colors whitespace-nowrap"
                >
                  {isTestingOpening ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Mic className="h-3.5 w-3.5" />
                  )}
                  Test First Line
                </button>

                {isSynthesizing ? (
                  <button
                    type="button"
                    onClick={handleStopSynthesis}
                    className="inline-flex min-h-[42px] flex-1 sm:flex-none items-center justify-center gap-2 rounded-lg bg-red-600 px-5 py-2 text-xs font-semibold text-white hover:bg-red-500 transition-colors whitespace-nowrap"
                  >
                    <Square className="h-3.5 w-3.5 fill-current" />
                    Stop Generation
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      void handleGenerateNarration();
                    }}
                    disabled={!workspace.scriptText.trim()}
                    className="inline-flex min-h-[42px] flex-1 sm:flex-none items-center justify-center gap-2 rounded-lg bg-[#F2B705] px-5 py-2 text-xs font-semibold text-[#09090B] hover:bg-[#f7c52a] disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Generate Audio Clip
                  </button>
                )}
              </div>
            </div>

            {/* Active Synthesis Progress */}
            {isSynthesizing && (
              <div className="space-y-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] p-3.5">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="inline-flex items-center gap-2 font-medium text-zinc-800 dark:text-zinc-200">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-600 dark:text-[#F2B705]" />
                    Synthesizing narration segment{" "}
                    {Math.min(synthProgress.completed + 1, synthProgress.total)}{" "}
                    of {synthProgress.total}…
                  </span>
                  <span className="font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
                    {progressPercent}%
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                  <div
                    className="h-full bg-[#F2B705] transition-all duration-300"
                    style={{ width: `${Math.max(6, progressPercent)}%` }}
                  />
                </div>
              </div>
            )}

            {/* Master Audio Player */}
            {masterAudioUrl ? (
              <div className="space-y-3 rounded-xl border border-emerald-300/70 dark:border-emerald-500/30 bg-emerald-50/50 dark:bg-[#0F1713] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                        Master Narration Clip{" "}
                        {workspace.lastAudioVoice
                          ? `· ${workspace.lastAudioVoice}`
                          : ""}
                      </p>
                      <p className="text-[11px] font-mono tabular-nums text-zinc-600 dark:text-zinc-400">
                        Duration:{" "}
                        {formatAudioDuration(workspace.lastAudioDuration ?? 0)}{" "}
                        · WAV 24kHz
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleDownloadWav}
                    className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-100 px-3.5 py-2 text-xs font-semibold text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white transition-colors whitespace-nowrap"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download .wav
                  </button>
                </div>

                <audio
                  controls
                  src={masterAudioUrl}
                  className="w-full h-10"
                />
              </div>
            ) : (
              !isSynthesizing && (
                <div className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-800 bg-zinc-50/70 dark:bg-[#09090B] px-4 py-6 text-center">
                  <Volume2 className="mx-auto h-5 w-5 text-zinc-400 dark:text-zinc-500 mb-2" />
                  <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    No narration clip generated yet
                  </p>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Pick a Google TTS voice on the right, tune your narration
                    direction, and click Generate Audio Clip.
                  </p>
                </div>
              )
            )}

            {/* Collapsible Segment Breakdown (inspect/preview/retry individual chunks) */}
            {speechSegmentsCount > 0 && (
              <div className="border-t border-zinc-200 dark:border-zinc-800 pt-3">
                <button
                  type="button"
                  onClick={() => setShowSegmentsDrawer((prev) => !prev)}
                  className="flex w-full items-center justify-between text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
                >
                  <span className="inline-flex items-center gap-2">
                    <span>
                      Segment Breakdown ({speechSegmentsCount} speech{" "}
                      {speechSegmentsCount === 1 ? "part" : "parts"})
                    </span>
                    {failedSegmentsCount > 0 && (
                      <span className="text-red-600 dark:text-red-400 font-semibold">
                        · {failedSegmentsCount} failed
                      </span>
                    )}
                  </span>
                  {showSegmentsDrawer ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>

                {showSegmentsDrawer && (
                  <div className="mt-3 space-y-2 max-h-[300px] overflow-y-auto pr-1">
                    {segments.map((seg) => {
                      if (seg.type === "pause") {
                        return (
                          <div
                            key={seg.id}
                            className="flex items-center justify-between rounded-md border border-dashed border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-[#0B0B0E] px-3 py-1.5 text-[11px] font-mono text-zinc-500 dark:text-zinc-400"
                          >
                            <span>{seg.cueLabel || "Pause"}</span>
                            <span>{seg.pauseSeconds}s silence</span>
                          </div>
                        );
                      }

                      const isPlayingThis = playingSegmentId === seg.id;
                      const isRetryingThis = retryingSegmentId === seg.id;

                      return (
                        <div
                          key={seg.id}
                          className={`rounded-lg border px-3 py-2.5 text-xs space-y-1.5 ${
                            seg.status === "error"
                              ? "border-red-300 dark:border-red-500/40 bg-red-50/50 dark:bg-red-950/20"
                              : "border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B]"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                                #{seg.index + 1}
                              </span>
                              {seg.cueLabel && (
                                <span className="rounded bg-amber-100 dark:bg-[#241E0E] px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-[#F2B705]">
                                  {seg.cueLabel}
                                </span>
                              )}
                              {seg.durationSeconds ? (
                                <span className="font-mono text-[11px] tabular-nums text-zinc-500">
                                  {formatAudioDuration(seg.durationSeconds)}
                                </span>
                              ) : null}
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {seg.status === "generating" || isRetryingThis ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-600 dark:text-[#F2B705]" />
                              ) : seg.wavBase64 ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (isPlayingThis) {
                                      stopPreviewAudio();
                                    } else {
                                      setPlayingSegmentId(seg.id);
                                      playBase64Wav(
                                        seg.wavBase64!,
                                        "audio/wav",
                                        () => setPlayingSegmentId(null)
                                      );
                                    }
                                  }}
                                  className="inline-flex h-7 items-center gap-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#16161A] px-2 text-[11px] font-medium text-zinc-700 dark:text-zinc-200 hover:border-[#F2B705]"
                                >
                                  {isPlayingThis ? (
                                    <>
                                      <Square className="h-2.5 w-2.5 fill-current" />
                                      Stop
                                    </>
                                  ) : (
                                    <>
                                      <Play className="h-2.5 w-2.5 fill-current" />
                                      Play
                                    </>
                                  )}
                                </button>
                              ) : null}

                              {!isSynthesizing && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    void handleRetrySegment(seg.id);
                                  }}
                                  disabled={Boolean(retryingSegmentId)}
                                  title="Re-synthesize this segment"
                                  className="inline-flex h-7 items-center gap-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#16161A] px-2 text-[11px] font-medium text-zinc-700 dark:text-zinc-200 hover:border-[#F2B705] disabled:opacity-40"
                                >
                                  <RefreshCw className="h-3 w-3" />
                                  {seg.status === "error" ? "Retry" : "Redo"}
                                </button>
                              )}
                            </div>
                          </div>

                          <p className="text-zinc-700 dark:text-zinc-300 line-clamp-2 leading-relaxed">
                            {seg.text}
                          </p>

                          {seg.errorMessage && (
                            <p className="flex items-center gap-1.5 text-[11px] text-red-600 dark:text-red-400">
                              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                              {seg.errorMessage}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        {/* RIGHT COLUMN (5 cols): Google TTS Voice Library + Google Flow Direction Controls */}
        <div className="space-y-6 xl:col-span-5 min-w-0">
          {/* Google TTS Voice Library with Playable Sample Voices */}
          <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] overflow-hidden">
            <div className="border-b border-zinc-200 dark:border-zinc-800 px-4 py-3.5 sm:px-5 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Google TTS Voices{" "}
                    <span className="font-mono text-xs font-normal text-zinc-500 dark:text-zinc-400 tabular-nums">
                      ({GOOGLE_TTS_VOICES.length})
                    </span>
                  </h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Listen to sample voices and select your narrator
                  </p>
                </div>

                {/* Selected Voice Quick Preview */}
                <button
                  type="button"
                  onClick={() => {
                    void handlePlayVoiceSample(selectedVoiceProfile);
                  }}
                  disabled={previewLoadingVoice === selectedVoiceProfile.name}
                  className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-[#F2B705]/70 bg-amber-50 dark:bg-[#1E1A0E] px-3 py-1.5 text-xs font-semibold text-amber-900 dark:text-[#F2B705] hover:bg-amber-100 dark:hover:bg-[#2a2310] transition-colors shrink-0"
                >
                  {previewLoadingVoice === selectedVoiceProfile.name ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : playingVoice === selectedVoiceProfile.name ? (
                    <Square className="h-3 w-3 fill-current" />
                  ) : (
                    <Play className="h-3 w-3 fill-current" />
                  )}
                  {selectedVoiceProfile.name}
                </button>
              </div>

              {/* Search + Gender Filter */}
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="text"
                    value={voiceSearch}
                    onChange={(e) => setVoiceSearch(e.target.value)}
                    placeholder={`Search all ${GOOGLE_TTS_VOICES.length} voices (e.g. Riko, Charon, Kore)...`}
                    className="h-9 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] pl-8 pr-3 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:border-[#F2B705] focus:outline-none"
                  />
                </div>

                <div
                  role="group"
                  aria-label="Filter voices by gender"
                  className="inline-flex rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] p-0.5 shrink-0"
                >
                  {(["All", "Male", "Female"] as const).map((g) => {
                    const active = genderFilter === g;
                    return (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setGenderFilter(g)}
                        className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                          active
                            ? "bg-zinc-900 dark:bg-zinc-800 text-white dark:text-zinc-100"
                            : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
                        }`}
                      >
                        {g}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Scrollable Voice Gallery */}
            <div className="max-h-[440px] overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800/80">
              {filteredVoices.length === 0 ? (
                <p className="px-5 py-8 text-center text-xs text-zinc-500">
                  No Google TTS voices match your search.
                </p>
              ) : (
                filteredVoices.map((voice) => {
                  const isSelected = workspace.voiceName === voice.name;
                  const isLoadingSample = previewLoadingVoice === voice.name;
                  const isPlayingSample = playingVoice === voice.name;

                  return (
                    <div
                      key={voice.name}
                      className={`flex items-center gap-3 px-4 py-3 sm:px-5 transition-colors ${
                        isSelected
                          ? "bg-amber-50/80 dark:bg-[#1B180E]"
                          : "hover:bg-zinc-50 dark:hover:bg-[#16161B]"
                      }`}
                    >
                      {/* Play / Stop Sample Voice Button */}
                      <button
                        type="button"
                        onClick={() => {
                          void handlePlayVoiceSample(voice);
                        }}
                        disabled={isLoadingSample}
                        aria-label={
                          isPlayingSample
                            ? `Stop ${voice.name} sample`
                            : `Listen to ${voice.name} sample`
                        }
                        title={
                          isPlayingSample
                            ? "Stop sample"
                            : `Listen to ${voice.name} sample`
                        }
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors ${
                          isPlayingSample
                            ? "border-[#F2B705] bg-[#F2B705] text-[#09090B]"
                            : "border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#18181B] text-zinc-700 dark:text-zinc-200 hover:border-[#F2B705] hover:text-amber-600 dark:hover:text-[#F2B705]"
                        }`}
                      >
                        {isLoadingSample ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : isPlayingSample ? (
                          <Square className="h-3 w-3 fill-current" />
                        ) : (
                          <Play className="h-3.5 w-3.5 fill-current ml-0.5" />
                        )}
                      </button>

                      {/* Clickable Voice Metadata to Select */}
                      <button
                        type="button"
                        onClick={() =>
                          setWorkspace((prev) => ({
                            ...prev,
                            voiceName: voice.name,
                          }))
                        }
                        disabled={isSynthesizing}
                        className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                              {voice.name}
                            </span>
                            <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                              {voice.gender}
                            </span>
                            <span
                              aria-hidden="true"
                              className="text-zinc-300 dark:text-zinc-700"
                            >
                              ·
                            </span>
                            <span className="text-[11px] text-zinc-600 dark:text-zinc-300 truncate">
                              {voice.tone}
                            </span>
                          </div>
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                            {voice.bestFor}
                          </p>
                        </div>

                        {isSelected && (
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#F2B705] text-[#09090B]">
                            <Check className="h-3 w-3 stroke-[3]" />
                          </span>
                        )}
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            <div className="border-t border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/70 dark:bg-[#0C0C0F] px-4 py-2 sm:px-5 text-[11px] font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
              Showing {filteredVoices.length} of {GOOGLE_TTS_VOICES.length} voices · Scroll or search to explore all
            </div>
          </section>

          {/* Google Flow Expressive Direction Controls */}
          <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] p-4 sm:p-5 space-y-5">
            <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-3">
              <Sliders className="h-4 w-4 text-amber-600 dark:text-[#F2B705]" />
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Narration Direction &amp; Delivery
              </h2>
            </div>

            {/* TTS Engine */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                Google TTS Engine
              </label>
              <div className="grid grid-cols-1 gap-2">
                {TTS_MODELS.map((m) => {
                  const active = workspace.model === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      disabled={isSynthesizing}
                      onClick={() =>
                        setWorkspace((prev) => ({ ...prev, model: m.id }))
                      }
                      className={`rounded-lg border px-3.5 py-2.5 text-left transition-colors ${
                        active
                          ? "border-[#F2B705] bg-amber-50/70 dark:bg-[#1B180E]"
                          : "border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-[#09090B] hover:border-zinc-400 dark:hover:border-zinc-600"
                      }`}
                    >
                      <span className="block text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                        {m.label}
                      </span>
                      <span className="block text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                        {m.description}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Emotion & Vocal Style */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                Emotion &amp; Vocal Style
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {NARRATION_EMOTION_OPTIONS.map((opt) => {
                  const active = workspace.emotion === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={isSynthesizing}
                      onClick={() =>
                        setWorkspace((prev) => ({ ...prev, emotion: opt.id }))
                      }
                      className={`min-h-[38px] rounded-lg border px-2.5 py-1.5 text-xs font-medium text-left transition-colors ${
                        active
                          ? "border-[#F2B705] bg-amber-50 dark:bg-[#1E1A0E] text-amber-900 dark:text-[#F2B705]"
                          : "border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-[#09090B] text-zinc-700 dark:text-zinc-300 hover:border-zinc-400 dark:hover:border-zinc-600"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Narration Phase / Pace */}
            <div className="space-y-2">
              <label
                htmlFor="narration-pace-select"
                className="block text-xs font-semibold text-zinc-800 dark:text-zinc-200"
              >
                Narration Phase / Pace
              </label>
              <select
                id="narration-pace-select"
                value={workspace.pace}
                disabled={isSynthesizing}
                onChange={(e) =>
                  setWorkspace((prev) => ({
                    ...prev,
                    pace: e.target.value as NarrationWorkspaceState["pace"],
                  }))
                }
                className="h-10 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#09090B] px-3 text-xs font-medium text-zinc-900 dark:text-zinc-100 focus:border-[#F2B705] focus:outline-none"
              >
                {NARRATION_PACE_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label} ({opt.hint})
                  </option>
                ))}
              </select>
            </div>

            {/* Punctuation & Pause Cadence */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                Punctuation &amp; Pause Behavior
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {NARRATION_PUNCTUATION_OPTIONS.map((opt) => {
                  const active = workspace.punctuationMode === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={isSynthesizing}
                      onClick={() =>
                        setWorkspace((prev) => ({
                          ...prev,
                          punctuationMode: opt.id,
                        }))
                      }
                      className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                        active
                          ? "border-[#F2B705] bg-amber-50/70 dark:bg-[#1B180E]"
                          : "border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-[#09090B] hover:border-zinc-400 dark:hover:border-zinc-600"
                      }`}
                    >
                      <span className="block text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                        {opt.label}
                      </span>
                      <span className="block text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-snug">
                        {opt.description}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom Flow Voice Direction */}
            <div className="space-y-1.5">
              <label
                htmlFor="narration-custom-direction"
                className="block text-xs font-semibold text-zinc-800 dark:text-zinc-200"
              >
                Custom Voice Direction (Optional)
              </label>
              <textarea
                id="narration-custom-direction"
                value={workspace.customDirection}
                disabled={isSynthesizing}
                onChange={(e) =>
                  setWorkspace((prev) => ({
                    ...prev,
                    customDirection: e.target.value,
                  }))
                }
                rows={2}
                placeholder="e.g., Speak like a weary survivor recording a late-night audio log; drop to a quiet whisper before reveals..."
                className="w-full resize-none rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] p-3 text-xs leading-relaxed text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:border-[#F2B705] focus:outline-none"
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
