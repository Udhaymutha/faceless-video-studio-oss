import { useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  ImagePlus,
  Loader2,
  Play,
  RefreshCw,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import {
  MAX_BATCH_SCENES,
  MAX_TOTAL_PROMPTS,
  SAMPLE_TWENTY_SCENE_SCRIPT,
} from "../data/defaultPresets";
import type {
  InstructionPreset,
  MasterPromptReview,
  ReferenceImage,
} from "../types/studio";
import { parseBulkPrompts } from "../utils/promptParser";
import type { ParsedSceneDraft } from "../utils/promptParser";

interface WorkflowPipelineProps {
  activePreset: InstructionPreset;
  review: MasterPromptReview | null;
  isReviewCurrent: boolean;
  isReviewing: boolean;
  reviewError: string | null;
  referenceImage: ReferenceImage | null;
  startNumber: number;
  lastUsedSceneNumber: number;
  targetImageCount: number;
  isBatchRunning: boolean;
  onOpenBriefModal: () => void;
  onRunReviewNow: () => void;
  onUpdateTargetImageCount: (count: number) => void;
  onSetReferenceImage: (img: ReferenceImage | null) => void;
  onUpdateReferenceMeta: (
    patch: Partial<Pick<ReferenceImage, "characterName" | "characterNotes">>
  ) => void;
  onLoadMultiBatchPrompts: (
    drafts: ParsedSceneDraft[],
    autoGenerateFirstBatch: boolean
  ) => void;
}

const TARGET_QUICK_OPTIONS = [20, 60, 100, 200, 400];

export function WorkflowPipeline({
  activePreset,
  review,
  isReviewCurrent,
  isReviewing,
  reviewError,
  referenceImage,
  startNumber,
  lastUsedSceneNumber,
  targetImageCount,
  isBatchRunning,
  onOpenBriefModal,
  onRunReviewNow,
  onUpdateTargetImageCount,
  onSetReferenceImage,
  onUpdateReferenceMeta,
  onLoadMultiBatchPrompts,
}: WorkflowPipelineProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [bulkText, setBulkText] = useState("");

  const parsedAll = useMemo(() => parseBulkPrompts(bulkText), [bulkText]);
  const clampedCount = Math.min(parsedAll.length, targetImageCount);
  const activeDrafts = parsedAll.slice(0, targetImageCount);
  const plannedBatchCount = Math.ceil(clampedCount / MAX_BATCH_SCENES);
  const targetBatchCount = Math.ceil(targetImageCount / MAX_BATCH_SCENES);

  const isReviewed = isReviewCurrent && Boolean(review);

  const processReferenceFile = (file: File) => {
    setUploadError(null);
    if (!file.type.startsWith("image/")) {
      setUploadError("Please upload a valid PNG, JPG, or WebP image file.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError("Character reference image must be under 10 MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const commaIdx = result.indexOf(",");
      if (commaIdx === -1) {
        setUploadError("Could not read the selected image.");
        return;
      }
      onSetReferenceImage({
        name: file.name,
        characterName:
          referenceImage?.characterName ||
          file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "),
        characterNotes: referenceImage?.characterNotes || "",
        data: result.slice(commaIdx + 1),
        mimeType: file.type,
        previewUrl: result,
      });
    };
    reader.onerror = () => setUploadError("Failed to read image file.");
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processReferenceFile(file);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processReferenceFile(file);
  };

  return (
    <section aria-label="Production Setup Workspace" className="space-y-5">
      {/* Compact Director's Brief & Target Count Strip */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-zinc-200 dark:border-zinc-800 pb-4">
        {/* Left: Compact Clickable Director's Brief Button + Circular Refresh Icon */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onOpenBriefModal}
            className="inline-flex items-center gap-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#111114] px-3.5 py-2 text-xs font-medium text-zinc-900 dark:text-zinc-100 hover:border-zinc-400 dark:hover:border-zinc-500 hover:bg-zinc-50 dark:hover:bg-[#18181B] transition-colors whitespace-nowrap"
          >
            {isReviewing ? (
              <Loader2 className="h-4 w-4 animate-spin text-amber-600 dark:text-[#F2B705] shrink-0" />
            ) : isReviewed ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <XCircle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" />
            )}
            <span>Director&apos;s Brief</span>
            <span aria-hidden="true" className="text-zinc-400 dark:text-zinc-600">
              ·
            </span>
            <span
              className={
                isReviewing
                  ? "text-amber-600 dark:text-[#F2B705]"
                  : isReviewed
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-zinc-500 dark:text-zinc-400"
              }
            >
              {isReviewing
                ? "Reviewing…"
                : isReviewed
                  ? "Verified"
                  : "Unreviewed"}
            </span>
          </button>

          {/* Circular spiral-arrow refresh button with hover tooltip "Review Now" */}
          <div className="relative group">
            <button
              type="button"
              onClick={onRunReviewNow}
              disabled={isReviewing || isBatchRunning}
              aria-label="Review Now"
              title="Review Now"
              className="flex h-9 w-9 sm:h-8 sm:w-8 items-center justify-center rounded-full border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#18181B] text-zinc-700 dark:text-zinc-200 hover:border-[#F2B705] hover:text-amber-600 dark:hover:text-[#F2B705] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isReviewing ? "animate-spin text-amber-600 dark:text-[#F2B705]" : ""}`}
              />
            </button>
            <span
              role="tooltip"
              className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 -translate-x-1/2 rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-900 dark:bg-zinc-950 px-2.5 py-1 text-[11px] font-medium text-zinc-100 opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 whitespace-nowrap"
            >
              Review Now
            </span>
          </div>

          <span className="hidden sm:inline text-xs text-zinc-500 truncate max-w-[260px]">
            {activePreset.name}
          </span>
        </div>

        {/* Right: Target Total Images Control (Up to 200 · 20 per Batch) */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-2">
            <label
              htmlFor="target-image-count"
              className="font-medium text-zinc-600 dark:text-zinc-400 whitespace-nowrap"
            >
              Total Images
            </label>
            <input
              id="target-image-count"
              type="number"
              min={1}
              max={MAX_TOTAL_PROMPTS}
              value={targetImageCount}
              disabled={isBatchRunning}
              onChange={(e) => {
                const raw = parseInt(e.target.value, 10);
                if (!Number.isFinite(raw)) return;
                onUpdateTargetImageCount(
                  Math.max(1, Math.min(MAX_TOTAL_PROMPTS, raw))
                );
              }}
              className="w-16 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#111114] px-2 py-1 font-mono text-xs font-semibold tabular-nums text-amber-700 dark:text-[#F2B705] focus:border-[#F2B705] focus:outline-none disabled:opacity-50"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1">
            {TARGET_QUICK_OPTIONS.map((presetCount) => {
              const active = targetImageCount === presetCount;
              return (
                <button
                  key={presetCount}
                  type="button"
                  disabled={isBatchRunning}
                  onClick={() => onUpdateTargetImageCount(presetCount)}
                  className={`rounded-md px-2 py-1 font-mono text-[11px] tabular-nums transition-colors ${
                    active
                      ? "bg-[#F2B705] font-semibold text-[#09090B]"
                      : "border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] text-zinc-600 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-600 hover:text-zinc-900 dark:hover:text-zinc-200"
                  }`}
                >
                  {presetCount}
                </button>
              );
            })}
          </div>

          <span className="font-mono text-[11px] text-zinc-500 tabular-nums whitespace-nowrap">
            {targetBatchCount} batch{targetBatchCount === 1 ? "" : "es"} × 20
          </span>
        </div>
      </div>

      {reviewError && (
        <div className="flex items-start gap-2 rounded-lg border border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-950/30 px-4 py-2.5 text-xs text-red-700 dark:text-red-200">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-500 dark:text-red-400 mt-0.5" />
          <span>{reviewError}</span>
        </div>
      )}

      {/* Main 2-Column Home Setup Grid: Character Reference Directory + Multi-Batch Prompt Import */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12 items-stretch">
        {/* Left: Dedicated Common Master Stickman Character Reference Directory */}
        <div
          id="character-dictionary-section"
          className="xl:col-span-5 flex flex-col rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] p-5 space-y-4 transition-colors"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="space-y-0.5">
              <h2 className="font-display text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Master Stickman Character Reference Directory
              </h2>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                Common reference directory automatically pulled for every image
                across all batches — never checked per prompt.
              </p>
            </div>
            <span
              className={`text-xs font-medium whitespace-nowrap ${
                referenceImage
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-zinc-500"
              }`}
            >
              {referenceImage ? "Active in Directory" : "Empty Directory"}
            </span>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />

          {referenceImage ? (
            <div className="flex flex-1 flex-col justify-between gap-4">
              <div className="flex flex-col sm:flex-row items-start gap-4">
                <div className="relative h-32 w-32 shrink-0 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#09090B]">
                  <img
                    src={referenceImage.previewUrl}
                    alt="Master Stickman character reference directory"
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-contain"
                  />
                </div>

                <div className="min-w-0 flex-1 space-y-2.5 w-full">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-xs text-zinc-800 dark:text-zinc-200">
                        {referenceImage.name}
                      </p>
                      <p className="truncate font-mono text-[10px] text-zinc-500">
                        master-stickman-reference-directory
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isBatchRunning}
                        className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#18181B] px-2.5 py-1 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:border-zinc-400 dark:hover:border-zinc-500 disabled:opacity-40"
                      >
                        Replace
                      </button>
                      <button
                        type="button"
                        onClick={() => onSetReferenceImage(null)}
                        disabled={isBatchRunning}
                        aria-label="Remove Master Stickman reference from directory"
                        className="rounded-md border border-zinc-200 dark:border-zinc-800 p-1 text-zinc-500 dark:text-zinc-400 hover:border-red-300 dark:hover:border-red-500/40 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-40"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <input
                    type="text"
                    value={referenceImage.characterName}
                    onChange={(e) =>
                      onUpdateReferenceMeta({ characterName: e.target.value })
                    }
                    placeholder="Character name (e.g. Master Stickman)"
                    className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] px-3 py-1.5 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:border-[#F2B705] focus:outline-none"
                  />

                  <textarea
                    rows={2}
                    value={referenceImage.characterNotes}
                    onChange={(e) =>
                      onUpdateReferenceMeta({ characterNotes: e.target.value })
                    }
                    placeholder="Optional directory notes (stickman line weight, signature traits, recurring accessories)..."
                    className="w-full resize-none rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] px-3 py-1.5 text-xs text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:border-[#F2B705] focus:outline-none"
                  />
                </div>
              </div>

              {isReviewed && review?.styleLock && (
                <p className="border-t border-zinc-200 dark:border-zinc-800/80 pt-3 text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-400">
                  <span className="font-medium text-emerald-600 dark:text-emerald-400">
                    Style Lock:
                  </span>{" "}
                  {review.styleLock}
                </p>
              )}
            </div>
          ) : (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              className={`flex flex-1 min-h-[180px] cursor-pointer flex-col items-center justify-center gap-2.5 rounded-lg border border-dashed p-6 text-center transition-colors ${
                isDragOver
                  ? "border-[#F2B705] bg-[#F2B705]/5"
                  : "border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#09090B] hover:border-zinc-400 dark:hover:border-zinc-500"
              }`}
            >
              <ImagePlus className="h-7 w-7 text-zinc-400" />
              <div className="space-y-1">
                <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                  Attach Master Stickman Character Reference
                </p>
                <p className="text-[11px] text-zinc-500">
                  Stored once in the common reference directory and pulled
                  automatically for every generated scene (PNG, JPG, WebP)
                </p>
              </div>
            </div>
          )}

          {uploadError && (
            <p className="text-xs text-red-600 dark:text-red-400">
              {uploadError}
            </p>
          )}
        </div>

        {/* Right: Multi-Batch Bulk Import (Up to 200 Prompts · Auto-Split into Batches of 20) */}
        <div className="xl:col-span-7 flex flex-col rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] p-5 space-y-3.5 transition-colors">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-0.5">
              <h2 className="font-display text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Bulk Prompt Queue (Up to {targetImageCount} Images · 20 per Batch)
              </h2>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                Paste up to {targetImageCount} prompts at once. Batches run 20
                images at a time, caching each completed batch locally (
                <span className="font-mono text-zinc-800 dark:text-zinc-200">
                  {startNumber}.png
                </span>{" "}
                onward).
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setBulkText(SAMPLE_TWENTY_SCENE_SCRIPT)}
                disabled={isBatchRunning}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#18181B] px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:border-zinc-400 dark:hover:border-zinc-500 disabled:opacity-40 whitespace-nowrap"
              >
                <FileText className="h-3.5 w-3.5" />
                Sample 20
              </button>
              {bulkText.trim() && (
                <button
                  type="button"
                  onClick={() => setBulkText("")}
                  disabled={isBatchRunning}
                  className="rounded-lg border border-zinc-200 dark:border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-500 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-700 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-40"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <textarea
            id="home-bulk-import-textarea"
            rows={8}
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder={`Paste up to ${targetImageCount} scene prompts (one per line or numbered):\n\n1. Wide establishing shot of the character standing at a sunlit harbor at dawn...\n2. Close-up of the character examining an old brass compass...\n...\n\nPrompts are automatically divided into batches of 20 (e.g., 400 prompts = 20 batches) with continuous numeric filenames (${startNumber}.png, ${startNumber + 1}.png, ...).`}
            className="w-full flex-1 min-h-[170px] resize-y rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] p-3.5 font-mono text-xs leading-relaxed text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:border-[#F2B705] focus:outline-none"
          />

          {parsedAll.length > targetImageCount && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Pasted {parsedAll.length} prompts — capped at your target of{" "}
              {targetImageCount}. Increase Total Images above (up to{" "}
              {MAX_TOTAL_PROMPTS}) to include all of them.
            </p>
          )}

          {/* Launch Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 dark:border-zinc-800/80 pt-3.5">
            <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
              <span>
                {clampedCount} / {targetImageCount} prompts
              </span>
              {plannedBatchCount > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-zinc-800 dark:text-zinc-200">
                    {plannedBatchCount} batch
                    {plannedBatchCount === 1 ? "" : "es"} ({startNumber}.png –{" "}
                    {startNumber + clampedCount - 1}.png)
                  </span>
                </>
              )}
              {lastUsedSceneNumber > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>Last used: {lastUsedSceneNumber}</span>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
              <button
                type="button"
                disabled={activeDrafts.length === 0 || isBatchRunning}
                onClick={() => onLoadMultiBatchPrompts(activeDrafts, false)}
                className="inline-flex flex-1 sm:flex-initial items-center justify-center gap-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#18181B] px-3.5 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:border-zinc-400 dark:hover:border-zinc-500 hover:text-zinc-950 dark:hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
              >
                <Upload className="h-3.5 w-3.5 shrink-0" />
                Load Queue
              </button>

              <button
                type="button"
                disabled={activeDrafts.length === 0 || isBatchRunning}
                onClick={() => onLoadMultiBatchPrompts(activeDrafts, true)}
                className="inline-flex flex-1 sm:flex-initial items-center justify-center gap-2 rounded-lg bg-[#F2B705] px-4 py-2 text-xs font-semibold text-[#09090B] hover:bg-[#f7c52a] disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-center"
              >
                <Play className="h-3.5 w-3.5 fill-current shrink-0" />
                {plannedBatchCount > 1
                  ? `Generate Batch 1 (${Math.min(MAX_BATCH_SCENES, clampedCount)} of ${clampedCount})`
                  : `Generate ${clampedCount || ""} Images`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
