import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Archive,
  ArrowRight,
  CheckCircle2,
  Layers,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  Undo2,
} from "lucide-react";
import { BatchNavigator } from "./components/BatchNavigator";
import { BriefModal } from "./components/BriefModal";
import { BulkImportView } from "./components/BulkImportView";
import { ExportAllView } from "./components/ExportAllView";
import { LightboxModal } from "./components/LightboxModal";
import { NarrationView } from "./components/NarrationView";
import { PresetsView } from "./components/PresetsView";
import { SceneBreakdownView } from "./components/SceneBreakdownView";
import { SceneCard } from "./components/SceneCard";
import { ScriptWriterView } from "./components/ScriptWriterView";
import { SequenceConfigView } from "./components/SequenceConfigView";
import { TopBar } from "./components/TopBar";
import { WorkflowPipeline } from "./components/WorkflowPipeline";
import {
  DEFAULT_PRESETS,
  MAX_BATCH_SCENES,
  MAX_TOTAL_PROMPTS,
} from "./data/defaultPresets";
import type {
  BatchSettings,
  InstructionPreset,
  MasterPromptReview,
  ReferenceImage,
  SceneFilter,
  SceneItem,
  SequenceBatch,
  StudioView,
  ToastMessage,
} from "./types/studio";
import {
  clearAllAppCache,
  clearAllCachedBatches,
  clearReferenceDirectoryLocal,
  deleteBatchFromCache,
  loadAllCachedScenes,
  loadBatchScenesFromCache,
  loadReferenceDirectoryLocal,
  loadSelectedBatchesFromCache,
  removeBatchAndShiftCache,
  saveBatchScenesToCache,
  saveReferenceDirectoryLocal,
} from "./utils/batchCache";
import {
  downloadEntriesAsZip,
  downloadSingleScene,
} from "./utils/promptParser";
import type {
  ExportableImageEntry,
  ParsedSceneDraft,
} from "./utils/promptParser";

const STORAGE_PRESETS_KEY = "sceneroll_presets_v4";
const LEGACY_PRESETS_KEY = "sceneroll_presets_v3";
const STORAGE_SETTINGS_KEY = "sceneroll_settings_v3";

function createEmptyScene(): SceneItem {
  return {
    id: `scene-${crypto.randomUUID()}`,
    prompt: "",
    useReferenceCharacter: true,
    status: "idle",
  };
}

function createInitialScenes(count = 4): SceneItem[] {
  return Array.from({ length: count }, () => createEmptyScene());
}

function scenesToSingleBatch(
  scenes: SceneItem[],
  startNumber: number,
  batchIndex = 0
): SequenceBatch {
  const completedCount = scenes.filter(
    (s) => s.status === "completed" && Boolean(s.imageDataUrl)
  ).length;
  const failedCount = scenes.filter((s) => s.status === "error").length;

  return {
    batchIndex,
    startNumber,
    prompts: scenes.map((s) => ({
      id: s.id,
      prompt: s.prompt,
      narration: s.narration,
    })),
    completedCount,
    failedCount,
    isCached: completedCount > 0,
  };
}

function loadStoredPresets(): InstructionPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_PRESETS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
    // Migrate custom user presets from v3 while refreshing built-in Director's Brief prompts
    const legacyRaw = localStorage.getItem(LEGACY_PRESETS_KEY);
    if (legacyRaw) {
      const legacyParsed = JSON.parse(legacyRaw);
      if (Array.isArray(legacyParsed)) {
        const builtInIds = new Set(DEFAULT_PRESETS.map((p) => p.id));
        const customPresets = legacyParsed.filter(
          (p: InstructionPreset) => p && p.id && !builtInIds.has(p.id)
        );
        return [...DEFAULT_PRESETS, ...customPresets];
      }
    }
  } catch {
    // Fall back to default presets
  }
  return DEFAULT_PRESETS;
}

