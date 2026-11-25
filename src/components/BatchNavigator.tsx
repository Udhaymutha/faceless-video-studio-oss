import {
  Archive,
  CheckCircle2,
  Download,
  HardDrive,
  Loader2,
  Undo2,
  X,
} from "lucide-react";
import type { SequenceBatch } from "../types/studio";

interface BatchNavigatorProps {
  batches: SequenceBatch[];
  activeBatchIndex: number;
  selectedBatchIndices: number[];
  isBatchRunning: boolean;
  isZipping: boolean;
  totalCachedImages: number;
  totalQueuedPrompts: number;
  onSelectBatchTab: (batchIndex: number) => void;
  onToggleSelectBatchForExport: (batchIndex: number) => void;
  onDownloadSingleBatch: (batchIndex: number) => void;
  onDownloadSelectedBatches: () => void;
  onDownloadFullSequence: () => void;
  onResetSingleBatch: (batchIndex: number) => void;
  onRemoveBatch: (batchIndex: number) => void;
  onResetAllBatches: () => void;
}

export function BatchNavigator({
  batches,
  activeBatchIndex,
  selectedBatchIndices,
  isBatchRunning,
  isZipping,
  totalCachedImages,
  totalQueuedPrompts,
  onSelectBatchTab,
  onToggleSelectBatchForExport,
  onDownloadSingleBatch,
  onDownloadSelectedBatches,
  onDownloadFullSequence,
  onResetSingleBatch,
  onRemoveBatch,
  onResetAllBatches,
}: BatchNavigatorProps) {
  if (batches.length === 0) return null;

  const selectedSet = new Set(selectedBatchIndices);
  const selectedImageCount = batches
    .filter((b) => selectedSet.has(b.batchIndex))
    .reduce((acc, b) => acc + b.completedCount, 0);

  return (
    <section
      aria-label="Multi-Batch Queue and Local Cache"
      className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] p-4 space-y-3.5 transition-colors"
    >
      {/* Top Summary & Export Bar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 font-semibold text-zinc-900 dark:text-zinc-100">
            <HardDrive className="h-3.5 w-3.5 text-amber-600 dark:text-[#F2B705]" />
            Sequence Batches ({batches.length})
          </span>
          <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-700">
            ·
          </span>
          <span className="font-mono text-zinc-600 dark:text-zinc-400 tabular-nums">
            {totalCachedImages} / {totalQueuedPrompts} images ready in local
            cache
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          {/* Cancel & Reset All Batches Button */}
          <div className="relative group">
            <button
              type="button"
              onClick={onResetAllBatches}
              disabled={isZipping}
              aria-label="Cancel and reset all batches"
              title="Cancel & Reset All Batches"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#18181B] px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:border-[#F2B705] hover:text-amber-600 dark:hover:text-[#F2B705] disabled:opacity-40 transition-colors whitespace-nowrap"
            >
              <Undo2 className="h-3.5 w-3.5 shrink-0" />
              Reset Batches
            </button>
          </div>

          {selectedBatchIndices.length > 0 && (
            <button
              type="button"
              onClick={onDownloadSelectedBatches}
              disabled={isZipping || selectedImageCount === 0}
              className="inline-flex w-full sm:w-auto items-center justify-center gap-1.5 rounded-lg border border-amber-500/60 dark:border-[#F2B705]/50 bg-amber-50 dark:bg-[#F2B705]/10 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:text-[#F2B705] hover:bg-amber-100 dark:hover:bg-[#F2B705]/20 disabled:opacity-40 transition-colors text-center"
            >
              <Download className="h-3.5 w-3.5 shrink-0" />
              Download Selected ({selectedBatchIndices.length} batch
              {selectedBatchIndices.length === 1 ? "" : "es"} ·{" "}
              {selectedImageCount})
            </button>
          )}

          <button
            type="button"
            onClick={onDownloadFullSequence}
            disabled={isZipping || totalCachedImages === 0}
            className="inline-flex w-full sm:w-auto items-center justify-center gap-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-100 px-3.5 py-1.5 text-xs font-semibold text-white dark:text-zinc-950 hover:bg-black dark:hover:bg-white disabled:opacity-35 disabled:cursor-not-allowed transition-colors text-center"
          >
            <Archive className="h-3.5 w-3.5 shrink-0" />
            {isZipping
              ? "Packaging ZIP…"
              : totalCachedImages > 0
                ? `Download All Sequences ZIP (${totalCachedImages})`
                : "Download All ZIP"}
          </button>
        </div>
      </div>

      {/* Batch Cards Strip */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {batches.map((batch) => {
          const isActive = batch.batchIndex === activeBatchIndex;
          const isThisBatchRunning = isActive && isBatchRunning;
          const rangeEnd =
            batch.startNumber + Math.max(batch.prompts.length, 1) - 1;
          const isComplete =
            batch.prompts.length > 0 &&
            batch.completedCount >= batch.prompts.length;
          const hasImages = batch.completedCount > 0;
          const canResetBatch =
            isThisBatchRunning || hasImages || batch.failedCount > 0;
          const isChecked = selectedSet.has(batch.batchIndex);

          return (
            <div
              key={`${batch.batchIndex}-${batch.startNumber}`}
              className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 transition-colors ${
                isActive
                  ? "border-[#F2B705] bg-amber-50/50 dark:bg-[#18181B]"
                  : "border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] hover:border-zinc-300 dark:hover:border-zinc-700"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <input
                  type="checkbox"
                  checked={isChecked}
                  disabled={!hasImages}
                  onChange={() =>
                    onToggleSelectBatchForExport(batch.batchIndex)
                  }
                  aria-label={`Select Batch ${batch.batchIndex + 1} for ZIP download`}
                  title={
                    hasImages
                      ? `Include Batch ${batch.batchIndex + 1} in selected download`
                      : "Generate images first to select"
                  }
                  className="h-3.5 w-3.5 rounded border-zinc-400 dark:border-zinc-700 bg-white dark:bg-[#111114] accent-[#F2B705] disabled:opacity-30 shrink-0 cursor-pointer"
                />

                <button
                  type="button"
                  disabled={isBatchRunning && !isActive}
                  onClick={() => onSelectBatchTab(batch.batchIndex)}
                  className="min-w-0 flex-1 text-left disabled:opacity-50"
                >
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
                      Batch {batch.batchIndex + 1}
                    </span>
                    <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums whitespace-nowrap">
                      {batch.startNumber}–{rangeEnd}
                    </span>
                  </div>

                  <div className="mt-0.5 flex items-center gap-1.5 text-[11px] font-mono tabular-nums">
                    {isThisBatchRunning ? (
                      <span className="inline-flex items-center gap-1 text-amber-600 dark:text-[#F2B705]">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        {batch.completedCount}/{batch.prompts.length}
                      </span>
                    ) : isComplete ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" />
                        Cached {batch.completedCount}/{batch.prompts.length}
                      </span>
                    ) : hasImages ? (
                      <span className="text-zinc-700 dark:text-zinc-300">
                        {batch.completedCount}/{batch.prompts.length} ready
                      </span>
                    ) : (
                      <span className="text-zinc-500">
                        Pending ({batch.prompts.length})
                      </span>
                    )}
                  </div>
                </button>
              </div>

              {/* Per-Batch Action Buttons: Download · Reset · Remove (X) */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  disabled={!hasImages || isZipping}
                  onClick={() => onDownloadSingleBatch(batch.batchIndex)}
                  aria-label={`Download Batch ${batch.batchIndex + 1} ZIP`}
                  title={
                    hasImages
                      ? `Download Batch ${batch.batchIndex + 1} (${batch.startNumber}–${rangeEnd}) ZIP`
                      : "No images ready in this batch yet"
                  }
                  className="rounded-md border border-zinc-200 dark:border-zinc-800 p-1.5 text-zinc-500 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-600 hover:text-zinc-900 dark:hover:text-zinc-100 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                </button>

                {/* Per-Batch Cancel / Reset Icon Button */}
                <div className="relative group">
                  <button
                    type="button"
                    disabled={!canResetBatch || isZipping}
                    onClick={() => onResetSingleBatch(batch.batchIndex)}
                    aria-label={
                      isThisBatchRunning
                        ? `Cancel and reset Batch ${batch.batchIndex + 1}`
                        : `Reset Batch ${batch.batchIndex + 1}`
                    }
                    title={
                      isThisBatchRunning
                        ? `Cancel & Reset Batch ${batch.batchIndex + 1}`
                        : `Reset Batch ${batch.batchIndex + 1}`
                    }
                    className="rounded-md border border-zinc-200 dark:border-zinc-800 p-1.5 text-zinc-500 dark:text-zinc-400 hover:border-[#F2B705] hover:text-amber-600 dark:hover:text-[#F2B705] disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                  </button>
                  <span
                    role="tooltip"
                    className="pointer-events-none absolute right-0 bottom-full z-20 mb-1.5 rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-900 dark:bg-zinc-950 px-2 py-1 text-[11px] font-medium text-zinc-100 opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 whitespace-nowrap"
                  >
                    {isThisBatchRunning ? "Cancel & Reset Batch" : "Reset Batch"}
                  </span>
                </div>

                {/* Per-Batch Cross Mark (Remove from Queue) */}
                <div className="relative group">
                  <button
                    type="button"
                    disabled={isZipping}
                    onClick={() => onRemoveBatch(batch.batchIndex)}
                    aria-label={`Remove Batch ${batch.batchIndex + 1} from queue`}
                    title={`Remove Batch ${batch.batchIndex + 1} from queue`}
                    className="rounded-md border border-zinc-200 dark:border-zinc-800 p-1.5 text-zinc-500 dark:text-zinc-400 hover:border-red-400 dark:hover:border-red-500/60 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                  <span
                    role="tooltip"
                    className="pointer-events-none absolute right-0 bottom-full z-20 mb-1.5 rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-900 dark:bg-zinc-950 px-2 py-1 text-[11px] font-medium text-zinc-100 opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 whitespace-nowrap"
                  >
                    Remove Batch
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
