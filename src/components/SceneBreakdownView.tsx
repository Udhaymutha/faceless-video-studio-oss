import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  FileDown,
  FileText,
  Film,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  Plus,
  RefreshCw,
  RotateCcw,
  Scissors,
  Search,
  Sparkles,
  Square,
  Trash2,
  Upload,
  UserCheck,
  UserX,
  Users,
  X,
} from "lucide-react";
import {
  computeCoverageCheck,
  createInitialSceneBreakdownState,
  DEFAULT_MODULE_1_BEAT_PROMPT,
  DEFAULT_MODULE_2_VISUAL_PROMPT,
} from "../data/sceneBreakdownPrompts";
import type {
  BeatLine,
  BreakdownScenePrompt,
  CharacterSheetAttachment,
  SceneBreakdownWorkspaceState,
} from "../types/sceneBreakdown";
import type { ScriptWriterWorkspaceState } from "../types/scriptWriter";
import type { ToastMessage } from "../types/studio";
import {
  loadReferenceDirectoryLocal,
  loadSceneBreakdownState,
  loadScriptWriterState,
  saveSceneBreakdownState,
} from "../utils/batchCache";
import type { ParsedSceneDraft } from "../utils/promptParser";

interface SceneBreakdownViewProps {
  onNotify: (text: string, tone?: ToastMessage["tone"]) => void;
  onSendToStoryboard: (drafts: ParsedSceneDraft[]) => void;
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

type PromptFilterMode =
  | "all"
  | "with_video"
  | "image_only"
  | "char_present"
  | "char_absent";

const INTERNAL_PROMPT_BATCH_SIZE = 20;

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

  options.sort((a, b) => {
    if (a.isActiveProject !== b.isActiveProject) {
      return a.isActiveProject ? -1 : 1;
    }
    return b.updatedAt - a.updatedAt;
  });

  return options;
}

