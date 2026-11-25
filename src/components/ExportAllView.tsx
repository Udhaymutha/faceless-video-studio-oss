import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import {
  ArrowUpRight,
  Check,
  CheckCircle2,
  Clapperboard,
  Clock,
  Download,
  Eye,
  EyeOff,
  FileAudio,
  FileText,
  FolderArchive,
  Image as ImageIcon,
  Images,
  Loader2,
  Package,
  RefreshCw,
  ScrollText,
  Sparkles,
} from "lucide-react";
import type { NarrationWorkspaceState } from "../types/narration";
import type { SceneBreakdownWorkspaceState } from "../types/sceneBreakdown";
import type { ScriptWriterWorkspaceState } from "../types/scriptWriter";
import type { SceneItem, StudioView, ToastMessage } from "../types/studio";
import {
  loadAllCachedScenes,
  loadNarrationState,
  loadSceneBreakdownState,
  loadScriptWriterState,
} from "../utils/batchCache";
import type { CachedSceneRecord } from "../utils/batchCache";
import { formatAudioDuration } from "../utils/narrationAudio";
import {
  getSceneFilename,
  triggerBrowserDownload,
} from "../utils/promptParser";

interface ExportAllViewProps {
  activeStoryboardScenes: SceneItem[];
  activeBatchStartNumber: number;
  activeBatchIndex: number;
  onNotify: (text: string, tone?: ToastMessage["tone"]) => void;
  onNavigate: (view: StudioView) => void;
}

interface ExportableEpisodeOption {
  key: string;
  projectTitle: string;
  episodeCode: string;
  episodeTitle: string;
  scriptText: string;
  wordCount: number;
  updatedAt: number;
  isActiveProject: boolean;
}

interface ExportSelectionState {
  script: boolean;
  narration: boolean;
  sceneBreakdown: boolean;
  scenePrompts: boolean;
  storyboardImages: boolean;
}