function loadStoredSettings(presets: InstructionPreset[]): BatchSettings {
  const fallback: BatchSettings = {
    activePresetId: presets[0]?.id ?? DEFAULT_PRESETS[0].id,
    aspectRatio: presets[0]?.defaultAspectRatio ?? "16:9",
    model: "gemini-3.1-flash-lite-image",
    imageSize: "1K",
    concurrency: 2,
    startNumber: 1,
    lastUsedSceneNumber: 0,
    targetImageCount: 20,
    theme: "dark",
    autoGenerateNextSequence: false,
  };

  try {
    const raw = localStorage.getItem(STORAGE_SETTINGS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<BatchSettings>;
    const validPresetId = presets.some((p) => p.id === parsed.activePresetId)
      ? (parsed.activePresetId as string)
      : fallback.activePresetId;
    const validTheme =
      parsed.theme === "light" ||
      parsed.theme === "dark" ||
      parsed.theme === "system"
        ? parsed.theme
        : fallback.theme;
    return {
      ...fallback,
      ...parsed,
      activePresetId: validPresetId,
      theme: validTheme,
      autoGenerateNextSequence: Boolean(parsed.autoGenerateNextSequence),
      startNumber:
        typeof parsed.startNumber === "number" && parsed.startNumber >= 1
          ? Math.floor(parsed.startNumber)
          : 1,
      lastUsedSceneNumber:
        typeof parsed.lastUsedSceneNumber === "number" &&
        parsed.lastUsedSceneNumber >= 0
          ? Math.floor(parsed.lastUsedSceneNumber)
          : 0,
      targetImageCount:
        typeof parsed.targetImageCount === "number" &&
        parsed.targetImageCount >= 1
          ? Math.min(MAX_TOTAL_PROMPTS, Math.floor(parsed.targetImageCount))
          : 20,
    };
  } catch {
    return fallback;
  }
}

function computeReviewSignature(
  preset: InstructionPreset,
  refImg: ReferenceImage | null
): string {
  return [
    preset.id,
    preset.instructions.trim(),
    preset.negativeRules.trim(),
    refImg
      ? `${refImg.name}:${refImg.data.slice(0, 64)}:${refImg.characterNotes}`
      : "no-ref",
  ].join("|");
}

export default function App() {
  const [presets, setPresets] = useState<InstructionPreset[]>(loadStoredPresets);
  const [settings, setSettings] = useState<BatchSettings>(() =>
    loadStoredSettings(loadStoredPresets())
  );

  // Multi-batch queue (up to 10 batches × 20 = 200 images) + active batch live scenes
  const [scenes, setScenes] = useState<SceneItem[]>(() =>
    createInitialScenes(4)
  );
  const [batches, setBatches] = useState<SequenceBatch[]>(() => [
    scenesToSingleBatch(createInitialScenes(4), 1, 0),
  ]);
  const [activeBatchIndex, setActiveBatchIndex] = useState(0);
  const [selectedBatchIndices, setSelectedBatchIndices] = useState<number[]>(
    []
  );

  const [referenceImage, setReferenceImage] = useState<ReferenceImage | null>(
    null
  );
  const referenceSyncPromiseRef = useRef<Promise<void>>(Promise.resolve());

  // Director's Brief review state
  const [review, setReview] = useState<MasterPromptReview | null>(null);
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [isBriefModalOpen, setIsBriefModalOpen] = useState(false);

  const [activeView, setActiveView] = useState<StudioView>("script");
  const [filter, setFilter] = useState<SceneFilter>("all");
  const [lightboxSceneId, setLightboxSceneId] = useState<string | null>(null);
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [batchPhaseLabel, setBatchPhaseLabel] = useState<string | null>(null);
  const [stoppedAtSceneNumber, setStoppedAtSceneNumber] = useState<
    number | null
  >(null);
  const [completedBannerBatchIndex, setCompletedBannerBatchIndex] = useState<
    number | null
  >(null);
  const [pendingAutoBatchIndex, setPendingAutoBatchIndex] = useState<
    number | null
  >(null);
  const [isZipping, setIsZipping] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const abortControllerRef = useRef<AbortController | null>(null);
  const suppressAbortCleanupRef = useRef<boolean>(false);
  const scenesRef = useRef<SceneItem[]>(scenes);
  scenesRef.current = scenes;
  const batchesRef = useRef<SequenceBatch[]>(batches);
  batchesRef.current = batches;
  const activeBatchIndexRef = useRef<number>(activeBatchIndex);
  activeBatchIndexRef.current = activeBatchIndex;
  const autoGenerateNextRef = useRef<boolean>(
    settings.autoGenerateNextSequence
  );
  autoGenerateNextRef.current = settings.autoGenerateNextSequence;

  // Keep active batch metadata synced & hydrate common Master Stickman Reference Directory on mount
  useEffect(() => {
    setBatches([
      scenesToSingleBatch(scenesRef.current, settings.startNumber, 0),
    ]);

    let cancelled = false;
    const hydrateReferenceDirectory = async () => {
      try {
        const res = await fetch("/api/reference-directory");
        if (res.ok) {
          const payload = await res.json();
          if (!cancelled && payload?.exists && payload?.reference?.data) {
            const ref = payload.reference;
            const restored: ReferenceImage = {
              name: ref.name || "master-stickman.png",
              characterName: ref.characterName || "Master Stickman",
              characterNotes: ref.characterNotes || "",
              mimeType: ref.mimeType || "image/png",
              data: ref.data,
              previewUrl: `data:${ref.mimeType || "image/png"};base64,${ref.data}`,
            };
            setReferenceImage(restored);
            void saveReferenceDirectoryLocal(restored).catch(() => undefined);
            return;
          }
        }
      } catch {
        // Fallback to local IndexedDB copy
      }

      try {
        const localRef = await loadReferenceDirectoryLocal();
        if (!cancelled && localRef) {
          setReferenceImage(localRef);
          // Re-sync local copy straight into the server's common reference directory
          const syncTask = fetch("/api/reference-directory", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: localRef.name,
              characterName: localRef.characterName,
              characterNotes: localRef.characterNotes,
              mimeType: localRef.mimeType,
              data: localRef.data,
            }),
          })
            .then(() => undefined)
            .catch(() => undefined);
          referenceSyncPromiseRef.current = syncTask;
        }
      } catch {
        // Ignore IndexedDB unavailability
      }
    };

    void hydrateReferenceDirectory();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activePreset = useMemo(
    () =>
      presets.find((p) => p.id === settings.activePresetId) ??
      presets[0] ??
      DEFAULT_PRESETS[0],
    [presets, settings.activePresetId]
  );

  const currentReviewSignature = useMemo(
    () => computeReviewSignature(activePreset, referenceImage),
    [activePreset, referenceImage]
  );

  const isReviewCurrent = Boolean(
    review && review.signature === currentReviewSignature
  );

  const currentBatch = batches[activeBatchIndex] ?? batches[0];
  const currentBatchStartNumber =
    currentBatch?.startNumber ?? settings.startNumber;

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_PRESETS_KEY, JSON.stringify(presets));
    } catch {
      // Ignore storage quota errors
    }
  }, [presets]);

  const [resolvedTheme, setResolvedTheme] = useState<"dark" | "light">(() => {
    if (settings.theme === "light" || settings.theme === "dark") {
      return settings.theme;
    }
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: light)").matches
    ) {
      return "light";
    }
    return "dark";
  });

  useEffect(() => {
    const applyTheme = () => {
      const next: "dark" | "light" =
        settings.theme === "light" || settings.theme === "dark"
          ? settings.theme
          : window.matchMedia("(prefers-color-scheme: light)").matches
            ? "light"
            : "dark";
      document.documentElement.dataset.theme = next;
      setResolvedTheme(next);
    };

    applyTheme();
    try {
      localStorage.setItem("frameforge_theme", settings.theme);
    } catch {
      // Ignore storage errors
    }

    if (settings.theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: light)");
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [settings.theme]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // Ignore storage quota errors
    }
  }, [settings]);

  const pushToast = useCallback(
    (text: string, tone: ToastMessage["tone"] = "neutral") => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev.slice(-2), { id, text, tone }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4200);
    },
    []
  );

  // Sync active batch summary metadata cleanly whenever `scenes` mutates
  const syncActiveBatchMeta = useCallback(
    (nextScenes: SceneItem[], batchIdx: number, startNum: number) => {
      const completedCount = nextScenes.filter(
        (s) => s.status === "completed" && Boolean(s.imageDataUrl)
      ).length;
      const failedCount = nextScenes.filter((s) => s.status === "error").length;

      setBatches((prev) =>
        prev.map((b) =>
          b.batchIndex === batchIdx
            ? {
                ...b,
                startNumber: startNum,
                prompts: nextScenes.map((s) => ({
                  id: s.id,
                  prompt: s.prompt,
                  narration: s.narration,
                })),
                completedCount,
                failedCount,
                isCached: b.isCached || completedCount > 0,
              }
            : b
        )
      );
    },
    []
  );

  const stats = useMemo(() => {
    let populated = 0;
    let completed = 0;
    let generating = 0;
    let queued = 0;
    let failed = 0;
    let unfinishedPopulated = 0;

    for (const s of scenes) {
      const hasPrompt = s.prompt.trim().length > 0;
      if (hasPrompt) populated += 1;
      if (s.status === "completed" && s.imageDataUrl) completed += 1;
      else if (hasPrompt) unfinishedPopulated += 1;
      if (s.status === "generating") generating += 1;
      if (s.status === "queued") queued += 1;
      if (s.status === "error") failed += 1;
    }

    return {
      total: scenes.length,
      populated,
      completed,
      generating,
      queued,
      failed,
      unfinishedPopulated,
      pending: scenes.length - completed - failed,
    };
  }, [scenes]);

  const multiBatchTotals = useMemo(() => {
    let totalCachedImages = 0;
    let totalQueuedPrompts = 0;
    for (const b of batches) {
      totalCachedImages += b.completedCount;
      totalQueuedPrompts += b.prompts.filter(
        (p) => p.prompt.trim().length > 0
      ).length;
    }
    const allBatchesDone =
      batches.length > 0 &&
      totalQueuedPrompts > 0 &&
      totalCachedImages >= totalQueuedPrompts;
    return { totalCachedImages, totalQueuedPrompts, allBatchesDone };
  }, [batches]);

  // Step 1: Review Director's Brief & inspect Common Master Stickman Reference Directory
  const runMasterPromptReview = useCallback(
    async (
      signal?: AbortSignal,
      force = false
    ): Promise<MasterPromptReview | null> => {
      if (!force && review && review.signature === currentReviewSignature) {
        return review;
      }

      setIsReviewing(true);
      setReviewError(null);
      setBatchPhaseLabel(
        "Reviewing Director's Brief & syncing Master Stickman Reference Directory…"
      );

      try {
        await referenceSyncPromiseRef.current;

        const response = await fetch("/api/review-master-prompt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal,
          body: JSON.stringify({
            masterPrompt: activePreset.instructions,
            negativeRules: activePreset.negativeRules,
            characterName: referenceImage?.characterName ?? "",
            characterNotes: referenceImage?.characterNotes ?? "",
          }),
        });

        const payload = await response.json();
        if (!response.ok) {
          throw new Error(
            payload?.error || "Failed to review the Director's Brief."
          );
        }

        const nextReview: MasterPromptReview = {
          styleLock: payload.styleLock || "Reference art style locked.",
          characterProfile: payload.characterProfile || "",
          activeRules: Array.isArray(payload.activeRules)
            ? payload.activeRules
            : [],
          readyForBatch: payload.readyForBatch !== false,
          reviewedWithReference: Boolean(payload.reviewedWithReference),
          reviewedAt: payload.reviewedAt || Date.now(),
          signature: currentReviewSignature,
        };

        setReview(nextReview);
        if (force) {
          pushToast("Director's Brief reviewed and verified", "success");
        }
        return nextReview;
      } catch (err) {
        if (signal?.aborted) {
          return null;
        }
        const msg =
          err instanceof Error
            ? err.message
            : "Director's Brief review encountered an error.";
        setReviewError(msg);
        pushToast(msg, "error");
        return null;
      } finally {
        setIsReviewing(false);
      }
    },
    [
      activePreset,
      currentReviewSignature,
      pushToast,
      referenceImage,
      review,
    ]
  );

  // Preset handlers
  const handleSelectPreset = (presetId: string) => {
    const found = presets.find((p) => p.id === presetId);
    setSettings((prev) => ({
      ...prev,
      activePresetId: presetId,
      aspectRatio: found?.defaultAspectRatio ?? prev.aspectRatio,
    }));
  };

  const handleUpdatePreset = (
    id: string,
    patch: Partial<Omit<InstructionPreset, "id">>
  ) => {
    setPresets((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p
      )
    );
  };

  const handleCreateBlankPreset = (): string => {
    const newPreset: InstructionPreset = {
      id: `preset-${crypto.randomUUID()}`,
      name: `Custom Director's Brief ${presets.length + 1}`,
      summary: "Reusable continuity & character workflow brief.",
      instructions: activePreset.instructions,
      negativeRules: activePreset.negativeRules,
      defaultAspectRatio: "16:9",
      updatedAt: Date.now(),
    };
    setPresets((prev) => [newPreset, ...prev]);
    pushToast(`Created “${newPreset.name}”`, "success");
    return newPreset.id;
  };

  const handleDuplicatePreset = (id: string): string => {
    const source = presets.find((p) => p.id === id);
    if (!source) return id;
    const copy: InstructionPreset = {
      ...source,
      id: `preset-${crypto.randomUUID()}`,
      name: `${source.name} (Copy)`,
      isBuiltIn: false,
      updatedAt: Date.now(),
    };
    setPresets((prev) => [copy, ...prev]);
    pushToast(`Duplicated “${source.name}”`, "success");
    return copy.id;
  };

  const handleDeletePreset = (id: string) => {
    if (presets.length <= 1) return;
    const remaining = presets.filter((p) => p.id !== id);
    setPresets(remaining);
    if (settings.activePresetId === id) {
      setSettings((prev) => ({ ...prev, activePresetId: remaining[0].id }));
    }
    pushToast("Preset deleted", "neutral");
  };

  const handleResetDefaultPresets = () => {
    setPresets(DEFAULT_PRESETS);
    setSettings((prev) => ({
      ...prev,
      activePresetId: DEFAULT_PRESETS[0].id,
      aspectRatio: DEFAULT_PRESETS[0].defaultAspectRatio,
    }));
    pushToast("Default Director's Brief restored", "neutral");
  };

  const handleImportPresets = (imported: InstructionPreset[]) => {
    setPresets((prev) => {
      const existingIds = new Set(prev.map((p) => p.id));
      const merged = [
        ...imported.map((item) =>
          existingIds.has(item.id)
            ? { ...item, id: `preset-${crypto.randomUUID()}` }
            : item
        ),
        ...prev,
      ];
      return merged;
    });
    pushToast(`Imported ${imported.length} preset(s)`, "success");
  };

  // Common Master Stickman Reference Directory handlers (persisted in server directory + IndexedDB)
  const handleSetReferenceImage = (img: ReferenceImage | null) => {
    setReferenceImage(img);
    if (img) {
      void saveReferenceDirectoryLocal(img).catch(() => undefined);
      const syncTask = fetch("/api/reference-directory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: img.name,
          characterName: img.characterName,
          characterNotes: img.characterNotes,
          mimeType: img.mimeType,
          data: img.data,
        }),
      })
        .then(() => undefined)
        .catch(() => undefined);
      referenceSyncPromiseRef.current = syncTask;
      pushToast(
        `Saved “${img.name}” into Master Stickman Reference Directory`,
        "success"
      );
    } else {
      void clearReferenceDirectoryLocal().catch(() => undefined);
      const clearTask = fetch("/api/reference-directory", {
        method: "DELETE",
      })
        .then(() => undefined)
        .catch(() => undefined);
      referenceSyncPromiseRef.current = clearTask;
      pushToast("Removed file from Master Stickman Reference Directory", "neutral");
    }
  };

  const handleUpdateReferenceMeta = (
    patch: Partial<Pick<ReferenceImage, "characterName" | "characterNotes">>
  ) => {
    setReferenceImage((prev) => {
      if (!prev) return null;
      const updated = { ...prev, ...patch };
      void saveReferenceDirectoryLocal(updated).catch(() => undefined);
      const syncTask = fetch("/api/reference-directory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterName: updated.characterName,
          characterNotes: updated.characterNotes,
        }),
      })
        .then(() => undefined)
        .catch(() => undefined);
      referenceSyncPromiseRef.current = syncTask;
      return updated;
    });
  };

  // Cache + sequence reset (clears all app IndexedDB stores & server reference cache)
  const handleClearLocalCache = async () => {
    if (isBatchRunning) return;
    try {
      await Promise.all([
        clearAllAppCache(),
        clearAllCachedBatches().catch(() => undefined),
        fetch("/api/reference-directory", { method: "DELETE" }).catch(
          () => undefined
        ),
      ]);
      setReferenceImage(null);
      const fresh = createInitialScenes(4);
      setScenes(fresh);
      setBatches([scenesToSingleBatch(fresh, 1, 0)]);
      setActiveBatchIndex(0);
      setSelectedBatchIndices([]);
      setCompletedBannerBatchIndex(null);
      setStoppedAtSceneNumber(null);
      setSettings((prev) => ({
        ...prev,
        startNumber: 1,
        lastUsedSceneNumber: 0,
      }));
      pushToast(
        "All app caches cleared (scripts, narration, breakdown, images & reference)",
        "neutral"
      );
    } catch {
      pushToast("Could not clear local cache.", "error");
    }
  };

  const handleResetSequenceCounter = () => {
    setSettings((prev) => ({
      ...prev,
      startNumber: 1,
      lastUsedSceneNumber: 0,
    }));
    setBatches((prev) =>
      prev.map((b, idx) => ({
        ...b,
        startNumber: 1 + idx * MAX_BATCH_SCENES,
      }))
    );
    setCompletedBannerBatchIndex(null);
    setStoppedAtSceneNumber(null);
    pushToast("Running sequence reset to 1", "neutral");
  };

  // Cancel & reset a specific batch back to pending (clears its cached images, keeps prompts)
  const handleResetSingleBatch = async (batchIdx: number) => {
    const targetBatch = batchesRef.current[batchIdx];
    if (!targetBatch) return;

    const wasRunningThis =
      isBatchRunning && activeBatchIndexRef.current === batchIdx;
    if (wasRunningThis) {
      suppressAbortCleanupRef.current = true;
      setPendingAutoBatchIndex(null);
      abortControllerRef.current?.abort();
    }

    await deleteBatchFromCache(batchIdx).catch(() => undefined);

    setBatches((prev) =>
      prev.map((b) =>
        b.batchIndex === batchIdx
          ? {
              ...b,
              completedCount: 0,
              failedCount: 0,
              isCached: false,
              lastCachedAt: undefined,
            }
          : b
      )
    );
    setSelectedBatchIndices((prev) => prev.filter((idx) => idx !== batchIdx));

    if (activeBatchIndexRef.current === batchIdx) {
      setScenes((prev) =>
        prev.map((scene) => ({
          id: scene.id,
          prompt: scene.prompt,
          narration: scene.narration,
          useReferenceCharacter: true,
          status: "idle",
        }))
      );
      setCompletedBannerBatchIndex(null);
      setStoppedAtSceneNumber(null);
      setFilter("all");
    }

    pushToast(
      wasRunningThis
        ? `Batch ${batchIdx + 1} cancelled and reset`
        : `Batch ${batchIdx + 1} reset to pending`,
      "neutral"
    );
  };

  // Remove a specific batch from the queue completely (cancels if running & removes its cache)
  const handleRemoveBatch = async (removeIdx: number) => {
    const currentList = batchesRef.current;
    if (removeIdx < 0 || removeIdx >= currentList.length) return;

    const wasRunningThis =
      isBatchRunning && activeBatchIndexRef.current === removeIdx;
    if (wasRunningThis) {
      suppressAbortCleanupRef.current = true;
      setPendingAutoBatchIndex(null);
      abortControllerRef.current?.abort();
    } else if (isBatchRunning && removeIdx < activeBatchIndexRef.current) {
      // Avoid shifting active batch index while another batch is actively writing
      pushToast(
        "Pause the running batch before removing an earlier batch.",
        "error"
      );
      return;
    }

    await removeBatchAndShiftCache(removeIdx).catch(() => undefined);

    const remaining = currentList
      .filter((_, idx) => idx !== removeIdx)
      .map((b, newIdx) => ({
        ...b,
        batchIndex: newIdx,
      }));

    setSelectedBatchIndices((prev) =>
      prev
        .filter((idx) => idx !== removeIdx)
        .map((idx) => (idx > removeIdx ? idx - 1 : idx))
    );

    if (remaining.length === 0) {
      const fresh = createInitialScenes(4);
      setBatches([scenesToSingleBatch(fresh, settings.startNumber, 0)]);
      setActiveBatchIndex(0);
      setScenes(fresh);
      setCompletedBannerBatchIndex(null);
      setStoppedAtSceneNumber(null);
      setFilter("all");
      pushToast(`Removed Batch ${removeIdx + 1} from queue`, "neutral");
      return;
    }

    setBatches(remaining);

    const currentActive = activeBatchIndexRef.current;
    if (removeIdx === currentActive) {
      const nextActiveIdx = Math.min(removeIdx, remaining.length - 1);
      const nextBatch = remaining[nextActiveIdx];
      const hydrated = await hydrateBatchForView(nextBatch);
      setActiveBatchIndex(nextActiveIdx);
      setScenes(hydrated);
      setCompletedBannerBatchIndex(null);
      setStoppedAtSceneNumber(null);
      setFilter("all");
    } else if (removeIdx < currentActive) {
      setActiveBatchIndex(currentActive - 1);
    }

    pushToast(`Removed Batch ${removeIdx + 1} from queue`, "neutral");
  };

  // Cancel any running batch and reset the entire batch queue
  const handleResetAllBatches = async () => {
    if (isBatchRunning) {
      suppressAbortCleanupRef.current = true;
      setPendingAutoBatchIndex(null);
      abortControllerRef.current?.abort();
    }

    await clearAllCachedBatches().catch(() => undefined);

    const fresh = createInitialScenes(4);
    setScenes(fresh);
    setBatches([scenesToSingleBatch(fresh, settings.startNumber, 0)]);
    setActiveBatchIndex(0);
    setSelectedBatchIndices([]);
    setCompletedBannerBatchIndex(null);
    setStoppedAtSceneNumber(null);
    setFilter("all");
    pushToast("All batches cancelled and reset", "neutral");
  };

  // Persist active batch into IndexedDB cache before switching tabs or advancing
  const persistBatchToLocalCache = useCallback(
    async (
      batchIdx: number,
      startNum: number,
      batchScenes: SceneItem[]
    ): Promise<number> => {
      try {
        const saved = await saveBatchScenesToCache(
          batchIdx,
          startNum,
          batchScenes
        );
        setBatches((prev) =>
          prev.map((b) =>
            b.batchIndex === batchIdx
              ? {
                  ...b,
                  completedCount: batchScenes.filter(
                    (s) => s.status === "completed" && Boolean(s.imageDataUrl)
                  ).length,
                  failedCount: batchScenes.filter((s) => s.status === "error")
                    .length,
                  isCached: saved > 0,
                  lastCachedAt: saved > 0 ? Date.now() : b.lastCachedAt,
                }
              : b
          )
        );
        return saved;
      } catch {
        return 0;
      }
    },
    []
  );

  // Hydrate any batch tab from `batches[]` + IndexedDB local cache
  const hydrateBatchForView = useCallback(
    async (targetBatch: SequenceBatch): Promise<SceneItem[]> => {
      const cachedRecords = await loadBatchScenesFromCache(
        targetBatch.batchIndex
      ).catch(() => []);
      const cacheMap = new Map(
        cachedRecords.map((rec) => [rec.sceneNumber, rec])
      );

      return targetBatch.prompts.map((entry, offset) => {
        const sceneNum = targetBatch.startNumber + offset;
        const cached = cacheMap.get(sceneNum);
        if (cached) {
          return {
            id: entry.id,
            prompt: entry.prompt,
            narration: entry.narration,
            useReferenceCharacter: true,
            status: "completed",
            imageDataUrl: cached.imageDataUrl,
            mimeType: cached.mimeType,
            compiledPrompt: cached.compiledPrompt,
            generatedAt: cached.generatedAt,
          };
        }
        return {
          id: entry.id,
          prompt: entry.prompt,
          narration: entry.narration,
          useReferenceCharacter: true,
          status: "idle",
        };
      });
    },
    []
  );

  // Switch between Batch tabs (e.g. inspect Batch 1 while Batch 2 is ready)
  const handleSelectBatchTab = async (targetIdx: number) => {
    if (isBatchRunning) return;
    const targetBatch = batches[targetIdx];
    if (!targetBatch) return;

    // Save current active batch to IndexedDB cache before leaving it
    await persistBatchToLocalCache(
      activeBatchIndex,
      currentBatchStartNumber,
      scenesRef.current
    );

    const hydrated = await hydrateBatchForView(targetBatch);
    setActiveBatchIndex(targetIdx);
    setScenes(hydrated);
    setFilter("all");
    setStoppedAtSceneNumber(null);
  };

  // Scene list editors on active batch
  const handleUpdatePrompt = (id: string, prompt: string) => {
    setScenes((prev) => {
      const next = prev.map((scene) =>
        scene.id === id ? { ...scene, prompt } : scene
      );
      syncActiveBatchMeta(next, activeBatchIndex, currentBatchStartNumber);
      return next;
    });
  };

  const handleAddScene = () => {
    if (scenes.length >= MAX_BATCH_SCENES) {
      pushToast(`Maximum ${MAX_BATCH_SCENES} images per batch.`, "neutral");
      return;
    }
    setScenes((prev) => {
      const next = [...prev, createEmptyScene()];
      syncActiveBatchMeta(next, activeBatchIndex, currentBatchStartNumber);
      return next;
    });
  };

  const handleExpandToTwenty = () => {
    if (scenes.length >= MAX_BATCH_SCENES) return;
    const needed = MAX_BATCH_SCENES - scenes.length;
    setScenes((prev) => {
      const next = [
        ...prev,
        ...Array.from({ length: needed }, () => createEmptyScene()),
      ];
      syncActiveBatchMeta(next, activeBatchIndex, currentBatchStartNumber);
      return next;
    });
    pushToast(`Expanded current batch to ${MAX_BATCH_SCENES} slots`, "neutral");
  };

  const handleMoveScene = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= scenes.length) return;
    setScenes((prev) => {
      const copy = [...prev];
      const [moved] = copy.splice(fromIndex, 1);
      copy.splice(toIndex, 0, moved);
      syncActiveBatchMeta(copy, activeBatchIndex, currentBatchStartNumber);
      return copy;
    });
  };

  const handleDeleteScene = (id: string) => {
    if (scenes.length <= 1) return;
    setScenes((prev) => {
      const next = prev.filter((s) => s.id !== id);
      syncActiveBatchMeta(next, activeBatchIndex, currentBatchStartNumber);
      return next;
    });
    if (lightboxSceneId === id) {
      setLightboxSceneId(null);
    }
  };

  const handleClearCurrentSheet = () => {
    if (isBatchRunning) return;
    const fresh = createInitialScenes(4);
    setScenes(fresh);
    syncActiveBatchMeta(fresh, activeBatchIndex, currentBatchStartNumber);
    setFilter("all");
    setStoppedAtSceneNumber(null);
    setCompletedBannerBatchIndex(null);
    pushToast(`Cleared Batch ${activeBatchIndex + 1} prompts`, "neutral");
  };

  // Single image API call
  const executeSingleGeneration = useCallback(
    async (
      scene: SceneItem,
      sceneNumber: number,
      batchIdx: number,
      activeReview: MasterPromptReview | null,
      signal?: AbortSignal
    ): Promise<SceneItem | null> => {
      const trimmedPrompt = scene.prompt.trim();
      if (!trimmedPrompt) {
        return null;
      }

      setScenes((prev) =>
        prev.map((item) =>
          item.id === scene.id
            ? { ...item, status: "generating", errorMessage: undefined }
            : item
        )
      );

      try {
        // Ensure any recent Master Stickman directory upload finished syncing before generating
        await referenceSyncPromiseRef.current;

        const response = await fetch("/api/generate-scene", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal,
          body: JSON.stringify({
            sceneNumber,
            prompt: trimmedPrompt,
            instructions: activePreset.instructions,
            negativeRules: activePreset.negativeRules,
            characterProfile: activeReview?.characterProfile ?? "",
            characterNotes: referenceImage?.characterNotes ?? "",
            aspectRatio: settings.aspectRatio,
            model: settings.model,
            imageSize: settings.imageSize,
          }),
        });

        const payload = await response.json();

        if (!response.ok) {
          throw new Error(
            payload?.error || `Generation failed with status ${response.status}.`
          );
        }

        const completedScene: SceneItem = {
          ...scene,
          status: "completed",
          imageDataUrl: payload.imageDataUrl,
          mimeType: payload.mimeType || "image/png",
          compiledPrompt: payload.compiledPrompt,
          errorMessage: undefined,
          generatedAt: Date.now(),
        };

        setScenes((prev) => {
          const next = prev.map((item) =>
            item.id === scene.id ? completedScene : item
          );
          return next;
        });

        // Cache immediately in IndexedDB so zero progress is ever lost
        await saveBatchScenesToCache(batchIdx, sceneNumber, [
          completedScene,
        ]).catch(() => 0);

        setBatches((prev) =>
          prev.map((b) =>
            b.batchIndex === batchIdx
              ? {
                  ...b,
                  completedCount: Math.min(
                    b.prompts.length,
                    scenesRef.current.filter(
                      (s) =>
                        s.id === scene.id ||
                        (s.status === "completed" && Boolean(s.imageDataUrl))
                    ).length
                  ),
                  isCached: true,
                  lastCachedAt: Date.now(),
                }
              : b
          )
        );

        setSettings((prev) => ({
          ...prev,
          lastUsedSceneNumber: Math.max(prev.lastUsedSceneNumber, sceneNumber),
        }));

        return completedScene;
      } catch (err) {
        if (signal?.aborted) {
          setScenes((prev) =>
            prev.map((item) =>
              item.id === scene.id
                ? {
                    ...item,
                    status: item.imageDataUrl ? "completed" : "idle",
                  }
                : item
            )
          );
          return null;
        }

        const errorMessage =
          err instanceof Error ? err.message : "Unexpected generation error.";

        setScenes((prev) =>
          prev.map((item) =>
            item.id === scene.id
              ? {
                  ...item,
                  status: "error",
                  errorMessage,
                }
              : item
          )
        );
        return null;
      }
    },
    [activePreset, referenceImage, settings]
  );

  // Batch runner for a specific batch index (max 20 images per batch)
  const runBatchForSceneIds = useCallback(
    async (
      targetIds: string[],
      overrideScenes?: SceneItem[],
      overrideBatchIndex?: number,
      overrideStartNumber?: number
    ) => {
      if (isBatchRunning) return;

      const list = overrideScenes ?? scenesRef.current;
      const batchIdx = overrideBatchIndex ?? activeBatchIndexRef.current;
      const baseStart = overrideStartNumber ?? currentBatchStartNumber;

      const jobs = list
        .map((scene, idx) => ({
          scene,
          sceneNumber: baseStart + idx,
        }))
        .filter(
          (entry) =>
            targetIds.includes(entry.scene.id) &&
            entry.scene.prompt.trim().length > 0
        );

      if (jobs.length === 0) {
        pushToast("Add at least one prompt in this batch before generating.", "error");
        return;
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;
      setIsBatchRunning(true);
      setStoppedAtSceneNumber(null);
      setCompletedBannerBatchIndex(null);

      // Step 1: Review Director's Brief automatically before generating
      const reviewed = await runMasterPromptReview(controller.signal, false);
      if (controller.signal.aborted) {
        setBatchPhaseLabel(null);
        setIsBatchRunning(false);
        abortControllerRef.current = null;
        return;
      }

      setBatchPhaseLabel(
        `Generating Batch ${batchIdx + 1}: ${jobs[0].sceneNumber}.png – ${jobs[jobs.length - 1].sceneNumber}.png`
      );

      const jobIdSet = new Set(jobs.map((j) => j.scene.id));
      setScenes((prev) =>
        prev.map((item) =>
          jobIdSet.has(item.id)
            ? { ...item, status: "queued", errorMessage: undefined }
            : item
        )
      );

      let cursor = 0;
      let successCount = 0;
      let failureCount = 0;
      let highestCompletedInRun = 0;

      const workerCount = Math.min(settings.concurrency, jobs.length);

      const worker = async () => {
        while (cursor < jobs.length) {
          if (controller.signal.aborted) break;
          const job = jobs[cursor];
          cursor += 1;
          const result = await executeSingleGeneration(
            job.scene,
            job.sceneNumber,
            batchIdx,
            reviewed,
            controller.signal
          );
          if (controller.signal.aborted) break;
          if (result) {
            successCount += 1;
            if (job.sceneNumber > highestCompletedInRun) {
              highestCompletedInRun = job.sceneNumber;
            }
          } else {
            failureCount += 1;
          }
        }
      };

      await Promise.all(Array.from({ length: workerCount }, () => worker()));

      if (suppressAbortCleanupRef.current) {
        suppressAbortCleanupRef.current = false;
        abortControllerRef.current = null;
        setBatchPhaseLabel(null);
        setIsBatchRunning(false);
        return;
      }

      // Ensure full batch is synced to IndexedDB cache
      await persistBatchToLocalCache(batchIdx, baseStart, scenesRef.current);

      if (controller.signal.aborted) {
        setScenes((prev) =>
          prev.map((item) =>
            item.status === "queued" || item.status === "generating"
              ? { ...item, status: item.imageDataUrl ? "completed" : "idle" }
              : item
          )
        );
        const stoppedAt =
          highestCompletedInRun > 0
            ? highestCompletedInRun
            : Math.max(0, baseStart - 1);
        setStoppedAtSceneNumber(stoppedAt);
        pushToast(
          `Batch ${batchIdx + 1} paused at scene ${stoppedAt}. Click Continue to finish remaining prompts.`,
          "neutral"
        );
      } else if (failureCount === 0) {
        const totalBatches = batchesRef.current.length;
        const hasNext = batchIdx < totalBatches - 1;
        if (hasNext && autoGenerateNextRef.current) {
          setPendingAutoBatchIndex(batchIdx + 1);
          pushToast(
            `Batch ${batchIdx + 1} cached locally · Auto-generating Batch ${batchIdx + 2}…`,
            "success"
          );
        } else {
          setCompletedBannerBatchIndex(batchIdx);
          pushToast(
            hasNext
              ? `Batch ${batchIdx + 1} ready & cached locally! Click Next to generate Batch ${batchIdx + 2}.`
              : `Batch ${batchIdx + 1} complete & cached locally (last scene: ${highestCompletedInRun}).`,
            "success"
          );
        }
      } else {
        const stoppedAt =
          highestCompletedInRun > 0
            ? highestCompletedInRun
            : Math.max(0, baseStart - 1);
        setStoppedAtSceneNumber(stoppedAt);
        pushToast(
          `Batch ${batchIdx + 1}: ${successCount} ready, ${failureCount} failed. Click Continue Remaining to retry.`,
          "error"
        );
      }

      abortControllerRef.current = null;
      setBatchPhaseLabel(null);
      setIsBatchRunning(false);
    },
    [
      currentBatchStartNumber,
      executeSingleGeneration,
      isBatchRunning,
      persistBatchToLocalCache,
      pushToast,
      runMasterPromptReview,
      settings.concurrency,
    ]
  );

  // "Next" button handler: caches current batch locally, advances to next queued batch, and generates it!
  const handleAdvanceToNextQueuedBatch = async (autoStartGeneration = true) => {
    if (isBatchRunning) return;
    const nextIdx = activeBatchIndex + 1;
    const nextBatch = batches[nextIdx];

    // Always ensure current batch is persisted in IndexedDB local cache first
    await persistBatchToLocalCache(
      activeBatchIndex,
      currentBatchStartNumber,
      scenesRef.current
    );

    if (nextBatch) {
      const hydrated = await hydrateBatchForView(nextBatch);
      setActiveBatchIndex(nextIdx);
      setScenes(hydrated);
      setFilter("all");
      setCompletedBannerBatchIndex(null);
      setStoppedAtSceneNumber(null);

      pushToast(
        `Batch ${activeBatchIndex + 1} cached locally · Switched to Batch ${nextIdx + 1} (${nextBatch.startNumber}–${nextBatch.startNumber + nextBatch.prompts.length - 1})`,
        "neutral"
      );

      if (autoStartGeneration) {
        const targetIds = hydrated
          .filter((s) => s.prompt.trim().length > 0 && s.status !== "completed")
          .map((s) => s.id);
        if (targetIds.length > 0) {
          void runBatchForSceneIds(
            targetIds,
            hydrated,
            nextIdx,
            nextBatch.startNumber
          );
        }
      }
      return;
    }

    // If no pre-queued next batch exists yet, append a fresh batch continuing from lastUsedSceneNumber + 1
    const nextStart =
      Math.max(
        settings.lastUsedSceneNumber,
        currentBatchStartNumber + scenes.length - 1
      ) + 1;
    const freshScenes = createInitialScenes(4);
    const appendedBatch = scenesToSingleBatch(freshScenes, nextStart, batches.length);

    setBatches((prev) => [...prev, appendedBatch]);
    setActiveBatchIndex(batches.length);
    setScenes(freshScenes);
    setSettings((prev) => ({
      ...prev,
      startNumber: nextStart,
      lastUsedSceneNumber: nextStart - 1,
    }));
    setCompletedBannerBatchIndex(null);
    setStoppedAtSceneNumber(null);

    pushToast(`Ready for Batch ${batches.length + 1} starting at ${nextStart}.png`, "success");
    setTimeout(() => {
      document
        .getElementById("home-bulk-import-textarea")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 60);
  };

  // Load up to 200 prompts automatically split into 20-image batches
  const handleLoadMultiBatchPrompts = async (
    drafts: ParsedSceneDraft[],
    autoGenerateFirstBatch: boolean
  ) => {
    if (isBatchRunning) {
      pushToast("Stop the running batch before loading a new queue.", "error");
      return;
    }

    const capped = drafts.slice(0, MAX_TOTAL_PROMPTS);
    if (capped.length === 0) return;

    // Clear previous local cache if starting from scene 1
    const sequenceOrigin = settings.startNumber;
    if (sequenceOrigin === 1) {
      await clearAllCachedBatches().catch(() => undefined);
    }

    const createdBatches: SequenceBatch[] = [];
    for (let offset = 0; offset < capped.length; offset += MAX_BATCH_SCENES) {
      const slice = capped.slice(offset, offset + MAX_BATCH_SCENES);
      const batchIndex = createdBatches.length;
      createdBatches.push({
        batchIndex,
        startNumber: sequenceOrigin + offset,
        prompts: slice.map((item) => ({
          id: `scene-${crypto.randomUUID()}`,
          prompt: item.prompt,
          narration: item.narration,
        })),
        completedCount: 0,
        failedCount: 0,
        isCached: false,
      });
    }

    const firstBatch = createdBatches[0];
    const firstBatchScenes: SceneItem[] = firstBatch.prompts.map((entry) => ({
      id: entry.id,
      prompt: entry.prompt,
      narration: entry.narration,
      useReferenceCharacter: true,
      status: "idle",
    }));

    setBatches(createdBatches);
    setActiveBatchIndex(0);
    setSelectedBatchIndices([]);
    setScenes(firstBatchScenes);
    setFilter("all");
    setStoppedAtSceneNumber(null);
    setCompletedBannerBatchIndex(null);
    setActiveView("storyboard");

    pushToast(
      `Loaded ${capped.length} prompts across ${createdBatches.length} batch${createdBatches.length === 1 ? "" : "es"} (${sequenceOrigin}.png – ${sequenceOrigin + capped.length - 1}.png)`,
      "success"
    );

    if (autoGenerateFirstBatch) {
      void runBatchForSceneIds(
        firstBatchScenes.map((s) => s.id),
        firstBatchScenes,
        0,
        firstBatch.startNumber
      );
    }
  };

  const handleGenerateActiveBatch = () => {
    setActiveView("storyboard");
    const ids = scenes
      .filter((s) => s.prompt.trim().length > 0)
      .map((s) => s.id);
    void runBatchForSceneIds(ids);
  };

  const handleContinueRemaining = () => {
    const remainingIds = scenes
      .filter(
        (s) =>
          s.prompt.trim().length > 0 &&
          (s.status !== "completed" || !s.imageDataUrl)
      )
      .map((s) => s.id);
    if (remainingIds.length > 0) {
      void runBatchForSceneIds(remainingIds);
    }
  };

  // Auto-advance to the next queued batch when "Auto generate next sequence" is checked
  useEffect(() => {
    if (isBatchRunning || pendingAutoBatchIndex === null) return;
    const nextIdx = pendingAutoBatchIndex;
    setPendingAutoBatchIndex(null);

    if (!autoGenerateNextRef.current) {
      setCompletedBannerBatchIndex(Math.max(0, nextIdx - 1));
      return;
    }

    const nextBatch = batchesRef.current[nextIdx];
    if (!nextBatch) return;

    void (async () => {
      const hydrated = await hydrateBatchForView(nextBatch);
      setActiveBatchIndex(nextIdx);
      setScenes(hydrated);
      setFilter("all");
      setCompletedBannerBatchIndex(null);
      setStoppedAtSceneNumber(null);

      const targetIds = hydrated
        .filter((s) => s.prompt.trim().length > 0 && s.status !== "completed")
        .map((s) => s.id);
      if (targetIds.length > 0) {
        void runBatchForSceneIds(
          targetIds,
          hydrated,
          nextIdx,
          nextBatch.startNumber
        );
      }
    })();
  }, [
    hydrateBatchForView,
    isBatchRunning,
    pendingAutoBatchIndex,
    runBatchForSceneIds,
  ]);

  const handleCancelBatch = () => {
    setPendingAutoBatchIndex(null);
    abortControllerRef.current?.abort();
  };

  const handleGenerateSingle = async (id: string) => {
    const idx = scenes.findIndex((s) => s.id === id);
    if (idx === -1) return;
    const scene = scenes[idx];
    if (!scene.prompt.trim()) {
      pushToast("Write a prompt for this scene first.", "error");
      return;
    }

    const reviewed = await runMasterPromptReview(undefined, false);
    await executeSingleGeneration(
      scene,
      currentBatchStartNumber + idx,
      activeBatchIndex,
      reviewed
    );
  };

  // Multi-batch selection & ZIP exports (individual batch, selected batches e.g. Batch 1 + Batch 3, or ALL batches!)
  const handleToggleSelectBatchForExport = (batchIndex: number) => {
    setSelectedBatchIndices((prev) =>
      prev.includes(batchIndex)
        ? prev.filter((i) => i !== batchIndex)
        : [...prev, batchIndex].sort((a, b) => a - b)
    );
  };

  const collectEntriesForBatch = async (
    batchIndex: number
  ): Promise<ExportableImageEntry[]> => {
    if (batchIndex === activeBatchIndex) {
      await persistBatchToLocalCache(
        activeBatchIndex,
        currentBatchStartNumber,
        scenesRef.current
      );
    }
    const records = await loadBatchScenesFromCache(batchIndex);
    return records.map((r) => ({
      sceneNumber: r.sceneNumber,
      imageDataUrl: r.imageDataUrl,
      mimeType: r.mimeType,
    }));
  };

  const handleDownloadSingleBatch = async (batchIndex: number) => {
    if (isZipping) return;
    setIsZipping(true);
    try {
      const targetBatch = batches[batchIndex];
      const entries = await collectEntriesForBatch(batchIndex);
      if (entries.length === 0) {
        throw new Error(`Batch ${batchIndex + 1} has no generated images yet.`);
      }
      const rangeFrom = targetBatch?.startNumber ?? entries[0].sceneNumber;
      const rangeTo = entries[entries.length - 1].sceneNumber;
      const zipName = `FrameForge-Batch-${batchIndex + 1} (${rangeFrom}-${rangeTo}).zip`;
      const result = await downloadEntriesAsZip(entries, zipName);
      pushToast(
        `Downloaded ${result.filename} (${result.count} files)`,
        "success"
      );
    } catch (err) {
      pushToast(
        err instanceof Error ? err.message : "Batch ZIP export failed.",
        "error"
      );
    } finally {
      setIsZipping(false);
    }
  };

  const handleDownloadSelectedBatches = async () => {
    if (isZipping || selectedBatchIndices.length === 0) return;
    setIsZipping(true);
    try {
      await persistBatchToLocalCache(
        activeBatchIndex,
        currentBatchStartNumber,
        scenesRef.current
      );
      const records = await loadSelectedBatchesFromCache(selectedBatchIndices);
      const entries: ExportableImageEntry[] = records.map((r) => ({
        sceneNumber: r.sceneNumber,
        imageDataUrl: r.imageDataUrl,
        mimeType: r.mimeType,
      }));
      const batchLabel = selectedBatchIndices.map((i) => i + 1).join("-");
      const zipName = `FrameForge-Batches-${batchLabel}.zip`;
      const result = await downloadEntriesAsZip(entries, zipName);
      pushToast(
        `Downloaded ${result.filename} (${result.count} files from selected batches)`,
        "success"
      );
    } catch (err) {
      pushToast(
        err instanceof Error ? err.message : "Selected batches ZIP export failed.",
        "error"
      );
    } finally {
      setIsZipping(false);
    }
  };

  const handleDownloadFullSequence = async () => {
    if (isZipping) return;
    setIsZipping(true);
    try {
      await persistBatchToLocalCache(
        activeBatchIndex,
        currentBatchStartNumber,
        scenesRef.current
      );
      const records = await loadAllCachedScenes();
      const entries: ExportableImageEntry[] = records.map((r) => ({
        sceneNumber: r.sceneNumber,
        imageDataUrl: r.imageDataUrl,
        mimeType: r.mimeType,
      }));
      if (entries.length === 0) {
        throw new Error("No cached images are ready to export yet.");
      }
      const first = entries[0].sceneNumber;
      const last = entries[entries.length - 1].sceneNumber;
      const zipName = `FrameForge-Full-Sequence (${first}-${last}).zip`;
      const result = await downloadEntriesAsZip(entries, zipName);
      pushToast(
        `Exported ${result.filename} (${result.count} total images)`,
        "success"
      );
    } catch (err) {
      pushToast(
        err instanceof Error ? err.message : "Full sequence ZIP export failed.",
        "error"
      );
    } finally {
      setIsZipping(false);
    }
  };

  const handleDownloadSingleScene = (id: string) => {
    const idx = scenes.findIndex((s) => s.id === id);
    if (idx === -1) return;
    try {
      const filename = downloadSingleScene(
        scenes[idx],
        currentBatchStartNumber + idx
      );
      pushToast(`Downloaded ${filename}`, "success");
    } catch (err) {
      pushToast(
        err instanceof Error ? err.message : "Could not download image.",
        "error"
      );
    }
  };

  const visibleSceneEntries = useMemo(() => {
    return scenes
      .map((scene, index) => ({
        scene,
        index,
        sceneNumber: currentBatchStartNumber + index,
      }))
      .filter(({ scene }) => {
        if (filter === "all") return true;
        if (filter === "completed") return scene.status === "completed";
        if (filter === "error") return scene.status === "error";
        return (
          scene.status === "idle" ||
          scene.status === "queued" ||
          scene.status === "generating"
        );
      });
  }, [scenes, filter, currentBatchStartNumber]);

  const previewSceneEntry = useMemo(() => {
    const firstFilledIdx = scenes.findIndex((s) => s.prompt.trim().length > 0);
    const idx = firstFilledIdx >= 0 ? firstFilledIdx : 0;
    return {
      prompt: scenes[idx]?.prompt ?? "",
      sceneNumber: currentBatchStartNumber + idx,
    };
  }, [scenes, currentBatchStartNumber]);

  const gridColsClass =
    settings.aspectRatio === "9:16"
      ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4"
      : "grid-cols-1 md:grid-cols-2 2xl:grid-cols-3";

  const batchProgressPercent =
    stats.populated > 0
      ? Math.round(
          ((stats.completed + stats.failed) / Math.max(1, stats.populated)) * 100
        )
      : 0;

  const hasNextQueuedBatch = activeBatchIndex < batches.length - 1;
  const nextQueuedBatch = hasNextQueuedBatch
    ? batches[activeBatchIndex + 1]
    : null;

  const activeGeneratingIndex = scenes.findIndex(
    (s) => s.status === "generating"
  );
  const currentSequenceLabel =
    activeGeneratingIndex >= 0
      ? `#${currentBatchStartNumber + activeGeneratingIndex}`
      : stats.total > 1
        ? `#${currentBatchStartNumber}–${currentBatchStartNumber + stats.total - 1}`
        : `#${currentBatchStartNumber}`;

  const canResetSequence =
    !isBatchRunning &&
    (settings.lastUsedSceneNumber > 0 ||
      settings.startNumber !== 1 ||
      currentBatchStartNumber !== 1);

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-clip bg-[#F5F5F7] dark:bg-[#09090B] text-zinc-900 dark:text-[#F4F4F5] flex flex-col transition-colors">
      <TopBar
        activeView={activeView}
        onSelectView={setActiveView}
        isBatchRunning={isBatchRunning}
        populatedCount={stats.populated}
        settings={settings}
        resolvedTheme={resolvedTheme}
        referenceImage={referenceImage}
        totalCachedImages={multiBatchTotals.totalCachedImages}
        onUpdateSettings={(patch) =>
          setSettings((prev) => ({ ...prev, ...patch }))
        }
        onResetSequenceCounter={handleResetSequenceCounter}
        onClearLocalCache={() => {
          void handleClearLocalCache();
        }}
        onGenerateBatch={handleGenerateActiveBatch}
        onCancelBatch={handleCancelBatch}
      />

      <div className="flex flex-1 min-h-0">
        <main className="flex-1 min-w-0 w-full px-4 py-5 sm:px-5 sm:py-6 lg:px-8 lg:py-7">
          {activeView === "script" && (
            <div className="mx-auto w-full max-w-[1440px]">
              <ScriptWriterView
                studioSettings={settings}
                onImportStudioSettings={(imported) =>
                  setSettings((prev) => ({ ...prev, ...imported }))
                }
                onNotify={pushToast}
              />
            </div>
          )}

          {activeView === "narration" && (
            <div className="mx-auto w-full max-w-[1440px]">
              <NarrationView onNotify={pushToast} />
            </div>
          )}

          {activeView === "breakdown" && (
            <div className="mx-auto w-full max-w-[1440px]">
              <SceneBreakdownView
                onNotify={pushToast}
                onSendToStoryboard={(drafts) => {
                  void handleLoadMultiBatchPrompts(drafts, false);
                }}
              />
            </div>
          )}

          {activeView === "storyboard" && (
            <div className="mx-auto w-full max-w-[1440px] space-y-7">
              {/* Compact Director's Brief + Character Dictionary + 200-Image Multi-Batch Queue */}
              <WorkflowPipeline
                activePreset={activePreset}
                review={review}
                isReviewCurrent={isReviewCurrent}
                isReviewing={isReviewing}
                reviewError={reviewError}
                referenceImage={referenceImage}
                startNumber={settings.startNumber}
                lastUsedSceneNumber={settings.lastUsedSceneNumber}
                targetImageCount={settings.targetImageCount}
                isBatchRunning={isBatchRunning}
                onOpenBriefModal={() => setIsBriefModalOpen(true)}
                onRunReviewNow={() => {
                  void runMasterPromptReview(undefined, true);
                }}
                onUpdateTargetImageCount={(count) =>
                  setSettings((prev) => ({ ...prev, targetImageCount: count }))
                }
                onSetReferenceImage={handleSetReferenceImage}
                onUpdateReferenceMeta={handleUpdateReferenceMeta}
                onLoadMultiBatchPrompts={(drafts, autoGen) => {
                  void handleLoadMultiBatchPrompts(drafts, autoGen);
                }}
              />

              {/* Multi-Batch Local Cache Navigator & Individual / Selective / Full ZIP Downloads */}
              {(batches.length > 1 ||
                multiBatchTotals.totalCachedImages > 0 ||
                multiBatchTotals.totalQueuedPrompts > 0) && (
                <BatchNavigator
                  batches={batches}
                  activeBatchIndex={activeBatchIndex}
                  selectedBatchIndices={selectedBatchIndices}
                  isBatchRunning={isBatchRunning}
                  isZipping={isZipping}
                  totalCachedImages={multiBatchTotals.totalCachedImages}
                  totalQueuedPrompts={multiBatchTotals.totalQueuedPrompts}
                  onSelectBatchTab={(idx) => {
                    void handleSelectBatchTab(idx);
                  }}
                  onToggleSelectBatchForExport={
                    handleToggleSelectBatchForExport
                  }
                  onDownloadSingleBatch={(idx) => {
                    void handleDownloadSingleBatch(idx);
                  }}
                  onDownloadSelectedBatches={() => {
                    void handleDownloadSelectedBatches();
                  }}
                  onDownloadFullSequence={() => {
                    void handleDownloadFullSequence();
                  }}
                  onResetSingleBatch={(idx) => {
                    void handleResetSingleBatch(idx);
                  }}
                  onRemoveBatch={(idx) => {
                    void handleRemoveBatch(idx);
                  }}
                  onResetAllBatches={() => {
                    void handleResetAllBatches();
                  }}
                />
              )}

              {/* Batch Ready -> "Next" Banner (Caches Completed Batch & Advances) */}
              {completedBannerBatchIndex === activeBatchIndex &&
                !isBatchRunning && (
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-emerald-300 dark:border-emerald-500/35 bg-emerald-50 dark:bg-[#101814] px-5 py-4">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
                      <div className="space-y-0.5">
                        {multiBatchTotals.allBatchesDone &&
                        batches.length > 1 ? (
                          <>
                            <p className="text-sm font-semibold text-emerald-950 dark:text-emerald-100">
                              All {batches.length} batches complete (
                              {multiBatchTotals.totalCachedImages} images cached
                              locally)
                            </p>
                            <p className="text-xs text-emerald-800 dark:text-emerald-200/80">
                              Download the entire sequence in one ZIP file, or
                              download individual batches above.
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="text-sm font-semibold text-emerald-950 dark:text-emerald-100">
                              Batch {activeBatchIndex + 1} ready (
                              <span className="font-mono tabular-nums">
                                {currentBatchStartNumber}–
                                {currentBatchStartNumber + stats.completed - 1}
                              </span>{" "}
                              saved in local cache)
                            </p>
                            <p className="text-xs text-emerald-800 dark:text-emerald-200/80">
                              {nextQueuedBatch
                                ? `Click Next to archive Batch ${activeBatchIndex + 1} in local cache and generate Batch ${activeBatchIndex + 2} (${nextQueuedBatch.startNumber}–${nextQueuedBatch.startNumber + nextQueuedBatch.prompts.length - 1}).`
                                : `Download Batch ${activeBatchIndex + 1} now or add a new batch starting from ${currentBatchStartNumber + stats.completed}.png.`}
                            </p>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          void handleDownloadSingleBatch(activeBatchIndex);
                        }}
                        disabled={isZipping}
                        className="inline-flex w-full sm:w-auto items-center justify-center gap-1.5 rounded-lg border border-emerald-400 dark:border-emerald-500/40 bg-white dark:bg-emerald-950/60 px-3.5 py-2 text-xs font-semibold text-emerald-800 dark:text-emerald-100 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors"
                      >
                        <Archive className="h-3.5 w-3.5 shrink-0" />
                        Download Batch {activeBatchIndex + 1}
                      </button>

                      {nextQueuedBatch ? (
                        <button
                          type="button"
                          onClick={() => {
                            void handleAdvanceToNextQueuedBatch(true);
                          }}
                          className="inline-flex w-full sm:w-auto items-center justify-center gap-1.5 rounded-lg bg-[#F2B705] px-4 py-2 text-xs font-semibold text-[#09090B] hover:bg-[#f7c52a] transition-colors text-center"
                        >
                          Next: Generate Batch {activeBatchIndex + 2} (
                          {nextQueuedBatch.startNumber}–
                          {nextQueuedBatch.startNumber +
                            nextQueuedBatch.prompts.length -
                            1}
                          )
                          <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                        </button>
                      ) : multiBatchTotals.allBatchesDone &&
                        batches.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => {
                            void handleDownloadFullSequence();
                          }}
                          disabled={isZipping}
                          className="inline-flex w-full sm:w-auto items-center justify-center gap-1.5 rounded-lg bg-[#F2B705] px-4 py-2 text-xs font-semibold text-[#09090B] hover:bg-[#f7c52a] transition-colors"
                        >
                          <Archive className="h-3.5 w-3.5 shrink-0" />
                          Download All ({multiBatchTotals.totalCachedImages}) ZIP
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            void handleAdvanceToNextQueuedBatch(false);
                          }}
                          className="inline-flex w-full sm:w-auto items-center justify-center gap-1.5 rounded-lg bg-[#F2B705] px-4 py-2 text-xs font-semibold text-[#09090B] hover:bg-[#f7c52a] transition-colors"
                        >
                          Next Batch ({currentBatchStartNumber + stats.completed}
                          +)
                          <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                        </button>
                      )}
                    </div>
                  </div>
                )}

              {/* Partial Batch / Continue Banner */}
              {stoppedAtSceneNumber !== null &&
                stats.unfinishedPopulated > 0 &&
                !isBatchRunning && (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-amber-300 dark:border-amber-500/35 bg-amber-50 dark:bg-[#19150d] px-5 py-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 shrink-0 text-amber-600 dark:text-[#F2B705] mt-0.5" />
                      <div className="space-y-0.5">
                        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                          Batch {activeBatchIndex + 1} paused — Last completed
                          scene:{" "}
                          <span className="font-mono text-amber-700 dark:text-[#F2B705] tabular-nums">
                            {stoppedAtSceneNumber > 0
                              ? stoppedAtSceneNumber
                              : "None"}
                          </span>
                        </p>
                        <p className="text-xs text-zinc-600 dark:text-zinc-400">
                          {stats.unfinishedPopulated} remaining prompt
                          {stats.unfinishedPopulated === 1 ? "" : "s"} ready to
                          continue with the same sequence numbers.
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleContinueRemaining}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#F2B705] px-4 py-2 text-xs font-semibold text-[#09090B] hover:bg-[#f7c52a] transition-colors whitespace-nowrap shrink-0"
                    >
                      <Play className="h-3.5 w-3.5 fill-current" />
                      Continue Remaining ({stats.unfinishedPopulated})
                    </button>
                  </div>
                )}

              {/* Active Batch Contact Sheet Header */}
              <div className="space-y-4 border-b border-zinc-200 dark:border-zinc-800 pb-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                  <div className="space-y-1">
                    <h2 className="font-display text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                      Batch {activeBatchIndex + 1} Contact Sheet
                    </h2>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 font-mono tabular-nums">
                      <span>
                        {stats.completed} / {stats.total} images ready
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        Files: {currentBatchStartNumber}.png –{" "}
                        {currentBatchStartNumber + stats.total - 1}.png
                      </span>
                      {batches.length > 1 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>
                            Batch {activeBatchIndex + 1} of {batches.length}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Inline Current Sequence + Last Sequence Box & Icon-Only Reset Button */}
                    <div className="inline-flex flex-wrap items-center gap-1.5 max-w-full">
                      <div className="inline-flex flex-wrap items-center gap-1.5 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#111114] px-3 py-2 text-xs text-zinc-700 dark:text-zinc-300">
                        <span className="font-medium text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                          Current Sequence
                        </span>
                        <span className="font-mono font-semibold text-amber-700 dark:text-[#F2B705] tabular-nums whitespace-nowrap">
                          {currentSequenceLabel}
                        </span>
                        <span
                          aria-hidden="true"
                          className="text-zinc-300 dark:text-zinc-700"
                        >
                          ·
                        </span>
                        <span className="text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                          Last
                        </span>
                        <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums whitespace-nowrap">
                          {settings.lastUsedSceneNumber > 0
                            ? `#${settings.lastUsedSceneNumber}`
                            : "—"}
                        </span>
                      </div>

                      <div className="relative group">
                        <button
                          type="button"
                          onClick={handleResetSequenceCounter}
                          disabled={!canResetSequence}
                          aria-label="Reset Sequence"
                          title="Reset Sequence"
                          className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-lg border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#111114] text-zinc-700 dark:text-zinc-300 hover:border-[#F2B705] hover:text-amber-600 dark:hover:text-[#F2B705] disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B705]"
                        >
                          <Undo2 className="h-3.5 w-3.5" />
                        </button>
                        <span
                          role="tooltip"
                          className="pointer-events-none absolute left-1/2 bottom-full z-20 mb-2 -translate-x-1/2 rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-900 dark:bg-zinc-950 px-2.5 py-1 text-[11px] font-medium text-zinc-100 opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 whitespace-nowrap"
                        >
                          Reset Sequence
                        </span>
                      </div>
                    </div>

                    {scenes.length < MAX_BATCH_SCENES && (
                      <button
                        type="button"
                        onClick={handleExpandToTwenty}
                        disabled={isBatchRunning}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#111114] px-3 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:border-zinc-400 dark:hover:border-zinc-600 hover:text-zinc-950 dark:hover:text-white disabled:opacity-40 transition-colors whitespace-nowrap"
                      >
                        <Layers className="h-3.5 w-3.5" />
                        20 Slots
                      </button>
                    )}

                    {stats.failed > 0 && !isBatchRunning && (
                      <button
                        type="button"
                        onClick={handleContinueRemaining}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-xs font-medium text-red-700 dark:text-red-200 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors whitespace-nowrap"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Retry Failed ({stats.failed})
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        void handleDownloadSingleBatch(activeBatchIndex);
                      }}
                      disabled={stats.completed === 0 || isZipping}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#18181B] px-3.5 py-2 text-xs font-medium text-zinc-800 dark:text-zinc-200 hover:border-zinc-400 dark:hover:border-zinc-500 hover:text-zinc-950 dark:hover:text-white disabled:opacity-35 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                    >
                      <Archive className="h-3.5 w-3.5" />
                      Download Batch {activeBatchIndex + 1} ZIP
                    </button>

                    {hasNextQueuedBatch && !isBatchRunning && (
                      <button
                        type="button"
                        onClick={() => {
                          void handleAdvanceToNextQueuedBatch(true);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#F2B705] px-3.5 py-2 text-xs font-semibold text-[#09090B] hover:bg-[#f7c52a] transition-colors whitespace-nowrap"
                      >
                        Next: Batch {activeBatchIndex + 2}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {isBatchRunning && (
                  <div className="space-y-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] px-4 py-3">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="inline-flex items-center gap-2 font-medium text-zinc-800 dark:text-zinc-200">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-600 dark:text-[#F2B705]" />
                        {batchPhaseLabel || "Processing batch…"}
                      </span>
                      <span className="font-mono text-zinc-500 dark:text-zinc-400 tabular-nums">
                        {stats.completed + stats.failed} / {stats.populated} (
                        {batchProgressPercent}%)
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                      <div
                        className="h-full bg-[#F2B705] transition-all duration-300"
                        style={{
                          width: `${isReviewing ? 8 : Math.max(8, batchProgressPercent)}%`,
                        }}
                      />
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div
                    role="tablist"
                    aria-label="Filter scenes by status"
                    className="flex flex-wrap items-center gap-1 rounded-lg bg-white dark:bg-[#111114] p-1 border border-zinc-200 dark:border-zinc-800 max-w-full"
                  >
                    {(
                      [
                        { id: "all", label: `All (${stats.total})` },
                        { id: "completed", label: `Ready (${stats.completed})` },
                        { id: "pending", label: `Pending (${stats.pending})` },
                        { id: "error", label: `Failed (${stats.failed})` },
                      ] as Array<{ id: SceneFilter; label: string }>
                    ).map((tab) => {
                      const active = filter === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          onClick={() => setFilter(tab.id)}
                          className={`rounded-md px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors tabular-nums ${
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

                  <div className="flex items-center gap-3 text-xs">
                    <button
                      type="button"
                      onClick={handleAddScene}
                      disabled={
                        scenes.length >= MAX_BATCH_SCENES || isBatchRunning
                      }
                      className="inline-flex items-center gap-1 font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white disabled:opacity-35 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add Slot ({scenes.length}/{MAX_BATCH_SCENES})
                    </button>
                    <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-700">
                      ·
                    </span>
                    <button
                      type="button"
                      onClick={handleClearCurrentSheet}
                      disabled={isBatchRunning}
                      className="inline-flex items-center gap-1 text-zinc-500 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-35 transition-colors whitespace-nowrap"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Clear Batch
                    </button>
                  </div>
                </div>
              </div>

              {/* Active Batch Scene Cards */}
              {visibleSceneEntries.length === 0 ? (
                <div className="flex min-h-[240px] flex-col items-center justify-center rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] p-8 text-center">
                  <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                    No scenes match this filter
                  </p>
                  <button
                    type="button"
                    onClick={() => setFilter("all")}
                    className="mt-4 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#18181B] px-3.5 py-2 text-xs font-medium text-zinc-800 dark:text-zinc-200 hover:border-zinc-400 dark:hover:border-zinc-500"
                  >
                    Show All Scenes
                  </button>
                </div>
              ) : (
                <div className={`grid gap-5 ${gridColsClass}`}>
                  {visibleSceneEntries.map(({ scene, index, sceneNumber }) => (
                    <SceneCard
                      key={scene.id}
                      scene={scene}
                      index={index}
                      totalScenes={scenes.length}
                      sceneNumber={sceneNumber}
                      aspectRatio={settings.aspectRatio}
                      onUpdatePrompt={handleUpdatePrompt}
                      onGenerateSingle={(id) => {
                        void handleGenerateSingle(id);
                      }}
                      onDownloadSingle={handleDownloadSingleScene}
                      onInspect={setLightboxSceneId}
                      onMoveUp={(i) => handleMoveScene(i, i - 1)}
                      onMoveDown={(i) => handleMoveScene(i, i + 1)}
                      onDelete={handleDeleteScene}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {activeView === "bulk" && (
            <BulkImportView
              startNumber={settings.startNumber}
              targetImageCount={settings.targetImageCount}
              hasReferenceImage={Boolean(referenceImage)}
              onUpdateTargetImageCount={(count) =>
                setSettings((prev) => ({ ...prev, targetImageCount: count }))
              }
              onApplyMultiBatch={(drafts, autoGen) => {
                void handleLoadMultiBatchPrompts(drafts, autoGen);
              }}
            />
          )}

          {activeView === "config" && (
            <SequenceConfigView
              presets={presets}
              activePreset={activePreset}
              settings={settings}
              referenceImage={referenceImage}
              review={review}
              sampleScenePrompt={previewSceneEntry.prompt}
              sampleSceneNumber={previewSceneEntry.sceneNumber}
              totalCachedImages={multiBatchTotals.totalCachedImages}
              isBatchRunning={isBatchRunning}
              onSelectPreset={handleSelectPreset}
              onUpdateActivePreset={(patch) =>
                handleUpdatePreset(activePreset.id, patch)
              }
              onOpenPresetsManager={() => setActiveView("presets")}
              onUpdateSettings={(patch) =>
                setSettings((prev) => ({ ...prev, ...patch }))
              }
              onResetSequenceCounter={handleResetSequenceCounter}
              onClearLocalCache={() => {
                void handleClearLocalCache();
              }}
            />
          )}

          {activeView === "presets" && (
            <PresetsView
              presets={presets}
              activePresetId={activePreset.id}
              onSelectActivePreset={handleSelectPreset}
              onUpdatePreset={handleUpdatePreset}
              onCreatePreset={handleCreateBlankPreset}
              onDuplicatePreset={handleDuplicatePreset}
              onDeletePreset={handleDeletePreset}
              onResetDefaults={handleResetDefaultPresets}
              onImportPresets={handleImportPresets}
            />
          )}

          {activeView === "export" && (
            <div className="mx-auto w-full max-w-[1440px]">
              <ExportAllView
                activeStoryboardScenes={scenes}
                activeBatchStartNumber={currentBatchStartNumber}
                activeBatchIndex={activeBatchIndex}
                onNotify={pushToast}
                onNavigate={setActiveView}
              />
            </div>
          )}
        </main>
      </div>

      {/* Bottom Workspace Capacity Footer (Storyboard only) */}
      {activeView === "storyboard" && (
        <footer className="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] px-4 py-3 sm:px-5 lg:px-8 transition-colors">
          <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 text-xs text-zinc-600 dark:text-zinc-400">
            <div className="flex flex-wrap items-center gap-2 font-mono tabular-nums">
              <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                Prompt Limit: Up to {MAX_TOTAL_PROMPTS} prompts at a time
              </span>
              <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-700">
                ·
              </span>
              <span>
                {MAX_BATCH_SCENES} images per batch (up to{" "}
                {Math.ceil(MAX_TOTAL_PROMPTS / MAX_BATCH_SCENES)} batches)
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] tabular-nums text-zinc-500">
              <span>
                Active Target: {settings.targetImageCount} / {MAX_TOTAL_PROMPTS}
              </span>
              <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-700">
                ·
              </span>
              <span
                className={
                  settings.autoGenerateNextSequence
                    ? "text-amber-600 dark:text-[#F2B705] font-medium"
                    : ""
                }
              >
                Auto-Generate Next:{" "}
                {settings.autoGenerateNextSequence ? "Enabled" : "Manual"}
              </span>
            </div>
          </div>
        </footer>
      )}

      {/* Director's Brief Modal */}
      <BriefModal
        isOpen={isBriefModalOpen}
        activePreset={activePreset}
        review={review}
        isReviewCurrent={isReviewCurrent}
        isReviewing={isReviewing}
        reviewError={reviewError}
        onClose={() => setIsBriefModalOpen(false)}
        onUpdateInstructions={(instructions) =>
          handleUpdatePreset(activePreset.id, { instructions })
        }
        onUpdateNegativeRules={(negativeRules) =>
          handleUpdatePreset(activePreset.id, { negativeRules })
        }
        onRunReviewNow={() => {
          void runMasterPromptReview(undefined, true);
        }}
      />

      {/* Fullscreen Lightbox */}
      <LightboxModal
        scenes={scenes}
        activeSceneId={lightboxSceneId}
        startNumber={currentBatchStartNumber}
        onClose={() => setLightboxSceneId(null)}
        onNavigate={setLightboxSceneId}
        onDownload={handleDownloadSingleScene}
        onRegenerate={(id) => {
          setLightboxSceneId(null);
          void handleGenerateSingle(id);
        }}
      />

      {/* Toast Notifications */}
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-5 sm:bottom-5 z-50 flex flex-col gap-2 sm:max-w-md"
        >
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`flex items-center gap-2.5 rounded-lg border px-4 py-3 text-xs font-medium shadow-xl ${
                toast.tone === "success"
                  ? "border-emerald-300 dark:border-emerald-500/35 bg-emerald-50 dark:bg-[#111916] text-emerald-900 dark:text-emerald-200"
                  : toast.tone === "error"
                    ? "border-red-300 dark:border-red-500/35 bg-red-50 dark:bg-[#1b1113] text-red-900 dark:text-red-200"
                    : "border-zinc-200 dark:border-zinc-700 bg-white dark:bg-[#18181B] text-zinc-900 dark:text-zinc-100"
              }`}
            >
              {toast.tone === "success" && (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              )}
              {toast.tone === "error" && (
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
              )}
              <span>{toast.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