function formatDurationShort(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatFileSizeShort(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const MAX_CHARACTER_SHEET_BYTES = 15 * 1024 * 1024; // 15 MB

export function SceneBreakdownView({
  onNotify,
  onSendToStoryboard,
}: SceneBreakdownViewProps) {
  const [workspace, setWorkspace] = useState<SceneBreakdownWorkspaceState>(
    createInitialSceneBreakdownState
  );
  const [isHydrated, setIsHydrated] = useState(false);

  // Importable episodes from Script Writer
  const [availableEpisodes, setAvailableEpisodes] = useState<
    ImportableEpisodeOption[]
  >([]);
  const [selectedImportKey, setSelectedImportKey] = useState<string>("");

  // Pipeline running state
  const [isBreakingBeats, setIsBreakingBeats] = useState(false);
  const [isGeneratingPrompts, setIsGeneratingPrompts] = useState(false);
  const [promptProgress, setPromptProgress] = useState<{
    completed: number;
    total: number;
    activeRangeLabel: string;
  }>({ completed: 0, total: 0, activeRangeLabel: "" });
  const [regeneratingSceneNum, setRegeneratingSceneNum] = useState<
    number | null
  >(null);

  // UI visibility & filters
  const [showBeatsList, setShowBeatsList] = useState(true);
  const [filterMode, setFilterMode] = useState<PromptFilterMode>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<"module1" | "module2">("module1");
  const [isDraggingSheet, setIsDraggingSheet] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const scriptFileInputRef = useRef<HTMLInputElement | null>(null);
  const characterSheetInputRef = useRef<HTMLInputElement | null>(null);

  const isBusy = isBreakingBeats || isGeneratingPrompts;

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // Hydrate Scene Breakdown workspace + available Script Writer episodes on mount
  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      try {
        const [savedBreakdown, savedSw, savedRef] = await Promise.all([
          loadSceneBreakdownState().catch(() => null),
          loadScriptWriterState().catch(() => null),
          loadReferenceDirectoryLocal().catch(() => null),
        ]);

        if (cancelled) return;

        const base = createInitialSceneBreakdownState();
        if (savedBreakdown) {
          const merged: SceneBreakdownWorkspaceState = {
            ...base,
            ...savedBreakdown,
            promptConfig: {
              module1BeatPrompt:
                savedBreakdown.promptConfig?.module1BeatPrompt?.trim() ||
                DEFAULT_MODULE_1_BEAT_PROMPT,
              module2VisualPrompt:
                savedBreakdown.promptConfig?.module2VisualPrompt?.trim() ||
                DEFAULT_MODULE_2_VISUAL_PROMPT,
            },
          };
          setWorkspace(merged);
          if (merged.scenePrompts.length > 0) {
            setShowBeatsList(false);
          }
        } else if (savedRef) {
          const autoSheet = [
            savedRef.characterName
              ? `Main Reference Character: ${savedRef.characterName}`
              : "Main Reference Character: Master Stickman",
            savedRef.characterNotes?.trim() || "",
          ]
            .filter(Boolean)
            .join("\n");

          const autoFile: CharacterSheetAttachment | null =
            savedRef.data && savedRef.mimeType
              ? {
                  name:
                    savedRef.name ||
                    `${savedRef.characterName || "master-stickman"}.png`,
                  mimeType: savedRef.mimeType,
                  size: Math.round((savedRef.data.length * 3) / 4),
                  kind: "image",
                  data: savedRef.data,
                  previewUrl:
                    savedRef.previewUrl ||
                    `data:${savedRef.mimeType};base64,${savedRef.data}`,
                }
              : null;

          if (autoSheet || autoFile) {
            setWorkspace((prev) => ({
              ...prev,
              characterSheet: autoSheet,
              characterSheetFile: autoFile,
            }));
          }
        }

        const eps = collectImportableEpisodes(savedSw);
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
  }, []);

  // Auto-persist workspace state to IndexedDB
  useEffect(() => {
    if (!isHydrated) return;
    const timer = window.setTimeout(() => {
      void saveSceneBreakdownState({
        ...workspace,
        updatedAt: Date.now(),
      }).catch(() => undefined);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [isHydrated, workspace]);

  const copyTextWithFeedback = async (text: string, key: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      onNotify(`Copied ${label}`, "success");
      window.setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev));
      }, 1800);
    } catch {
      onNotify("Clipboard copy failed in this browser.", "error");
    }
  };

  // Import script directly from Script Writer
  const handleImportFromScriptWriter = async () => {
    try {
      const swState = await loadScriptWriterState();
      const episodes = collectImportableEpisodes(swState);
      setAvailableEpisodes(episodes);

      if (episodes.length === 0) {
        onNotify(
          "No generated script found in Script Writer yet. Generate an episode first or paste your script below.",
          "error"
        );
        return;
      }

      const chosen =
        episodes.find((ep) => ep.key === selectedImportKey) ?? episodes[0];
      setSelectedImportKey(chosen.key);

      setWorkspace((prev) => ({
        ...prev,
        scriptText: chosen.scriptText,
        sourceTitle: chosen.projectTitle,
        sourceEpisodeCode: `${chosen.episodeCode} · ${chosen.episodeTitle}`,
        beats: [],
        coverageCheck: null,
        scenePrompts: [],
        updatedAt: Date.now(),
      }));
      setShowBeatsList(true);
      onNotify(
        `Imported ${chosen.episodeCode} (${chosen.wordCount.toLocaleString()} words) from Script Writer`,
        "success"
      );
    } catch {
      onNotify("Could not load Script Writer scripts.", "error");
    }
  };

  // Attach Character Sheet file (image, PDF, or text)
  const handleAttachCharacterSheetFile = (file: File | null) => {
    if (!file) return;

    if (file.size > MAX_CHARACTER_SHEET_BYTES) {
      onNotify("Character Sheet file must be 15 MB or smaller.", "error");
      return;
    }

    const lowerName = file.name.toLowerCase();
    const mime = (file.type || "").toLowerCase();
    const isImage =
      mime.startsWith("image/") ||
      /\.(png|jpe?g|webp|gif)$/.test(lowerName);
    const isPdf = mime === "application/pdf" || lowerName.endsWith(".pdf");
    const isText =
      mime.startsWith("text/") ||
      mime === "application/json" ||
      /\.(txt|md|json)$/.test(lowerName);

    if (!isImage && !isPdf && !isText) {
      onNotify(
        "Unsupported file format. Attach a PNG, JPG, WEBP, PDF, TXT, MD, or JSON Character Sheet.",
        "error"
      );
      return;
    }

    const reader = new FileReader();

    if (isText) {
      reader.onload = () => {
        const text = typeof reader.result === "string" ? reader.result.trim() : "";
        if (!text) {
          onNotify("Attached text file is empty.", "error");
          return;
        }
        const attachment: CharacterSheetAttachment = {
          name: file.name,
          mimeType: mime || "text/plain",
          size: file.size,
          kind: "text",
          textContent: text,
        };
        setWorkspace((prev) => ({
          ...prev,
          characterSheet: text,
          characterSheetFile: attachment,
          updatedAt: Date.now(),
        }));
        onNotify(`Attached Character Sheet: ${file.name}`, "success");
      };
      reader.onerror = () => {
        onNotify("Could not read the attached text file.", "error");
      };
      reader.readAsText(file);
      return;
    }

    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      const commaIdx = dataUrl.indexOf(",");
      if (!dataUrl || commaIdx === -1) {
        onNotify("Could not read the attached file.", "error");
        return;
      }
      const base64Data = dataUrl.slice(commaIdx + 1);
      const resolvedMime =
        isPdf
          ? "application/pdf"
          : mime ||
            (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")
              ? "image/jpeg"
              : lowerName.endsWith(".webp")
                ? "image/webp"
                : lowerName.endsWith(".gif")
                  ? "image/gif"
                  : "image/png");

      const attachment: CharacterSheetAttachment = {
        name: file.name,
        mimeType: resolvedMime,
        size: file.size,
        kind: isPdf ? "pdf" : "image",
        data: base64Data,
        previewUrl: isImage ? dataUrl : undefined,
      };

      setWorkspace((prev) => ({
        ...prev,
        characterSheetFile: attachment,
        updatedAt: Date.now(),
      }));
      onNotify(`Attached Character Sheet: ${file.name}`, "success");
    };
    reader.onerror = () => {
      onNotify("Could not read the attached Character Sheet file.", "error");
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveCharacterSheetFile = () => {
    setWorkspace((prev) => ({
      ...prev,
      characterSheet:
        prev.characterSheetFile?.kind === "text" ? "" : prev.characterSheet,
      characterSheetFile: null,
      updatedAt: Date.now(),
    }));
  };

  // Pull Character Sheet automatically from Master Stickman Reference Directory + Script Writer cast
  const handlePullCharacterSheet = async () => {
    try {
      const [savedRef, savedSw] = await Promise.all([
        loadReferenceDirectoryLocal().catch(() => null),
        loadScriptWriterState().catch(() => null),
      ]);

      const sections: string[] = [];

      if (savedRef) {
        sections.push(
          [
            `MASTER REFERENCE CHARACTER: ${savedRef.characterName || "Master Stickman"}`,
            savedRef.characterNotes?.trim()
              ? savedRef.characterNotes.trim()
              : "Minimalist 2D stickman character matching the Master Stickman Character Reference image (very large rounded head, expressive face, small torso, thin black stick arms and legs, rounded black mitten hands, tiny rounded black feet).",
          ].join("\n")
        );
      }

      const activeProject =
        savedSw?.projects?.find((p) => p.id === savedSw.activeProjectId) ??
        savedSw?.projects?.[0];

      if (activeProject && activeProject.characters.length > 0) {
        const castLines = activeProject.characters.map(
          (c) => `- ${c.name} (${c.role}): ${c.status}`
        );
        sections.push(`STORY CAST (${activeProject.title}):\n${castLines.join("\n")}`);
      }

      const combinedNotes = sections.join("\n\n");
      let attachment: CharacterSheetAttachment | null = null;

      if (savedRef?.data && savedRef?.mimeType) {
        attachment = {
          name:
            savedRef.name ||
            `${savedRef.characterName || "master-stickman"}-reference.png`,
          mimeType: savedRef.mimeType,
          size: Math.round((savedRef.data.length * 3) / 4),
          kind: "image",
          data: savedRef.data,
          previewUrl:
            savedRef.previewUrl ||
            `data:${savedRef.mimeType};base64,${savedRef.data}`,
        };
      } else if (combinedNotes) {
        attachment = {
          name: `${(activeProject?.title || "studio-characters")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "") || "studio-characters"}-sheet.txt`,
          mimeType: "text/plain",
          size: new Blob([combinedNotes]).size,
          kind: "text",
          textContent: combinedNotes,
        };
      }

      if (!attachment && !combinedNotes) {
        onNotify(
          "No saved reference character or Script Writer cast found. Attach a Character Sheet file directly.",
          "neutral"
        );
        return;
      }

      setWorkspace((prev) => ({
        ...prev,
        characterSheet: combinedNotes,
        characterSheetFile: attachment,
        updatedAt: Date.now(),
      }));
      onNotify("Attached character sheet from studio reference & cast", "success");
    } catch {
      onNotify("Could not read saved character details.", "error");
    }
  };

  const buildCharacterSheetRequestFields = () => {
    const file = workspace.characterSheetFile ?? null;
    const characterSheetText =
      file?.kind === "text" && file.textContent
        ? file.textContent
        : workspace.characterSheet;
    const characterSheetAttachment =
      file && (file.kind === "image" || file.kind === "pdf") && file.data
        ? {
            name: file.name,
            mimeType: file.mimeType,
            data: file.data,
          }
        : null;
    return {
      characterSheet: characterSheetText,
      characterSheetAttachment,
    };
  };

  const handleUploadScriptFile = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      if (!text.trim()) {
        onNotify("Uploaded file is empty.", "error");
        return;
      }
      setWorkspace((prev) => ({
        ...prev,
        scriptText: text.trim(),
        sourceTitle: file.name,
        sourceEpisodeCode: "Uploaded Script",
        beats: [],
        coverageCheck: null,
        scenePrompts: [],
        updatedAt: Date.now(),
      }));
      setShowBeatsList(true);
      onNotify(`Loaded script from ${file.name}`, "success");
    };
    reader.readAsText(file);
  };

  // STEP 1: Break Script into Verbatim Visual Beat Lines (Module 1)
  const runBeatBreakdown = async (
    signal?: AbortSignal
  ): Promise<BeatLine[] | null> => {
    const trimmed = workspace.scriptText.trim();
    if (!trimmed) {
      onNotify(
        "Paste a script or import one from Script Writer before running Scene Breakdown.",
        "error"
      );
      return null;
    }

    setIsBreakingBeats(true);
    try {
      const res = await fetch("/api/scene-breakdown/beats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({
          scriptText: trimmed,
          wpm: workspace.wpm,
          module1Prompt: workspace.promptConfig.module1BeatPrompt,
        }),
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload?.error || "Scene beat breakdown failed.");
      }

      const beats: BeatLine[] = Array.isArray(payload.beats)
        ? payload.beats.map((b: { sceneNumber?: number; text?: string }, i: number) => ({
            sceneNumber: i + 1,
            text: String(b?.text ?? "").trim(),
          })).filter((b: BeatLine) => b.text.length > 0)
        : [];

      if (beats.length === 0) {
        throw new Error("No scene beat lines were produced. Please retry.");
      }

      const coverage = computeCoverageCheck(trimmed, beats, workspace.wpm);

      setWorkspace((prev) => ({
        ...prev,
        beats,
        coverageCheck: coverage,
        scenePrompts: [],
        updatedAt: Date.now(),
      }));
      setShowBeatsList(true);

      onNotify(
        `Script split into ${beats.length} scenes (${coverage.exactCoverageMatch ? "100% verbatim coverage" : "check coverage notes"})`,
        "success"
      );
      return beats;
    } catch (err) {
      if (signal?.aborted) {
        onNotify("Scene breakdown cancelled.", "neutral");
        return null;
      }
      onNotify(
        err instanceof Error ? err.message : "Failed to break script into scenes.",
        "error"
      );
      return null;
    } finally {
      setIsBreakingBeats(false);
    }
  };

  // STEP 2: Automatically generate Image & Video Prompts for ALL scenes (no manual 20-scene stop!)
  const runAllPromptsGeneration = async (
    overrideBeats?: BeatLine[],
    existingController?: AbortController
  ) => {
    const activeBeats = overrideBeats ?? workspace.beats;
    if (activeBeats.length === 0) {
      onNotify("Break the script into scenes first (Step 1).", "error");
      return;
    }

    const controller = existingController ?? new AbortController();
    abortControllerRef.current = controller;
    setIsGeneratingPrompts(true);

    // Initialize full scene prompt scaffold immediately so user sees all scene slots filling live
    const working: BreakdownScenePrompt[] = activeBeats.map((beat) => ({
      sceneNumber: beat.sceneNumber,
      narrationCovered: beat.text,
      characterPresent: false,
      imagePrompt: "",
      videoPrompt: "",
      status: "idle",
    }));

    setWorkspace((prev) => ({
      ...prev,
      scenePrompts: [...working],
    }));

    const total = activeBeats.length;
    let completedCount = 0;
    let failedCount = 0;
    let totalVideoPrompts = 0;

    setPromptProgress({
      completed: 0,
      total,
      activeRangeLabel: `Scenes 1–${Math.min(INTERNAL_PROMPT_BATCH_SIZE, total)}`,
    });

    try {
      for (let start = 0; start < total; start += INTERNAL_PROMPT_BATCH_SIZE) {
        if (controller.signal.aborted) break;

        const end = Math.min(start + INTERNAL_PROMPT_BATCH_SIZE, total);
        const batchBeats = activeBeats.slice(start, end);
        const rangeLabel = `Scenes ${start + 1}–${end}`;

        setPromptProgress({
          completed: completedCount,
          total,
          activeRangeLabel: rangeLabel,
        });

        for (let idx = start; idx < end; idx++) {
          working[idx] = { ...working[idx], status: "generating", errorMessage: undefined };
        }
        setWorkspace((prev) => ({ ...prev, scenePrompts: [...working] }));

        // Pass last 3 completed scenes for Visual Bible continuity & anti-repetition check
        const previousScenesContext = working
          .slice(Math.max(0, start - 3), start)
          .filter((s) => s.status === "completed" && s.imagePrompt)
          .map((s) => ({
            sceneNumber: s.sceneNumber,
            narrationCovered: s.narrationCovered,
            characterPresent: s.characterPresent,
            imagePrompt: s.imagePrompt,
          }));

        try {
          const charFields = buildCharacterSheetRequestFields();
          const res = await fetch("/api/scene-breakdown/prompts-batch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              fullScript: workspace.scriptText,
              ...charFields,
              beatsBatch: batchBeats,
              previousScenesContext,
              module2Prompt: workspace.promptConfig.module2VisualPrompt,
              maxVideoPrompts: 2,
            }),
          });

          const payload = await res.json();
          if (!res.ok) {
            throw new Error(
              payload?.error || `Failed generating prompts for ${rangeLabel}.`
            );
          }

          const returnedScenes = Array.isArray(payload.scenes)
            ? payload.scenes
            : [];

          for (let offset = 0; offset < batchBeats.length; offset++) {
            const globalIdx = start + offset;
            const beat = batchBeats[offset];
            const item =
              returnedScenes.find(
                (r: { sceneNumber?: number }) =>
                  r?.sceneNumber === beat.sceneNumber
              ) ?? returnedScenes[offset];

            if (item && typeof item.imagePrompt === "string" && item.imagePrompt.trim()) {
              const vid =
                typeof item.videoPrompt === "string"
                  ? item.videoPrompt.trim()
                  : "";
              if (vid) totalVideoPrompts += 1;
              working[globalIdx] = {
                sceneNumber: beat.sceneNumber,
                narrationCovered: beat.text,
                characterPresent: Boolean(item.characterPresent),
                imagePrompt: item.imagePrompt.trim(),
                videoPrompt: vid,
                status: "completed",
                errorMessage: undefined,
              };
              completedCount += 1;
            } else {
              working[globalIdx] = {
                ...working[globalIdx],
                status: "error",
                errorMessage: "No image prompt returned for this scene.",
              };
              failedCount += 1;
            }
          }
        } catch (err) {
          if (controller.signal.aborted) {
            for (let idx = start; idx < end; idx++) {
              if (working[idx].status === "generating") {
                working[idx] = { ...working[idx], status: "idle" };
              }
            }
            break;
          }
          const msg =
            err instanceof Error ? err.message : "Batch prompt generation failed.";
          for (let idx = start; idx < end; idx++) {
            working[idx] = {
              ...working[idx],
              status: "error",
              errorMessage: msg,
            };
            failedCount += 1;
          }
        }

        setWorkspace((prev) => ({
          ...prev,
          scenePrompts: [...working],
          updatedAt: Date.now(),
        }));
        setPromptProgress({
          completed: completedCount + failedCount,
          total,
          activeRangeLabel: rangeLabel,
        });
      }

      if (controller.signal.aborted) {
        onNotify(
          `Stopped prompt generation (${completedCount} of ${total} scenes ready).`,
          "neutral"
        );
      } else if (failedCount > 0) {
        onNotify(
          `Generated ${completedCount} of ${total} scenes (${failedCount} failed — you can retry individual scenes below).`,
          "error"
        );
      } else {
        setShowBeatsList(false);
        onNotify(
          `All ${completedCount} image prompts & ${totalVideoPrompts} video prompts generated!`,
          "success"
        );
      }
    } finally {
      abortControllerRef.current = null;
      setIsGeneratingPrompts(false);
    }
  };

  // Single-click full pipeline: Step 1 (Beat Breakdown) + Step 2 (All Image & Video Prompts)
  const handleRunFullPipeline = async () => {
    if (isBusy) return;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const beats = await runBeatBreakdown(controller.signal);
    if (!beats || controller.signal.aborted) {
      abortControllerRef.current = null;
      return;
    }

    await runAllPromptsGeneration(beats, controller);
  };

  const handleStopPipeline = () => {
    abortControllerRef.current?.abort();
  };

  // Regenerate a single scene's Image & Video prompt
  const handleRegenerateSingleScene = async (sceneNumber: number) => {
    if (isBusy || regeneratingSceneNum !== null) return;
    const idx = workspace.scenePrompts.findIndex(
      (s) => s.sceneNumber === sceneNumber
    );
    if (idx === -1) return;

    const target = workspace.scenePrompts[idx];
    setRegeneratingSceneNum(sceneNumber);

    setWorkspace((prev) => ({
      ...prev,
      scenePrompts: prev.scenePrompts.map((s) =>
        s.sceneNumber === sceneNumber
          ? { ...s, status: "generating", errorMessage: undefined }
          : s
      ),
    }));

    const previousScenesContext = workspace.scenePrompts
      .slice(Math.max(0, idx - 2), idx)
      .filter((s) => s.status === "completed" && s.imagePrompt)
      .map((s) => ({
        sceneNumber: s.sceneNumber,
        narrationCovered: s.narrationCovered,
        characterPresent: s.characterPresent,
        imagePrompt: s.imagePrompt,
      }));

    try {
      const charFields = buildCharacterSheetRequestFields();
      const res = await fetch("/api/scene-breakdown/prompts-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullScript: workspace.scriptText,
          ...charFields,
          beatsBatch: [{ sceneNumber: target.sceneNumber, text: target.narrationCovered }],
          previousScenesContext,
          module2Prompt: workspace.promptConfig.module2VisualPrompt,
          maxVideoPrompts: 1,
        }),
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload?.error || "Scene prompt regeneration failed.");
      }

      const item = Array.isArray(payload.scenes) ? payload.scenes[0] : null;
      if (!item?.imagePrompt) {
        throw new Error("No image prompt returned for this scene.");
      }

      setWorkspace((prev) => ({
        ...prev,
        scenePrompts: prev.scenePrompts.map((s) =>
          s.sceneNumber === sceneNumber
            ? {
                ...s,
                characterPresent: Boolean(item.characterPresent),
                imagePrompt: String(item.imagePrompt).trim(),
                videoPrompt: String(item.videoPrompt ?? "").trim(),
                status: "completed",
                errorMessage: undefined,
              }
            : s
        ),
        updatedAt: Date.now(),
      }));
      onNotify(`Scene ${sceneNumber} prompt regenerated`, "success");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to regenerate scene.";
      setWorkspace((prev) => ({
        ...prev,
        scenePrompts: prev.scenePrompts.map((s) =>
          s.sceneNumber === sceneNumber
            ? { ...s, status: "error", errorMessage: msg }
            : s
        ),
      }));
      onNotify(msg, "error");
    } finally {
      setRegeneratingSceneNum(null);
    }
  };

  // Beat line inline editing (Stage 4 review capability)
  const handleUpdateBeatLine = (sceneNumber: number, newText: string) => {
    setWorkspace((prev) => {
      const nextBeats = prev.beats.map((b) =>
        b.sceneNumber === sceneNumber ? { ...b, text: newText } : b
      );
      return {
        ...prev,
        beats: nextBeats,
        coverageCheck: computeCoverageCheck(prev.scriptText, nextBeats, prev.wpm),
        updatedAt: Date.now(),
      };
    });
  };

  const handleDeleteBeatLine = (sceneNumber: number) => {
    setWorkspace((prev) => {
      const nextBeats = prev.beats
        .filter((b) => b.sceneNumber !== sceneNumber)
        .map((b, i) => ({ ...b, sceneNumber: i + 1 }));
      return {
        ...prev,
        beats: nextBeats,
        coverageCheck: computeCoverageCheck(prev.scriptText, nextBeats, prev.wpm),
        updatedAt: Date.now(),
      };
    });
  };

  const handleAddBeatLine = () => {
    setWorkspace((prev) => {
      const nextBeats: BeatLine[] = [
        ...prev.beats,
        { sceneNumber: prev.beats.length + 1, text: "" },
      ];
      return {
        ...prev,
        beats: nextBeats,
        coverageCheck: computeCoverageCheck(prev.scriptText, nextBeats, prev.wpm),
        updatedAt: Date.now(),
      };
    });
  };

  // Export all extracted Image Prompts directly into FrameForge Storyboard batches
  const handlePushToStoryboard = () => {
    const readyScenes = workspace.scenePrompts.filter(
      (s) => s.status === "completed" && s.imagePrompt.trim().length > 0
    );
    if (readyScenes.length === 0) {
      onNotify("Generate image prompts first before sending to Storyboard.", "error");
      return;
    }

    const drafts: ParsedSceneDraft[] = readyScenes.map((s) => ({
      prompt: s.imagePrompt.trim(),
      narration: s.narrationCovered.trim(),
      useReferenceCharacter: s.characterPresent,
    }));
    onSendToStoryboard(drafts);
  };

  // Derived metrics & filters
  const scriptWordCount = useMemo(
    () => workspace.scriptText.trim().split(/\s+/).filter(Boolean).length,
    [workspace.scriptText]
  );

  const estScriptSeconds = useMemo(
    () =>
      scriptWordCount > 0
        ? Math.round((scriptWordCount / (workspace.wpm || 150)) * 60)
        : 0,
    [scriptWordCount, workspace.wpm]
  );

  const promptStats = useMemo(() => {
    let completed = 0;
    let withVideo = 0;
    let imageOnly = 0;
    let charPresent = 0;
    let charAbsent = 0;
    let failed = 0;

    for (const s of workspace.scenePrompts) {
      if (s.status === "completed") {
        completed += 1;
        if (s.videoPrompt.trim()) withVideo += 1;
        else imageOnly += 1;
        if (s.characterPresent) charPresent += 1;
        else charAbsent += 1;
      } else if (s.status === "error") {
        failed += 1;
      }
    }

    return {
      total: workspace.scenePrompts.length,
      completed,
      withVideo,
      imageOnly,
      charPresent,
      charAbsent,
      failed,
    };
  }, [workspace.scenePrompts]);

  const filteredScenePrompts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return workspace.scenePrompts.filter((s) => {
      if (filterMode === "with_video" && !s.videoPrompt.trim()) return false;
      if (filterMode === "image_only" && Boolean(s.videoPrompt.trim()))
        return false;
      if (filterMode === "char_present" && !s.characterPresent) return false;
      if (filterMode === "char_absent" && s.characterPresent) return false;
      if (!q) return true;
      return (
        String(s.sceneNumber).includes(q) ||
        s.narrationCovered.toLowerCase().includes(q) ||
        s.imagePrompt.toLowerCase().includes(q) ||
        s.videoPrompt.toLowerCase().includes(q)
      );
    });
  }, [workspace.scenePrompts, filterMode, searchQuery]);

  const progressPercent =
    promptProgress.total > 0
      ? Math.round((promptProgress.completed / promptProgress.total) * 100)
      : 0;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Scene Breakdown
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Break any script into verbatim visual beat scenes and automatically
            generate all scene-adaptive Image Prompts and selective Video Prompts
            in one continuous run.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
          {availableEpisodes.length > 1 && (
            <select
              aria-label="Choose Script Writer episode to import"
              value={selectedImportKey}
              onChange={(e) => setSelectedImportKey(e.target.value)}
              disabled={isBusy}
              className="min-h-[40px] w-full sm:w-60 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#111114] px-3 py-2 text-xs font-medium text-zinc-800 dark:text-zinc-200 focus:border-[#F2B705] focus:outline-none"
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
            disabled={isBusy}
            className="inline-flex min-h-[40px] flex-1 sm:flex-none items-center justify-center gap-2 rounded-lg border border-[#F2B705]/70 bg-amber-50 dark:bg-[#1E1A0E] px-3.5 py-2 text-xs font-semibold text-amber-900 dark:text-[#F2B705] hover:bg-amber-100 dark:hover:bg-[#2a2310] disabled:opacity-45 transition-colors whitespace-nowrap"
          >
            <FileDown className="h-4 w-4 shrink-0" />
            Import from Script Writer
          </button>

          <button
            type="button"
            onClick={() => setIsPromptModalOpen(true)}
            className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#18181B] px-3.5 py-2 text-xs font-semibold text-zinc-800 dark:text-zinc-200 hover:border-zinc-400 dark:hover:border-zinc-500 transition-colors whitespace-nowrap"
          >
            <BookOpen className="h-4 w-4 shrink-0" />
            Prompt Rules
          </button>
        </div>
      </div>

      {/* Input Row: Script Input (7 cols) + Character Sheet (5 cols) */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 items-stretch">
        {/* Script Input Card */}
        <section className="lg:col-span-7 flex flex-col rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 dark:border-zinc-800 px-4 py-3.5 sm:px-5">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                1. Story Script Input
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                {workspace.sourceEpisodeCode
                  ? `Source: ${workspace.sourceTitle ? `${workspace.sourceTitle} — ` : ""}${workspace.sourceEpisodeCode}`
                  : "Paste your complete narration script or attach a .txt file"}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 text-xs">
              <label className="inline-flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
                <span>WPM</span>
                <input
                  type="number"
                  min={80}
                  max={240}
                  value={workspace.wpm}
                  disabled={isBusy}
                  onChange={(e) => {
                    const v = Number(e.target.value) || 150;
                    setWorkspace((prev) => ({ ...prev, wpm: v }));
                  }}
                  className="h-7 w-16 rounded border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#09090B] px-2 font-mono text-xs text-zinc-900 dark:text-zinc-100 tabular-nums focus:border-[#F2B705] focus:outline-none"
                />
              </label>

              <input
                ref={scriptFileInputRef}
                type="file"
                accept=".txt,.md"
                className="hidden"
                onChange={(e) => {
                  handleUploadScriptFile(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => scriptFileInputRef.current?.click()}
                disabled={isBusy}
                className="inline-flex h-7 items-center gap-1 rounded border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#18181B] px-2.5 text-[11px] font-medium text-zinc-700 dark:text-zinc-300 hover:border-[#F2B705]"
              >
                <Upload className="h-3 w-3" />
                Attach .txt
              </button>

              {workspace.scriptText.trim().length > 0 && (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() =>
                    setWorkspace((prev) => ({
                      ...prev,
                      scriptText: "",
                      sourceTitle: "",
                      sourceEpisodeCode: "",
                      beats: [],
                      coverageCheck: null,
                      scenePrompts: [],
                    }))
                  }
                  className="inline-flex h-7 items-center gap-1 text-[11px] text-zinc-500 hover:text-red-600 dark:hover:text-red-400"
                >
                  <Trash2 className="h-3 w-3" />
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 p-4 sm:p-5 flex flex-col gap-2.5">
            <textarea
              value={workspace.scriptText}
              disabled={isBusy}
              onChange={(e) =>
                setWorkspace((prev) => ({
                  ...prev,
                  scriptText: e.target.value,
                }))
              }
              placeholder="Paste your narration script here (verbatim text is preserved 100% when breaking into visual scenes)..."
              className="min-h-[220px] flex-1 w-full resize-y rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] p-3.5 text-sm leading-relaxed text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:border-[#F2B705] focus:outline-none focus:ring-2 focus:ring-[#F2B705]/25 disabled:opacity-60"
            />
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
              <span>
                {scriptWordCount.toLocaleString()} words · Est.{" "}
                {formatDurationShort(estScriptSeconds)} at {workspace.wpm} WPM
              </span>
              <span>
                Est. ~{Math.max(0, Math.round(scriptWordCount / 5))} visual beats
              </span>
            </div>
          </div>
        </section>

        {/* Character Sheet Card (File Attachment) */}
        <section className="lg:col-span-5 flex flex-col rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 dark:border-zinc-800 px-4 py-3.5 sm:px-5">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                2. Character Sheet (Reference)
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Attach a character reference sheet for character-present scenes
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                void handlePullCharacterSheet();
              }}
              disabled={isBusy}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#18181B] px-2.5 text-[11px] font-semibold text-zinc-700 dark:text-zinc-200 hover:border-[#F2B705] hover:text-amber-700 dark:hover:text-[#F2B705] transition-colors whitespace-nowrap"
            >
              <Users className="h-3.5 w-3.5" />
              Pull Studio Characters
            </button>
          </div>

          <div className="flex-1 p-4 sm:p-5 flex flex-col gap-3">
            <input
              ref={characterSheetInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,.pdf,.txt,.md,.json"
              className="hidden"
              onChange={(e) => {
                handleAttachCharacterSheetFile(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />

            {workspace.characterSheetFile ? (
              <div className="flex-1 flex flex-col justify-between gap-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] p-3.5">
                {workspace.characterSheetFile.kind === "image" &&
                workspace.characterSheetFile.previewUrl ? (
                  <div className="relative flex items-center justify-center overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] p-2 h-44">
                    <img
                      src={workspace.characterSheetFile.previewUrl}
                      alt={workspace.characterSheetFile.name}
                      className="max-h-full max-w-full object-contain rounded"
                    />
                  </div>
                ) : (
                  <div className="flex flex-col gap-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] p-3.5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100/80 dark:bg-[#1E1A0E] text-amber-700 dark:text-[#F2B705]">
                        <FileText className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                          {workspace.characterSheetFile.name}
                        </p>
                        <p className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
                          {workspace.characterSheetFile.kind.toUpperCase()} ·{" "}
                          {formatFileSizeShort(workspace.characterSheetFile.size)}
                        </p>
                      </div>
                    </div>
                    {workspace.characterSheetFile.kind === "text" &&
                      workspace.characterSheetFile.textContent && (
                        <p className="line-clamp-4 rounded border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] p-2.5 text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-300 whitespace-pre-wrap">
                          {workspace.characterSheetFile.textContent}
                        </p>
                      )}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <Paperclip className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-[#F2B705]" />
                    <span className="truncate text-xs font-medium text-zinc-800 dark:text-zinc-200">
                      {workspace.characterSheetFile.name}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                      ({formatFileSizeShort(workspace.characterSheetFile.size)})
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => characterSheetInputRef.current?.click()}
                      className="inline-flex h-7 items-center gap-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#18181B] px-2.5 text-[11px] font-medium text-zinc-700 dark:text-zinc-200 hover:border-[#F2B705] disabled:opacity-45"
                    >
                      <Upload className="h-3 w-3" />
                      Replace
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={handleRemoveCharacterSheetFile}
                      className="inline-flex h-7 items-center gap-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#18181B] px-2 text-[11px] font-medium text-zinc-600 dark:text-zinc-400 hover:border-red-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-45"
                    >
                      <Trash2 className="h-3 w-3" />
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div
                role="button"
                tabIndex={isBusy ? -1 : 0}
                onClick={() => {
                  if (!isBusy) characterSheetInputRef.current?.click();
                }}
                onKeyDown={(e) => {
                  if (!isBusy && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    characterSheetInputRef.current?.click();
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (!isBusy) setIsDraggingSheet(true);
                }}
                onDragLeave={() => setIsDraggingSheet(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDraggingSheet(false);
                  if (isBusy) return;
                  const droppedFile = e.dataTransfer.files?.[0] ?? null;
                  handleAttachCharacterSheetFile(droppedFile);
                }}
                className={`flex-1 min-h-[220px] flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-5 text-center transition-colors cursor-pointer ${
                  isDraggingSheet
                    ? "border-[#F2B705] bg-amber-50/70 dark:bg-[#1E1A0E]/60"
                    : "border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#09090B] hover:border-[#F2B705]"
                } ${isBusy ? "opacity-55 pointer-events-none" : ""}`}
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] text-amber-600 dark:text-[#F2B705]">
                  <Paperclip className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                    Attach Character Sheet file
                  </p>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Drop an image, PDF, or text file here, or click to browse
                  </p>
                  <p className="font-mono text-[10px] text-zinc-400 dark:text-zinc-500">
                    PNG · JPG · WEBP · PDF · TXT · MD (max 15 MB)
                  </p>
                </div>
                <span className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#18181B] px-3 text-[11px] font-semibold text-zinc-800 dark:text-zinc-200">
                  <Upload className="h-3.5 w-3.5" />
                  Choose File
                </span>
              </div>
            )}

            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Used only for character-present scenes. Leave empty to use the
              default minimalist stickman reference.
            </p>
          </div>
        </section>
      </div>

      {/* Pipeline Controls & Progress Bar */}
      <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] p-4 sm:p-5 space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-0.5">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              3. Script Breakdown
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Split your script into numbered scenes and generate matching image
              and video prompts.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
            {isBusy ? (
              <button
                type="button"
                onClick={handleStopPipeline}
                className="inline-flex min-h-[42px] w-full sm:w-auto items-center justify-center gap-2 rounded-lg bg-red-600 px-5 py-2 text-xs font-semibold text-white hover:bg-red-500 transition-colors whitespace-nowrap"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
                Stop Pipeline
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    const controller = new AbortController();
                    abortControllerRef.current = controller;
                    void runBeatBreakdown(controller.signal).finally(() => {
                      abortControllerRef.current = null;
                    });
                  }}
                  disabled={!workspace.scriptText.trim()}
                  className="inline-flex min-h-[42px] flex-1 sm:flex-none items-center justify-center gap-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#18181B] px-4 py-2 text-xs font-semibold text-zinc-800 dark:text-zinc-200 hover:border-[#F2B705] hover:text-amber-700 dark:hover:text-[#F2B705] disabled:opacity-40 transition-colors whitespace-nowrap"
                >
                  <Scissors className="h-3.5 w-3.5" />
                  Step 1: Break into Scenes
                </button>

                {workspace.beats.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      void runAllPromptsGeneration();
                    }}
                    className="inline-flex min-h-[42px] flex-1 sm:flex-none items-center justify-center gap-2 rounded-lg bg-[#F2B705] px-5 py-2 text-xs font-semibold text-[#09090B] hover:bg-[#f7c52a] transition-colors whitespace-nowrap"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Step 2: Generate All {workspace.beats.length} Prompts
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      void handleRunFullPipeline();
                    }}
                    disabled={!workspace.scriptText.trim()}
                    className="inline-flex min-h-[42px] flex-1 sm:flex-none items-center justify-center gap-2 rounded-lg bg-[#F2B705] px-5 py-2 text-xs font-semibold text-[#09090B] hover:bg-[#f7c52a] disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Break &amp; Generate All Prompts
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Live Progress Indicator */}
        {isBreakingBeats && (
          <div className="flex items-center gap-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] px-4 py-3 text-xs text-zinc-700 dark:text-zinc-200">
            <Loader2 className="h-4 w-4 animate-spin text-amber-600 dark:text-[#F2B705] shrink-0" />
            <span>
              Running Module 1: Breaking script verbatim into visual beat
              scenes…
            </span>
          </div>
        )}

        {isGeneratingPrompts && (
          <div className="space-y-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="inline-flex items-center gap-2 font-medium text-zinc-800 dark:text-zinc-200">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-600 dark:text-[#F2B705]" />
                Generating Image &amp; Video Prompts ({promptProgress.activeRangeLabel}{" "}
                of {promptProgress.total})…
              </span>
              <span className="font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
                {promptProgress.completed} / {promptProgress.total} (
                {progressPercent}%)
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
              <div
                className="h-full bg-[#F2B705] transition-all duration-300"
                style={{ width: `${Math.max(4, progressPercent)}%` }}
              />
            </div>
          </div>
        )}
      </section>

      {/* STEP 1 OUTPUT: Numbered Scene Beats & Coverage Check */}
      {workspace.beats.length > 0 && (
        <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 dark:border-zinc-800 px-4 py-3.5 sm:px-5">
            <button
              type="button"
              onClick={() => setShowBeatsList((prev) => !prev)}
              className="flex items-center gap-2.5 text-left"
            >
              {showBeatsList ? (
                <ChevronUp className="h-4 w-4 text-zinc-500" />
              ) : (
                <ChevronDown className="h-4 w-4 text-zinc-500" />
              )}
              <div>
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Scene Beat Breakdown{" "}
                  <span className="font-mono text-xs font-normal text-amber-700 dark:text-[#F2B705] tabular-nums">
                    ({workspace.beats.length} scenes)
                  </span>
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Review or edit individual beat lines before or after generating
                  prompts
                </p>
              </div>
            </button>

            <div className="flex flex-wrap items-center gap-2">
              {workspace.coverageCheck && (
                <span
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-medium ${
                    workspace.coverageCheck.exactCoverageMatch
                      ? "border-emerald-300 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300"
                      : "border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300"
                  }`}
                >
                  {workspace.coverageCheck.exactCoverageMatch ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  )}
                  {workspace.coverageCheck.coverageMessage}
                </span>
              )}

              <button
                type="button"
                onClick={() => {
                  const formatted = workspace.beats
                    .map((b) => `${b.sceneNumber}. ${b.text}`)
                    .join("\n");
                  void copyTextWithFeedback(formatted, "all-beats", "all beat lines");
                }}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#18181B] px-2.5 text-[11px] font-medium text-zinc-700 dark:text-zinc-200 hover:border-[#F2B705]"
              >
                {copiedKey === "all-beats" ? (
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                Copy Beats
              </button>
            </div>
          </div>

          {/* Coverage Check Metrics Strip */}
          {workspace.coverageCheck && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-px bg-zinc-200 dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-800 text-xs">
              {[
                {
                  label: "Total Scenes",
                  value: String(workspace.coverageCheck.totalLines),
                },
                {
                  label: "Script Words",
                  value: workspace.coverageCheck.totalScriptWords.toLocaleString(),
                },
                {
                  label: "Beat Words",
                  value: workspace.coverageCheck.totalBeatWords.toLocaleString(),
                },
                {
                  label: "Est. Duration",
                  value: formatDurationShort(
                    workspace.coverageCheck.estimatedTotalSeconds
                  ),
                },
                {
                  label: "Avg Beat",
                  value: `${workspace.coverageCheck.averageLineSeconds.toFixed(1)}s`,
                },
                {
                  label: "Lines / Min",
                  value: workspace.coverageCheck.linesPerMinute.toFixed(1),
                },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="bg-zinc-50 dark:bg-[#0C0C0F] px-3.5 py-2.5"
                >
                  <span className="block text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    {stat.label}
                  </span>
                  <span className="mt-0.5 block font-mono text-xs font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">
                    {stat.value}
                  </span>
                </div>
              ))}
            </div>
          )}

          {showBeatsList && (
            <div className="p-4 sm:p-5 space-y-2.5">
              <div className="max-h-[360px] overflow-y-auto space-y-1.5 pr-1">
                {workspace.beats.map((beat) => (
                  <div
                    key={beat.sceneNumber}
                    className="flex items-center gap-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] px-3 py-1.5"
                  >
                    <span className="w-8 shrink-0 font-mono text-xs font-semibold text-amber-700 dark:text-[#F2B705] tabular-nums">
                      {beat.sceneNumber}.
                    </span>
                    <input
                      type="text"
                      value={beat.text}
                      disabled={isBusy}
                      onChange={(e) =>
                        handleUpdateBeatLine(beat.sceneNumber, e.target.value)
                      }
                      className="min-w-0 flex-1 bg-transparent text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none"
                    />
                    <button
                      type="button"
                      disabled={isBusy || workspace.beats.length <= 1}
                      onClick={() => handleDeleteBeatLine(beat.sceneNumber)}
                      title={`Remove scene ${beat.sceneNumber}`}
                      className="text-zinc-400 hover:text-red-500 disabled:opacity-30 transition-colors p-1"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={handleAddBeatLine}
                  className="inline-flex items-center gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white disabled:opacity-40"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Beat Line
                </button>
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  Every beat line becomes 1 scene in Step 2
                </span>
              </div>
            </div>
          )}
        </section>
      )}

      {/* STEP 2 OUTPUT: Extracted Image Prompts & Video Prompts per Scene */}
      {workspace.scenePrompts.length > 0 && (
        <section className="space-y-4">
          {/* Toolbar: Summary, Filters, Search, Copy & Send to Storyboard */}
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] p-4 sm:p-5 space-y-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="space-y-1">
                <h2 className="font-display text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  Extracted Scene Prompts ({promptStats.completed} /{" "}
                  {promptStats.total})
                </h2>
                <div className="flex flex-wrap items-center gap-2 text-xs font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
                  <span>{promptStats.completed} Image Prompts</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-amber-700 dark:text-[#F2B705] font-semibold">
                    {promptStats.withVideo} Video Prompts
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{promptStats.charPresent} Character Present</span>
                  <span aria-hidden="true">·</span>
                  <span>{promptStats.charAbsent} Character Absent</span>
                </div>
              </div>

              {/* Bulk Copy & Storyboard Handoff */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={promptStats.completed === 0}
                  onClick={() => {
                    const text = workspace.scenePrompts
                      .filter((s) => s.status === "completed" && s.imagePrompt)
                      .map((s) => `${s.sceneNumber}. ${s.imagePrompt}`)
                      .join("\n\n");
                    void copyTextWithFeedback(
                      text,
                      "all-image-prompts",
                      `${promptStats.completed} image prompts`
                    );
                  }}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#18181B] px-3 py-1.5 text-xs font-semibold text-zinc-800 dark:text-zinc-200 hover:border-[#F2B705] disabled:opacity-40 transition-colors whitespace-nowrap"
                >
                  {copiedKey === "all-image-prompts" ? (
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  Copy All Image Prompts
                </button>

                <button
                  type="button"
                  disabled={promptStats.withVideo === 0}
                  onClick={() => {
                    const text = workspace.scenePrompts
                      .filter((s) => s.status === "completed" && s.videoPrompt.trim())
                      .map(
                        (s) =>
                          `SCENE ${s.sceneNumber} (${s.narrationCovered})\nVIDEO PROMPT:\n${s.videoPrompt}`
                      )
                      .join("\n\n---\n\n");
                    void copyTextWithFeedback(
                      text,
                      "all-video-prompts",
                      `${promptStats.withVideo} video prompts`
                    );
                  }}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#18181B] px-3 py-1.5 text-xs font-semibold text-zinc-800 dark:text-zinc-200 hover:border-[#F2B705] disabled:opacity-40 transition-colors whitespace-nowrap"
                >
                  {copiedKey === "all-video-prompts" ? (
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <Film className="h-3.5 w-3.5" />
                  )}
                  Copy Video Prompts ({promptStats.withVideo})
                </button>

                <button
                  type="button"
                  disabled={promptStats.completed === 0 || isBusy}
                  onClick={handlePushToStoryboard}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-[#F2B705] px-4 py-1.5 text-xs font-semibold text-[#09090B] hover:bg-[#f7c52a] disabled:opacity-40 transition-colors whitespace-nowrap"
                >
                  Send to Storyboard
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Filter Tabs & Search */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-2 border-t border-zinc-200 dark:border-zinc-800">
              <div
                role="tablist"
                aria-label="Filter scene prompts"
                className="flex flex-wrap items-center gap-1 rounded-lg bg-zinc-50 dark:bg-[#09090B] p-1 border border-zinc-200 dark:border-zinc-800"
              >
                {(
                  [
                    { id: "all", label: `All (${promptStats.total})` },
                    {
                      id: "with_video",
                      label: `Video Prompt (${promptStats.withVideo})`,
                    },
                    {
                      id: "image_only",
                      label: `Image Only (${promptStats.imageOnly})`,
                    },
                    {
                      id: "char_present",
                      label: `Character (${promptStats.charPresent})`,
                    },
                    {
                      id: "char_absent",
                      label: `No Character (${promptStats.charAbsent})`,
                    },
                  ] as Array<{ id: PromptFilterMode; label: string }>
                ).map((tab) => {
                  const active = filterMode === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setFilterMode(tab.id)}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors tabular-nums ${
                        active
                          ? "bg-zinc-900 dark:bg-zinc-800 text-white dark:text-zinc-100"
                          : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search scene #, narration, or prompt..."
                  className="h-9 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] pl-8 pr-3 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:border-[#F2B705] focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Extracted Per-Scene List (Image Prompt + Video Prompt or Not available) */}
          {filteredScenePrompts.length === 0 ? (
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] p-8 text-center text-xs text-zinc-500">
              No scenes match this filter.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredScenePrompts.map((scene) => {
                const hasVideo = Boolean(scene.videoPrompt.trim());
                const isRegenerating = regeneratingSceneNum === scene.sceneNumber;

                return (
                  <article
                    key={scene.sceneNumber}
                    className={`rounded-xl border bg-white dark:bg-[#111114] overflow-hidden ${
                      scene.status === "error"
                        ? "border-red-300 dark:border-red-500/40"
                        : hasVideo
                          ? "border-amber-300/80 dark:border-[#F2B705]/40"
                          : "border-zinc-200 dark:border-zinc-800"
                    }`}
                  >
                    {/* Scene Header Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-[#0C0C0F] px-4 py-2.5 sm:px-5">
                      <div className="flex flex-wrap items-center gap-2.5 min-w-0 flex-1">
                        <span className="font-mono text-xs font-bold text-amber-700 dark:text-[#F2B705] tabular-nums shrink-0">
                          SCENE {scene.sceneNumber}
                        </span>
                        <span
                          aria-hidden="true"
                          className="text-zinc-300 dark:text-zinc-700"
                        >
                          ·
                        </span>
                        <p className="text-xs font-medium text-zinc-900 dark:text-zinc-100 break-words">
                          “{scene.narrationCovered}”
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {scene.status === "completed" && (
                          <span
                            className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-medium ${
                              scene.characterPresent
                                ? "border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#16161A] text-zinc-700 dark:text-zinc-200"
                                : "border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-[#121216] text-zinc-500 dark:text-zinc-400"
                            }`}
                          >
                            {scene.characterPresent ? (
                              <>
                                <UserCheck className="h-3 w-3 text-amber-600 dark:text-[#F2B705]" />
                                Character Present
                              </>
                            ) : (
                              <>
                                <UserX className="h-3 w-3" />
                                Character Absent
                              </>
                            )}
                          </span>
                        )}

                        {!isBusy && (
                          <button
                            type="button"
                            disabled={regeneratingSceneNum !== null}
                            onClick={() => {
                              void handleRegenerateSingleScene(scene.sceneNumber);
                            }}
                            title={`Regenerate Scene ${scene.sceneNumber}`}
                            className="inline-flex h-7 items-center gap-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#16161A] px-2 text-[11px] font-medium text-zinc-700 dark:text-zinc-300 hover:border-[#F2B705] disabled:opacity-40"
                          >
                            {isRegenerating ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3 w-3" />
                            )}
                            {scene.status === "error" ? "Retry" : "Redo"}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Extracted Image Prompt + Video Prompt Grid */}
                    <div className="grid grid-cols-1 divide-y divide-zinc-200 dark:divide-zinc-800 lg:grid-cols-12 lg:divide-y-0 lg:divide-x">
                      {/* IMAGE PROMPT Column (7 cols) */}
                      <div className="lg:col-span-7 p-4 sm:p-5 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                            <ImageIcon className="h-3.5 w-3.5 text-amber-600 dark:text-[#F2B705]" />
                            Image Prompt
                          </span>
                          {scene.imagePrompt && (
                            <button
                              type="button"
                              onClick={() => {
                                void copyTextWithFeedback(
                                  scene.imagePrompt,
                                  `img-${scene.sceneNumber}`,
                                  `Scene ${scene.sceneNumber} image prompt`
                                );
                              }}
                              className="inline-flex h-6 items-center gap-1 rounded border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#18181B] px-2 text-[11px] font-medium text-zinc-600 dark:text-zinc-300 hover:border-[#F2B705]"
                            >
                              {copiedKey === `img-${scene.sceneNumber}` ? (
                                <Check className="h-3 w-3 text-emerald-500" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                              Copy
                            </button>
                          )}
                        </div>

                        {scene.status === "generating" || isRegenerating ? (
                          <div className="flex items-center gap-2 py-3 text-xs text-zinc-500">
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-600 dark:text-[#F2B705]" />
                            Generating scene-adaptive image prompt…
                          </div>
                        ) : scene.status === "error" ? (
                          <p className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
                            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                            {scene.errorMessage || "Generation failed."}
                          </p>
                        ) : scene.imagePrompt ? (
                          <p className="text-xs leading-relaxed text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap">
                            {scene.imagePrompt}
                          </p>
                        ) : (
                          <p className="text-xs italic text-zinc-400 dark:text-zinc-500">
                            Queued…
                          </p>
                        )}
                      </div>

                      {/* VIDEO PROMPT Column (5 cols) */}
                      <div className="lg:col-span-5 p-4 sm:p-5 space-y-2 bg-zinc-50/40 dark:bg-[#0D0D10]">
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                            <Film
                              className={`h-3.5 w-3.5 ${
                                hasVideo
                                  ? "text-amber-600 dark:text-[#F2B705]"
                                  : "text-zinc-400 dark:text-zinc-600"
                              }`}
                            />
                            Video Prompt
                          </span>
                          {hasVideo && (
                            <button
                              type="button"
                              onClick={() => {
                                void copyTextWithFeedback(
                                  scene.videoPrompt,
                                  `vid-${scene.sceneNumber}`,
                                  `Scene ${scene.sceneNumber} video prompt`
                                );
                              }}
                              className="inline-flex h-6 items-center gap-1 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-[#18181B] px-2 text-[11px] font-medium text-zinc-600 dark:text-zinc-300 hover:border-[#F2B705]"
                            >
                              {copiedKey === `vid-${scene.sceneNumber}` ? (
                                <Check className="h-3 w-3 text-emerald-500" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                              Copy
                            </button>
                          )}
                        </div>

                        {scene.status === "generating" || isRegenerating ? (
                          <p className="py-3 text-xs text-zinc-500">
                            Evaluating motion requirement…
                          </p>
                        ) : hasVideo ? (
                          <p className="text-xs leading-relaxed text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap">
                            {scene.videoPrompt}
                          </p>
                        ) : (
                          <p className="py-2 text-xs text-zinc-400 dark:text-zinc-500">
                            Not available
                          </p>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Editable Master Prompt Rules Modal */}
      {isPromptModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-label="Scene Breakdown Prompt Rules"
        >
          <div className="flex max-h-[88vh] w-full max-w-4xl flex-col rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-zinc-200 dark:border-zinc-800 px-5 py-4">
              <div>
                <h2 className="font-display text-base font-semibold text-zinc-900 dark:text-zinc-100">
                  Scene Breakdown Master Prompts
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Adapted from your workflow controller for automatic full-script
                  execution while keeping all visual, anatomy, and matching rules
                  intact.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsPromptModalOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 border-b border-zinc-200 dark:border-zinc-800 px-5 py-2.5 bg-zinc-50 dark:bg-[#0C0C0F]">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setModalTab("module1")}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                    modalTab === "module1"
                      ? "bg-zinc-900 dark:bg-zinc-800 text-white"
                      : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                  }`}
                >
                  Module 1: Beat Line-Breaking
                </button>
                <button
                  type="button"
                  onClick={() => setModalTab("module2")}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                    modalTab === "module2"
                      ? "bg-zinc-900 dark:bg-zinc-800 text-white"
                      : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                  }`}
                >
                  Module 2: Image &amp; Video Prompts
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  setWorkspace((prev) => ({
                    ...prev,
                    promptConfig: {
                      module1BeatPrompt: DEFAULT_MODULE_1_BEAT_PROMPT,
                      module2VisualPrompt: DEFAULT_MODULE_2_VISUAL_PROMPT,
                    },
                  }));
                  onNotify("Restored default Scene Breakdown master prompts", "neutral");
                }}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-amber-600 dark:hover:text-[#F2B705]"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Restore Defaults
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {modalTab === "module1" ? (
                <textarea
                  value={workspace.promptConfig.module1BeatPrompt}
                  onChange={(e) =>
                    setWorkspace((prev) => ({
                      ...prev,
                      promptConfig: {
                        ...prev.promptConfig,
                        module1BeatPrompt: e.target.value,
                      },
                    }))
                  }
                  className="min-h-[420px] w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] p-4 font-mono text-xs leading-relaxed text-zinc-800 dark:text-zinc-200 focus:border-[#F2B705] focus:outline-none"
                />
              ) : (
                <textarea
                  value={workspace.promptConfig.module2VisualPrompt}
                  onChange={(e) =>
                    setWorkspace((prev) => ({
                      ...prev,
                      promptConfig: {
                        ...prev.promptConfig,
                        module2VisualPrompt: e.target.value,
                      },
                    }))
                  }
                  className="min-h-[420px] w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] p-4 font-mono text-xs leading-relaxed text-zinc-800 dark:text-zinc-200 focus:border-[#F2B705] focus:outline-none"
                />
              )}
            </div>

            <div className="flex justify-end border-t border-zinc-200 dark:border-zinc-800 px-5 py-3">
              <button
                type="button"
                onClick={() => setIsPromptModalOpen(false)}
                className="rounded-lg bg-[#F2B705] px-4 py-2 text-xs font-semibold text-[#09090B] hover:bg-[#f7c52a]"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