function buildDefaultDateTimeName(date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}_${hh}-${min}`;
}

function sanitizeZipBaseName(raw: string): string {
  const stripped = raw
    .trim()
    .replace(/\.zip$/i, "")
    .replace(/[<>:"/\\|?*\x00-\x1F]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return stripped || buildDefaultDateTimeName();
}

function formatBytesShort(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function collectExportableEpisodes(
  swState: ScriptWriterWorkspaceState | null
): ExportableEpisodeOption[] {
  if (!swState || !Array.isArray(swState.projects)) return [];

  const options: ExportableEpisodeOption[] = [];
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
          scriptText: ep.scriptText.trim(),
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

function formatSceneBeatBreakdownText(
  state: SceneBreakdownWorkspaceState | null
): string {
  if (!state || !Array.isArray(state.beats) || state.beats.length === 0) {
    return "";
  }
  return state.beats
    .map((beat, idx) => `${beat.sceneNumber || idx + 1}. ${beat.text.trim()}`)
    .filter(Boolean)
    .join("\n");
}

function formatScenePromptsText(
  state: SceneBreakdownWorkspaceState | null
): string {
  if (
    !state ||
    !Array.isArray(state.scenePrompts) ||
    state.scenePrompts.length === 0
  ) {
    return "";
  }

  const ready = state.scenePrompts
    .filter((s) => s.status === "completed" && s.imagePrompt.trim().length > 0)
    .sort((a, b) => a.sceneNumber - b.sceneNumber);

  if (ready.length === 0) return "";

  return ready
    .map((scene) => {
      const lines = [
        `Scene ${scene.sceneNumber}`,
        `Image Prompt: ${scene.imagePrompt.trim()}`,
      ];
      if (scene.videoPrompt && scene.videoPrompt.trim()) {
        lines.push(`Video Prompt: ${scene.videoPrompt.trim()}`);
      }
      return lines.join("\n");
    })
    .join("\n\n");
}

export function ExportAllView({
  activeStoryboardScenes,
  activeBatchStartNumber,
  activeBatchIndex,
  onNotify,
  onNavigate,
}: ExportAllViewProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatusLabel, setExportStatusLabel] = useState("");

  // Loaded studio data
  const [episodes, setEpisodes] = useState<ExportableEpisodeOption[]>([]);
  const [selectedEpisodeKey, setSelectedEpisodeKey] = useState("");
  const [narrationState, setNarrationState] =
    useState<NarrationWorkspaceState | null>(null);
  const [breakdownState, setBreakdownState] =
    useState<SceneBreakdownWorkspaceState | null>(null);
  const [cachedImages, setCachedImages] = useState<CachedSceneRecord[]>([]);

  // Audio preview URL for narration blob
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
  const audioPreviewUrlRef = useRef<string | null>(null);

  // Checkboxes
  const [selected, setSelected] = useState<ExportSelectionState>({
    script: false,
    narration: false,
    sceneBreakdown: false,
    scenePrompts: false,
    storyboardImages: false,
  });

  // Preview toggles per text card
  const [expandedPreview, setExpandedPreview] = useState<
    Record<string, boolean>
  >({});

  // Master ZIP filename (defaults to today's date & time)
  const [customFilename, setCustomFilename] = useState<string>(() =>
    buildDefaultDateTimeName()
  );
  const [hasEditedFilename, setHasEditedFilename] = useState(false);

  // Merge IndexedDB cached images with any completed images currently in active Storyboard memory
  const allStoryboardImages = useMemo(() => {
    const bySceneNumber = new Map<number, CachedSceneRecord>();

    for (const rec of cachedImages) {
      if (rec.imageDataUrl) {
        bySceneNumber.set(rec.sceneNumber, rec);
      }
    }

    activeStoryboardScenes.forEach((scene, offset) => {
      if (scene.status === "completed" && scene.imageDataUrl) {
        const sceneNumber = activeBatchStartNumber + offset;
        bySceneNumber.set(sceneNumber, {
          sceneNumber,
          batchIndex: activeBatchIndex,
          prompt: scene.prompt,
          narration: scene.narration,
          imageDataUrl: scene.imageDataUrl,
          mimeType: scene.mimeType || "image/png",
          compiledPrompt: scene.compiledPrompt,
          generatedAt: scene.generatedAt || Date.now(),
        });
      }
    });

    return Array.from(bySceneNumber.values()).sort(
      (a, b) => a.sceneNumber - b.sceneNumber
    );
  }, [
    cachedImages,
    activeStoryboardScenes,
    activeBatchStartNumber,
    activeBatchIndex,
  ]);

  const batchCount = useMemo(() => {
    const indices = new Set(allStoryboardImages.map((img) => img.batchIndex));
    return indices.size;
  }, [allStoryboardImages]);

  const refreshWorkspaceData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [sw, nar, bd, imgs] = await Promise.all([
        loadScriptWriterState().catch(() => null),
        loadNarrationState().catch(() => null),
        loadSceneBreakdownState().catch(() => null),
        loadAllCachedScenes().catch(() => []),
      ]);

      const eps = collectExportableEpisodes(sw);
      setEpisodes(eps);
      setSelectedEpisodeKey((prev) =>
        eps.some((e) => e.key === prev) ? prev : eps[0]?.key ?? ""
      );
      setNarrationState(nar);
      setBreakdownState(bd);
      setCachedImages(imgs);

      // Manage object URL for audio preview
      if (audioPreviewUrlRef.current) {
        URL.revokeObjectURL(audioPreviewUrlRef.current);
        audioPreviewUrlRef.current = null;
      }
      if (nar?.lastAudioBlob && nar.lastAudioBlob.size > 0) {
        const url = URL.createObjectURL(nar.lastAudioBlob);
        audioPreviewUrlRef.current = url;
        setAudioPreviewUrl(url);
      } else {
        setAudioPreviewUrl(null);
      }

      // Compute availability to auto-check ready items
      const hasScript = eps.length > 0;
      const hasNarration = Boolean(
        nar?.lastAudioBlob && nar.lastAudioBlob.size > 0
      );
      const hasBeats = Boolean(bd?.beats && bd.beats.length > 0);
      const hasPrompts = Boolean(
        bd?.scenePrompts?.some(
          (s) => s.status === "completed" && s.imagePrompt.trim().length > 0
        )
      );
      const activeCompletedCount = activeStoryboardScenes.filter(
        (s) => s.status === "completed" && Boolean(s.imageDataUrl)
      ).length;
      const hasImages = imgs.length > 0 || activeCompletedCount > 0;

      setSelected({
        script: hasScript,
        narration: hasNarration,
        sceneBreakdown: hasBeats,
        scenePrompts: hasPrompts,
        storyboardImages: hasImages,
      });

      if (!hasEditedFilename) {
        setCustomFilename(buildDefaultDateTimeName());
      }
    } finally {
      setIsLoading(false);
    }
  }, [activeStoryboardScenes, hasEditedFilename]);

  useEffect(() => {
    void refreshWorkspaceData();
    return () => {
      if (audioPreviewUrlRef.current) {
        URL.revokeObjectURL(audioPreviewUrlRef.current);
        audioPreviewUrlRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Derived export payloads
  const activeEpisode = useMemo(
    () => episodes.find((e) => e.key === selectedEpisodeKey) ?? episodes[0] ?? null,
    [episodes, selectedEpisodeKey]
  );

  const scriptTextContent = activeEpisode?.scriptText ?? "";
  const narrationAudioBlob =
    narrationState?.lastAudioBlob && narrationState.lastAudioBlob.size > 0
      ? narrationState.lastAudioBlob
      : null;
  const sceneBreakdownTextContent = useMemo(
    () => formatSceneBeatBreakdownText(breakdownState),
    [breakdownState]
  );
  const scenePromptsTextContent = useMemo(
    () => formatScenePromptsText(breakdownState),
    [breakdownState]
  );

  const promptMetrics = useMemo(() => {
    const ready = (breakdownState?.scenePrompts ?? []).filter(
      (s) => s.status === "completed" && s.imagePrompt.trim().length > 0
    );
    const withVideo = ready.filter((s) => s.videoPrompt.trim().length > 0).length;
    return {
      total: ready.length,
      withVideo,
    };
  }, [breakdownState]);

  const availability = {
    script: scriptTextContent.length > 0,
    narration: Boolean(narrationAudioBlob),
    sceneBreakdown: sceneBreakdownTextContent.length > 0,
    scenePrompts: scenePromptsTextContent.length > 0,
    storyboardImages: allStoryboardImages.length > 0,
  };

  const availableCount = Object.values(availability).filter(Boolean).length;
  const selectedKeys = (
    Object.keys(selected) as Array<keyof ExportSelectionState>
  ).filter((k) => selected[k] && availability[k]);
  const selectedCount = selectedKeys.length;

  const resolvedMasterZipFilename = `${sanitizeZipBaseName(
    customFilename || buildDefaultDateTimeName()
  )}.zip`;

  const toggleItem = (key: keyof ExportSelectionState) => {
    if (!availability[key] || isExporting) return;
    setSelected((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSelectAllAvailable = () => {
    setSelected({
      script: availability.script,
      narration: availability.narration,
      sceneBreakdown: availability.sceneBreakdown,
      scenePrompts: availability.scenePrompts,
      storyboardImages: availability.storyboardImages,
    });
  };

  const handleDeselectAll = () => {
    setSelected({
      script: false,
      narration: false,
      sceneBreakdown: false,
      scenePrompts: false,
      storyboardImages: false,
    });
  };

  const handleResetFilenameToNow = () => {
    setCustomFilename(buildDefaultDateTimeName());
    setHasEditedFilename(false);
  };

  // Single-item quick download helper
  const handleDownloadSingleItem = async (key: keyof ExportSelectionState) => {
    if (!availability[key] || isExporting) return;
    try {
      if (key === "script") {
        const blob = new Blob([scriptTextContent], {
          type: "text/plain;charset=utf-8",
        });
        triggerBrowserDownload(blob, "script.txt");
        onNotify("Downloaded script.txt", "success");
      } else if (key === "narration" && narrationAudioBlob) {
        triggerBrowserDownload(narrationAudioBlob, "narration.wav");
        onNotify("Downloaded narration.wav", "success");
      } else if (key === "sceneBreakdown") {
        const blob = new Blob([sceneBreakdownTextContent], {
          type: "text/plain;charset=utf-8",
        });
        triggerBrowserDownload(blob, "scene breakdown.txt");
        onNotify("Downloaded scene breakdown.txt", "success");
      } else if (key === "scenePrompts") {
        const blob = new Blob([scenePromptsTextContent], {
          type: "text/plain;charset=utf-8",
        });
        triggerBrowserDownload(blob, "scene prompts.txt");
        onNotify("Downloaded scene prompts.txt", "success");
      } else if (key === "storyboardImages") {
        setIsExporting(true);
        setExportStatusLabel("Packaging Storyboard images…");
        const imagesZip = new JSZip();
        for (const rec of allStoryboardImages) {
          const filename = getSceneFilename(rec.sceneNumber, rec.mimeType);
          const base64Data = rec.imageDataUrl.split(",")[1];
          if (base64Data) {
            imagesZip.file(filename, base64Data, { base64: true });
          }
        }
        const blob = await imagesZip.generateAsync({ type: "blob" });
        triggerBrowserDownload(blob, "images.zip");
        onNotify(
          `Downloaded images.zip (${allStoryboardImages.length} images)`,
          "success"
        );
      }
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : "Could not download file.",
        "error"
      );
    } finally {
      setIsExporting(false);
      setExportStatusLabel("");
    }
  };

  // Master Export: package all checked items into one Master ZIP
  const handleExportMasterZip = async () => {
    if (selectedCount === 0 || isExporting) {
      onNotify("Select at least one available item to export.", "error");
      return;
    }

    setIsExporting(true);
    try {
      const masterZip = new JSZip();

      if (selected.script && availability.script) {
        setExportStatusLabel("Adding script.txt…");
        masterZip.file("script.txt", scriptTextContent);
      }

      if (selected.narration && narrationAudioBlob) {
        setExportStatusLabel("Adding narration.wav…");
        masterZip.file("narration.wav", narrationAudioBlob);
      }

      if (selected.sceneBreakdown && availability.sceneBreakdown) {
        setExportStatusLabel("Adding scene breakdown.txt…");
        masterZip.file("scene breakdown.txt", sceneBreakdownTextContent);
      }

      if (selected.scenePrompts && availability.scenePrompts) {
        setExportStatusLabel("Adding scene prompts.txt…");
        masterZip.file("scene prompts.txt", scenePromptsTextContent);
      }

      if (selected.storyboardImages && availability.storyboardImages) {
        setExportStatusLabel(
          `Creating inner images.zip (${allStoryboardImages.length} images)…`
        );
        const imagesZip = new JSZip();
        for (const rec of allStoryboardImages) {
          const filename = getSceneFilename(rec.sceneNumber, rec.mimeType);
          const base64Data = rec.imageDataUrl.split(",")[1];
          if (base64Data) {
            imagesZip.file(filename, base64Data, { base64: true });
          }
        }
        const innerImagesZipBlob = await imagesZip.generateAsync({
          type: "blob",
        });
        masterZip.file("images.zip", innerImagesZipBlob);
      }

      setExportStatusLabel("Building master ZIP package…");
      const finalBaseName = hasEditedFilename
        ? sanitizeZipBaseName(customFilename)
        : buildDefaultDateTimeName();
      const finalFilename = `${finalBaseName}.zip`;

      const masterBlob = await masterZip.generateAsync({ type: "blob" });
      triggerBrowserDownload(masterBlob, finalFilename);

      onNotify(
        `Exported ${finalFilename} (${selectedCount} item${selectedCount === 1 ? "" : "s"})`,
        "success"
      );
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : "Master ZIP export failed.",
        "error"
      );
    } finally {
      setIsExporting(false);
      setExportStatusLabel("");
    }
  };

  const manifestFiles = useMemo(() => {
    const items: Array<{ filename: string; detail: string }> = [];
    if (selected.script && availability.script) {
      items.push({
        filename: "script.txt",
        detail: `${activeEpisode?.wordCount.toLocaleString() ?? 0} words`,
      });
    }
    if (selected.narration && narrationAudioBlob) {
      items.push({
        filename: "narration.wav",
        detail: formatBytesShort(narrationAudioBlob.size),
      });
    }
    if (selected.sceneBreakdown && availability.sceneBreakdown) {
      items.push({
        filename: "scene breakdown.txt",
        detail: `${breakdownState?.beats.length ?? 0} scenes`,
      });
    }
    if (selected.scenePrompts && availability.scenePrompts) {
      items.push({
        filename: "scene prompts.txt",
        detail: `${promptMetrics.total} image${promptMetrics.withVideo > 0 ? `, ${promptMetrics.withVideo} video` : ""}`,
      });
    }
    if (selected.storyboardImages && availability.storyboardImages) {
      items.push({
        filename: "images.zip",
        detail: `${allStoryboardImages.length} image${allStoryboardImages.length === 1 ? "" : "s"} (${batchCount} batch${batchCount === 1 ? "" : "es"})`,
      });
    }
    return items;
  }, [
    selected,
    availability,
    activeEpisode,
    narrationAudioBlob,
    breakdownState,
    promptMetrics,
    allStoryboardImages.length,
    batchCount,
  ]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Export All
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Select the studio assets you want to bundle and download everything
            together in one master ZIP file.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              void refreshWorkspaceData();
            }}
            disabled={isLoading || isExporting}
            className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#18181B] px-3.5 py-2 text-xs font-semibold text-zinc-800 dark:text-zinc-200 hover:border-[#F2B705] disabled:opacity-45 transition-colors whitespace-nowrap"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`}
            />
            Refresh Assets
          </button>

          <button
            type="button"
            onClick={handleSelectAllAvailable}
            disabled={availableCount === 0 || isExporting}
            className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#18181B] px-3.5 py-2 text-xs font-semibold text-zinc-800 dark:text-zinc-200 hover:border-[#F2B705] disabled:opacity-40 transition-colors whitespace-nowrap"
          >
            <Check className="h-3.5 w-3.5" />
            Select All Ready ({availableCount})
          </button>

          {selectedCount > 0 && (
            <button
              type="button"
              onClick={handleDeselectAll}
              disabled={isExporting}
              className="inline-flex min-h-[40px] items-center justify-center rounded-lg px-3 py-2 text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors whitespace-nowrap"
            >
              Clear Selection
            </button>
          )}
        </div>
      </div>

      {/* Main Two-Column Layout: Checklist (8 cols) + Master Export Controls (4 cols) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        {/* Left: Export Elements Checklist */}
        <div className="lg:col-span-8 space-y-4">
          {isLoading ? (
            <div className="flex min-h-[240px] items-center justify-center rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] p-8">
              <div className="inline-flex items-center gap-2.5 text-sm text-zinc-600 dark:text-zinc-400">
                <Loader2 className="h-4 w-4 animate-spin text-amber-600 dark:text-[#F2B705]" />
                Scanning generated studio assets…
              </div>
            </div>
          ) : (
            <>
              {/* 1. Script Writer — script.txt */}
              <div
                className={`rounded-xl border transition-colors bg-white dark:bg-[#111114] ${
                  selected.script && availability.script
                    ? "border-[#F2B705]/70"
                    : "border-zinc-200 dark:border-zinc-800"
                }`}
              >
                <div className="flex items-start gap-3.5 p-4 sm:p-5">
                  <input
                    id="export-check-script"
                    type="checkbox"
                    checked={selected.script && availability.script}
                    disabled={!availability.script || isExporting}
                    onChange={() => toggleItem("script")}
                    className="mt-1 h-4 w-4 rounded border-zinc-400 dark:border-zinc-600 accent-[#F2B705] cursor-pointer disabled:cursor-not-allowed shrink-0"
                  />

                  <div className="min-w-0 flex-1 space-y-2.5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <label
                        htmlFor="export-check-script"
                        className={`flex items-center gap-2.5 min-w-0 ${
                          availability.script ? "cursor-pointer" : "opacity-65"
                        }`}
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 dark:bg-[#18181B] text-amber-600 dark:text-[#F2B705]">
                          <ScrollText className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <span className="block text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                            1. Story Script
                          </span>
                          <span className="block font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                            script.txt · From Script Writer
                          </span>
                        </div>
                      </label>

                      <div className="flex items-center gap-2 shrink-0">
                        {availability.script ? (
                          <>
                            <span className="inline-flex items-center gap-1 font-mono text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              {activeEpisode?.wordCount.toLocaleString()} words
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedPreview((prev) => ({
                                  ...prev,
                                  script: !prev.script,
                                }))
                              }
                              className="inline-flex h-7 items-center gap-1 rounded border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#18181B] px-2 text-[11px] font-medium text-zinc-600 dark:text-zinc-300 hover:border-[#F2B705]"
                            >
                              {expandedPreview.script ? (
                                <EyeOff className="h-3 w-3" />
                              ) : (
                                <Eye className="h-3 w-3" />
                              )}
                              Preview
                            </button>
                            <button
                              type="button"
                              title="Download script.txt individually"
                              onClick={() => {
                                void handleDownloadSingleItem("script");
                              }}
                              disabled={isExporting}
                              className="inline-flex h-7 w-7 items-center justify-center rounded border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#18181B] text-zinc-600 dark:text-zinc-300 hover:border-[#F2B705] hover:text-amber-600 dark:hover:text-[#F2B705]"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onNavigate("script")}
                            className="inline-flex h-7 items-center gap-1 rounded border border-zinc-300 dark:border-zinc-700 px-2.5 text-[11px] font-medium text-zinc-600 dark:text-zinc-400 hover:border-[#F2B705] hover:text-amber-700 dark:hover:text-[#F2B705]"
                          >
                            Not ready · Open Script Writer
                            <ArrowUpRight className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    {episodes.length > 1 && (
                      <div className="flex flex-wrap items-center gap-2">
                        <label
                          htmlFor="export-episode-select"
                          className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400"
                        >
                          Episode to export:
                        </label>
                        <select
                          id="export-episode-select"
                          value={selectedEpisodeKey}
                          disabled={isExporting}
                          onChange={(e) =>
                            setSelectedEpisodeKey(e.target.value)
                          }
                          className="h-8 max-w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#09090B] px-2.5 text-xs text-zinc-800 dark:text-zinc-200 focus:border-[#F2B705] focus:outline-none"
                        >
                          {episodes.map((ep) => (
                            <option key={ep.key} value={ep.key}>
                              {ep.episodeCode} · {ep.projectTitle} (
                              {ep.wordCount.toLocaleString()} words)
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {availability.script && activeEpisode && episodes.length === 1 && (
                      <p className="text-xs text-zinc-600 dark:text-zinc-400 truncate">
                        {activeEpisode.episodeCode} · {activeEpisode.projectTitle}
                      </p>
                    )}

                    {expandedPreview.script && availability.script && (
                      <pre className="max-h-44 overflow-y-auto whitespace-pre-wrap rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] p-3 font-mono text-[11px] leading-relaxed text-zinc-700 dark:text-zinc-300">
                        {scriptTextContent.slice(0, 1400)}
                        {scriptTextContent.length > 1400 ? "\n…" : ""}
                      </pre>
                    )}
                  </div>
                </div>
              </div>

              {/* 2. Narration — narration.wav */}
              <div
                className={`rounded-xl border transition-colors bg-white dark:bg-[#111114] ${
                  selected.narration && availability.narration
                    ? "border-[#F2B705]/70"
                    : "border-zinc-200 dark:border-zinc-800"
                }`}
              >
                <div className="flex items-start gap-3.5 p-4 sm:p-5">
                  <input
                    id="export-check-narration"
                    type="checkbox"
                    checked={selected.narration && availability.narration}
                    disabled={!availability.narration || isExporting}
                    onChange={() => toggleItem("narration")}
                    className="mt-1 h-4 w-4 rounded border-zinc-400 dark:border-zinc-600 accent-[#F2B705] cursor-pointer disabled:cursor-not-allowed shrink-0"
                  />

                  <div className="min-w-0 flex-1 space-y-2.5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <label
                        htmlFor="export-check-narration"
                        className={`flex items-center gap-2.5 min-w-0 ${
                          availability.narration
                            ? "cursor-pointer"
                            : "opacity-65"
                        }`}
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 dark:bg-[#18181B] text-amber-600 dark:text-[#F2B705]">
                          <FileAudio className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <span className="block text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                            2. Narration Audio
                          </span>
                          <span className="block font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                            narration.wav · From Narration
                          </span>
                        </div>
                      </label>

                      <div className="flex items-center gap-2 shrink-0">
                        {availability.narration && narrationAudioBlob ? (
                          <>
                            <span className="inline-flex items-center gap-1 font-mono text-[11px] font-medium text-emerald-700 dark:text-emerald-400 tabular-nums">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              {narrationState?.lastAudioDuration
                                ? `${formatAudioDuration(narrationState.lastAudioDuration)} · `
                                : ""}
                              {formatBytesShort(narrationAudioBlob.size)}
                            </span>
                            <button
                              type="button"
                              title="Download narration.wav individually"
                              onClick={() => {
                                void handleDownloadSingleItem("narration");
                              }}
                              disabled={isExporting}
                              className="inline-flex h-7 w-7 items-center justify-center rounded border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#18181B] text-zinc-600 dark:text-zinc-300 hover:border-[#F2B705] hover:text-amber-600 dark:hover:text-[#F2B705]"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onNavigate("narration")}
                            className="inline-flex h-7 items-center gap-1 rounded border border-zinc-300 dark:border-zinc-700 px-2.5 text-[11px] font-medium text-zinc-600 dark:text-zinc-400 hover:border-[#F2B705] hover:text-amber-700 dark:hover:text-[#F2B705]"
                          >
                            Not ready · Open Narration
                            <ArrowUpRight className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    {availability.narration && audioPreviewUrl && (
                      <div className="space-y-1.5">
                        {narrationState?.lastAudioVoice && (
                          <p className="text-xs text-zinc-600 dark:text-zinc-400">
                            Voice: {narrationState.lastAudioVoice}
                            {narrationState.sourceTitle
                              ? ` · ${narrationState.sourceTitle}`
                              : ""}
                          </p>
                        )}
                        <audio
                          controls
                          src={audioPreviewUrl}
                          className="h-9 w-full"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 3. Scene Breakdown (Beats) — scene breakdown.txt */}
              <div
                className={`rounded-xl border transition-colors bg-white dark:bg-[#111114] ${
                  selected.sceneBreakdown && availability.sceneBreakdown
                    ? "border-[#F2B705]/70"
                    : "border-zinc-200 dark:border-zinc-800"
                }`}
              >
                <div className="flex items-start gap-3.5 p-4 sm:p-5">
                  <input
                    id="export-check-breakdown"
                    type="checkbox"
                    checked={
                      selected.sceneBreakdown && availability.sceneBreakdown
                    }
                    disabled={!availability.sceneBreakdown || isExporting}
                    onChange={() => toggleItem("sceneBreakdown")}
                    className="mt-1 h-4 w-4 rounded border-zinc-400 dark:border-zinc-600 accent-[#F2B705] cursor-pointer disabled:cursor-not-allowed shrink-0"
                  />

                  <div className="min-w-0 flex-1 space-y-2.5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <label
                        htmlFor="export-check-breakdown"
                        className={`flex items-center gap-2.5 min-w-0 ${
                          availability.sceneBreakdown
                            ? "cursor-pointer"
                            : "opacity-65"
                        }`}
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 dark:bg-[#18181B] text-amber-600 dark:text-[#F2B705]">
                          <Clapperboard className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <span className="block text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                            3. Scene Breakdown
                          </span>
                          <span className="block font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                            scene breakdown.txt · Numbered Scene Beat Breakdown
                          </span>
                        </div>
                      </label>

                      <div className="flex items-center gap-2 shrink-0">
                        {availability.sceneBreakdown ? (
                          <>
                            <span className="inline-flex items-center gap-1 font-mono text-[11px] font-medium text-emerald-700 dark:text-emerald-400 tabular-nums">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              {breakdownState?.beats.length ?? 0} scenes
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedPreview((prev) => ({
                                  ...prev,
                                  sceneBreakdown: !prev.sceneBreakdown,
                                }))
                              }
                              className="inline-flex h-7 items-center gap-1 rounded border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#18181B] px-2 text-[11px] font-medium text-zinc-600 dark:text-zinc-300 hover:border-[#F2B705]"
                            >
                              {expandedPreview.sceneBreakdown ? (
                                <EyeOff className="h-3 w-3" />
                              ) : (
                                <Eye className="h-3 w-3" />
                              )}
                              Preview
                            </button>
                            <button
                              type="button"
                              title="Download scene breakdown.txt individually"
                              onClick={() => {
                                void handleDownloadSingleItem("sceneBreakdown");
                              }}
                              disabled={isExporting}
                              className="inline-flex h-7 w-7 items-center justify-center rounded border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#18181B] text-zinc-600 dark:text-zinc-300 hover:border-[#F2B705] hover:text-amber-600 dark:hover:text-[#F2B705]"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onNavigate("breakdown")}
                            className="inline-flex h-7 items-center gap-1 rounded border border-zinc-300 dark:border-zinc-700 px-2.5 text-[11px] font-medium text-zinc-600 dark:text-zinc-400 hover:border-[#F2B705] hover:text-amber-700 dark:hover:text-[#F2B705]"
                          >
                            Not ready · Open Scene Breakdown
                            <ArrowUpRight className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    {expandedPreview.sceneBreakdown &&
                      availability.sceneBreakdown && (
                        <pre className="max-h-44 overflow-y-auto whitespace-pre-wrap rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] p-3 font-mono text-[11px] leading-relaxed text-zinc-700 dark:text-zinc-300">
                          {sceneBreakdownTextContent.slice(0, 1400)}
                          {sceneBreakdownTextContent.length > 1400 ? "\n…" : ""}
                        </pre>
                      )}
                  </div>
                </div>
              </div>

              {/* 4. Scene Image & Video Prompts — scene prompts.txt */}
              <div
                className={`rounded-xl border transition-colors bg-white dark:bg-[#111114] ${
                  selected.scenePrompts && availability.scenePrompts
                    ? "border-[#F2B705]/70"
                    : "border-zinc-200 dark:border-zinc-800"
                }`}
              >
                <div className="flex items-start gap-3.5 p-4 sm:p-5">
                  <input
                    id="export-check-prompts"
                    type="checkbox"
                    checked={selected.scenePrompts && availability.scenePrompts}
                    disabled={!availability.scenePrompts || isExporting}
                    onChange={() => toggleItem("scenePrompts")}
                    className="mt-1 h-4 w-4 rounded border-zinc-400 dark:border-zinc-600 accent-[#F2B705] cursor-pointer disabled:cursor-not-allowed shrink-0"
                  />

                  <div className="min-w-0 flex-1 space-y-2.5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <label
                        htmlFor="export-check-prompts"
                        className={`flex items-center gap-2.5 min-w-0 ${
                          availability.scenePrompts
                            ? "cursor-pointer"
                            : "opacity-65"
                        }`}
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 dark:bg-[#18181B] text-amber-600 dark:text-[#F2B705]">
                          <Sparkles className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <span className="block text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                            4. Scene Image &amp; Video Prompts
                          </span>
                          <span className="block font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                            scene prompts.txt · Scene Number, Image Prompt &amp;
                            Video Prompt (if available)
                          </span>
                        </div>
                      </label>

                      <div className="flex items-center gap-2 shrink-0">
                        {availability.scenePrompts ? (
                          <>
                            <span className="inline-flex items-center gap-1 font-mono text-[11px] font-medium text-emerald-700 dark:text-emerald-400 tabular-nums">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              {promptMetrics.total} image ·{" "}
                              {promptMetrics.withVideo} video
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedPreview((prev) => ({
                                  ...prev,
                                  scenePrompts: !prev.scenePrompts,
                                }))
                              }
                              className="inline-flex h-7 items-center gap-1 rounded border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#18181B] px-2 text-[11px] font-medium text-zinc-600 dark:text-zinc-300 hover:border-[#F2B705]"
                            >
                              {expandedPreview.scenePrompts ? (
                                <EyeOff className="h-3 w-3" />
                              ) : (
                                <Eye className="h-3 w-3" />
                              )}
                              Preview
                            </button>
                            <button
                              type="button"
                              title="Download scene prompts.txt individually"
                              onClick={() => {
                                void handleDownloadSingleItem("scenePrompts");
                              }}
                              disabled={isExporting}
                              className="inline-flex h-7 w-7 items-center justify-center rounded border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#18181B] text-zinc-600 dark:text-zinc-300 hover:border-[#F2B705] hover:text-amber-600 dark:hover:text-[#F2B705]"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onNavigate("breakdown")}
                            className="inline-flex h-7 items-center gap-1 rounded border border-zinc-300 dark:border-zinc-700 px-2.5 text-[11px] font-medium text-zinc-600 dark:text-zinc-400 hover:border-[#F2B705] hover:text-amber-700 dark:hover:text-[#F2B705]"
                          >
                            Not ready · Open Scene Breakdown
                            <ArrowUpRight className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    {expandedPreview.scenePrompts &&
                      availability.scenePrompts && (
                        <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] p-3 font-mono text-[11px] leading-relaxed text-zinc-700 dark:text-zinc-300">
                          {scenePromptsTextContent.slice(0, 1800)}
                          {scenePromptsTextContent.length > 1800 ? "\n…" : ""}
                        </pre>
                      )}
                  </div>
                </div>
              </div>

              {/* 5. Storyboard Images — images.zip */}
              <div
                className={`rounded-xl border transition-colors bg-white dark:bg-[#111114] ${
                  selected.storyboardImages && availability.storyboardImages
                    ? "border-[#F2B705]/70"
                    : "border-zinc-200 dark:border-zinc-800"
                }`}
              >
                <div className="flex items-start gap-3.5 p-4 sm:p-5">
                  <input
                    id="export-check-images"
                    type="checkbox"
                    checked={
                      selected.storyboardImages && availability.storyboardImages
                    }
                    disabled={!availability.storyboardImages || isExporting}
                    onChange={() => toggleItem("storyboardImages")}
                    className="mt-1 h-4 w-4 rounded border-zinc-400 dark:border-zinc-600 accent-[#F2B705] cursor-pointer disabled:cursor-not-allowed shrink-0"
                  />

                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <label
                        htmlFor="export-check-images"
                        className={`flex items-center gap-2.5 min-w-0 ${
                          availability.storyboardImages
                            ? "cursor-pointer"
                            : "opacity-65"
                        }`}
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 dark:bg-[#18181B] text-amber-600 dark:text-[#F2B705]">
                          <Images className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <span className="block text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                            5. Storyboard Images
                          </span>
                          <span className="block font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                            images.zip · All generated batches packaged as an
                            inner ZIP
                          </span>
                        </div>
                      </label>

                      <div className="flex items-center gap-2 shrink-0">
                        {availability.storyboardImages ? (
                          <>
                            <span className="inline-flex items-center gap-1 font-mono text-[11px] font-medium text-emerald-700 dark:text-emerald-400 tabular-nums">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              {allStoryboardImages.length} image
                              {allStoryboardImages.length === 1 ? "" : "s"} ·{" "}
                              {batchCount} batch{batchCount === 1 ? "" : "es"}
                            </span>
                            <button
                              type="button"
                              title="Download images.zip individually"
                              onClick={() => {
                                void handleDownloadSingleItem(
                                  "storyboardImages"
                                );
                              }}
                              disabled={isExporting}
                              className="inline-flex h-7 w-7 items-center justify-center rounded border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#18181B] text-zinc-600 dark:text-zinc-300 hover:border-[#F2B705] hover:text-amber-600 dark:hover:text-[#F2B705]"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onNavigate("storyboard")}
                            className="inline-flex h-7 items-center gap-1 rounded border border-zinc-300 dark:border-zinc-700 px-2.5 text-[11px] font-medium text-zinc-600 dark:text-zinc-400 hover:border-[#F2B705] hover:text-amber-700 dark:hover:text-[#F2B705]"
                          >
                            Not ready · Open Storyboard
                            <ArrowUpRight className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    {availability.storyboardImages && (
                      <div className="flex items-center gap-2 overflow-x-auto pb-1">
                        {allStoryboardImages.slice(0, 6).map((img) => (
                          <div
                            key={img.sceneNumber}
                            className="relative h-14 w-20 shrink-0 overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-[#09090B]"
                          >
                            <img
                              src={img.imageDataUrl}
                              alt={`Scene ${img.sceneNumber}`}
                              className="h-full w-full object-cover"
                            />
                            <span className="absolute bottom-0.5 right-0.5 rounded bg-black/75 px-1 py-0.5 font-mono text-[9px] text-white tabular-nums">
                              #{img.sceneNumber}
                            </span>
                          </div>
                        ))}
                        {allStoryboardImages.length > 6 && (
                          <span className="inline-flex h-14 shrink-0 items-center justify-center rounded-md border border-dashed border-zinc-300 dark:border-zinc-700 px-3 font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                            +{allStoryboardImages.length - 6} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Right: Master ZIP Packaging & Export Card */}
        <aside className="lg:col-span-4 lg:sticky lg:top-20 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] overflow-hidden">
          <div className="border-b border-zinc-200 dark:border-zinc-800 px-5 py-4">
            <div className="flex items-center gap-2.5">
              <FolderArchive className="h-4 w-4 text-amber-600 dark:text-[#F2B705] shrink-0" />
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Master ZIP Package
              </h2>
            </div>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Defaults to today’s date and time, or enter a custom name below.
            </p>
          </div>

          <div className="p-5 space-y-5">
            {/* Filename Input */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="master-zip-filename"
                  className="text-xs font-semibold text-zinc-800 dark:text-zinc-200"
                >
                  Archive Name
                </label>
                <button
                  type="button"
                  onClick={handleResetFilenameToNow}
                  disabled={isExporting}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-[#F2B705] hover:underline disabled:opacity-40"
                >
                  <Clock className="h-3 w-3" />
                  Use current date &amp; time
                </button>
              </div>

              <div className="flex items-center rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#09090B] focus-within:border-[#F2B705] focus-within:ring-2 focus-within:ring-[#F2B705]/25 overflow-hidden">
                <input
                  id="master-zip-filename"
                  type="text"
                  value={customFilename}
                  disabled={isExporting}
                  onChange={(e) => {
                    setCustomFilename(e.target.value);
                    setHasEditedFilename(true);
                  }}
                  placeholder={buildDefaultDateTimeName()}
                  className="min-w-0 flex-1 bg-transparent px-3 py-2.5 font-mono text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none"
                />
                <span className="border-l border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-[#18181B] px-2.5 py-2.5 font-mono text-xs font-medium text-zinc-500 dark:text-zinc-400 shrink-0">
                  .zip
                </span>
              </div>
            </div>

            {/* Contents Manifest */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                  Files Included
                </span>
                <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                  {manifestFiles.length} / 5 selected
                </span>
              </div>

              {manifestFiles.length === 0 ? (
                <div className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#09090B] p-4 text-center text-xs text-zinc-500 dark:text-zinc-400">
                  Check one or more ready assets on the left to build your
                  export archive.
                </div>
              ) : (
                <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] p-3 space-y-2">
                  <div className="flex items-center gap-2 font-mono text-[11px] font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                    <Package className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-[#F2B705]" />
                    <span className="truncate">{resolvedMasterZipFilename}</span>
                  </div>
                  <ul className="space-y-1.5 border-l border-zinc-300 dark:border-zinc-700 ml-1.5 pl-3">
                    {manifestFiles.map((item) => (
                      <li
                        key={item.filename}
                        className="flex items-center justify-between gap-2 text-[11px]"
                      >
                        <span className="inline-flex items-center gap-1.5 font-mono text-zinc-800 dark:text-zinc-200 truncate">
                          {item.filename.endsWith(".wav") ? (
                            <FileAudio className="h-3 w-3 shrink-0 text-zinc-500" />
                          ) : item.filename.endsWith(".zip") ? (
                            <ImageIcon className="h-3 w-3 shrink-0 text-zinc-500" />
                          ) : (
                            <FileText className="h-3 w-3 shrink-0 text-zinc-500" />
                          )}
                          <span className="truncate">{item.filename}</span>
                        </span>
                        <span className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400 shrink-0 tabular-nums">
                          {item.detail}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Export Button */}
            <button
              type="button"
              onClick={() => {
                void handleExportMasterZip();
              }}
              disabled={selectedCount === 0 || isExporting || isLoading}
              className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-lg bg-[#F2B705] px-4 py-2.5 text-sm font-semibold text-[#09090B] hover:bg-[#f7c52a] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {isExporting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                  <span className="truncate">
                    {exportStatusLabel || "Exporting…"}
                  </span>
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 shrink-0" />
                  <span>
                    Export All ({selectedCount}{" "}
                    {selectedCount === 1 ? "item" : "items"})
                  </span>
                </>
              )}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
