import { useMemo, useState } from "react";
import { FileText, Play, Trash2, Upload } from "lucide-react";
import {
  MAX_BATCH_SCENES,
  MAX_TOTAL_PROMPTS,
  SAMPLE_TWENTY_SCENE_SCRIPT,
} from "../data/defaultPresets";
import { parseBulkPrompts } from "../utils/promptParser";
import type { ParsedSceneDraft } from "../utils/promptParser";

interface BulkImportViewProps {
  startNumber: number;
  targetImageCount: number;
  hasReferenceImage: boolean;
  onUpdateTargetImageCount: (count: number) => void;
  onApplyMultiBatch: (
    drafts: ParsedSceneDraft[],
    autoGenerateFirstBatch: boolean
  ) => void;
}

export function BulkImportView({
  startNumber,
  targetImageCount,
  hasReferenceImage,
  onUpdateTargetImageCount,
  onApplyMultiBatch,
}: BulkImportViewProps) {
  const [rawInput, setRawInput] = useState("");

  const allParsed = useMemo(() => parseBulkPrompts(rawInput), [rawInput]);
  const clamped = allParsed.slice(0, targetImageCount);
  const totalBatches = Math.ceil(clamped.length / MAX_BATCH_SCENES);

  const batchGroups = useMemo(() => {
    const groups: Array<{
      batchNumber: number;
      from: number;
      to: number;
      items: ParsedSceneDraft[];
    }> = [];
    for (let i = 0; i < clamped.length; i += MAX_BATCH_SCENES) {
      const items = clamped.slice(i, i + MAX_BATCH_SCENES);
      groups.push({
        batchNumber: groups.length + 1,
        from: startNumber + i,
        to: startNumber + i + items.length - 1,
        items,
      });
    }
    return groups;
  }, [clamped, startNumber]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between border-b border-zinc-200 dark:border-zinc-800 pb-5">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Bulk Import (Up to {MAX_TOTAL_PROMPTS} Prompts · 20 per Batch)
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Paste up to {MAX_TOTAL_PROMPTS} prompts at once. FrameForge
            automatically divides them into 20-image batches cached locally in
            sequence starting at{" "}
            <span className="font-mono text-xs text-amber-700 dark:text-[#F2B705]">
              {startNumber}.png
            </span>
            .
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] px-3 py-1.5 text-xs">
            <label
              htmlFor="bulk-target-input"
              className="text-zinc-600 dark:text-zinc-400"
            >
              Max Images
            </label>
            <input
              id="bulk-target-input"
              type="number"
              min={1}
              max={MAX_TOTAL_PROMPTS}
              value={targetImageCount}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (!Number.isFinite(v)) return;
                onUpdateTargetImageCount(
                  Math.max(1, Math.min(MAX_TOTAL_PROMPTS, v))
                );
              }}
              className="w-14 bg-transparent font-mono font-semibold text-amber-700 dark:text-[#F2B705] text-right focus:outline-none tabular-nums"
            />
          </div>

          <button
            type="button"
            onClick={() => setRawInput(SAMPLE_TWENTY_SCENE_SCRIPT)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#18181B] px-3.5 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:border-zinc-400 dark:hover:border-zinc-500 hover:text-zinc-950 dark:hover:text-white transition-colors whitespace-nowrap"
          >
            <FileText className="h-3.5 w-3.5" />
            Load 20-Prompt Sample
          </button>

          {rawInput.trim() && (
            <button
              type="button"
              onClick={() => setRawInput("")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 px-3 py-2 text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-700 hover:text-red-600 dark:hover:text-red-400 transition-colors whitespace-nowrap"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12 items-start">
        <div className="xl:col-span-7 space-y-3">
          <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
            <label
              htmlFor="bulk-prompt-textarea"
              className="font-medium text-zinc-800 dark:text-zinc-200"
            >
              Paste Prompts (Up to {targetImageCount})
            </label>
            <span className="font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
              {clamped.length} / {targetImageCount} queued · {totalBatches}{" "}
              batch{totalBatches === 1 ? "" : "es"}
            </span>
          </div>

          <textarea
            id="bulk-prompt-textarea"
            rows={20}
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            placeholder={`Paste up to ${targetImageCount} prompts (e.g., 400 prompts = 20 batches of 20):\n\n1. Wide establishing shot of the character standing at a sunlit harbor at dawn\n2. Close-up of the character examining an old brass compass\n...\n\nEach batch generates 20 images, caches them locally, and continues seamlessly until all batches complete.`}
            className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] p-4 font-mono text-xs leading-relaxed text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:border-[#F2B705] focus:outline-none"
          />

          {allParsed.length > targetImageCount && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {allParsed.length} prompts detected — raise Max Images above (up
              to {MAX_TOTAL_PROMPTS}) to include prompts beyond{" "}
              {targetImageCount}.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              disabled={clamped.length === 0}
              onClick={() => onApplyMultiBatch(clamped, false)}
              className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#18181B] px-4 py-2.5 text-sm font-medium text-zinc-900 dark:text-zinc-100 hover:border-zinc-400 dark:hover:border-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-center"
            >
              <Upload className="h-4 w-4 shrink-0" />
              Load {clamped.length} Prompts ({totalBatches} Batch
              {totalBatches === 1 ? "" : "es"})
            </button>

            <button
              type="button"
              disabled={clamped.length === 0}
              onClick={() => onApplyMultiBatch(clamped, true)}
              className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-lg bg-[#F2B705] px-4 py-2.5 text-sm font-semibold text-[#09090B] hover:bg-[#f7c52a] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Play className="h-4 w-4 fill-current shrink-0" />
              Load &amp; Start Batch 1
            </button>
          </div>
        </div>

        <div className="xl:col-span-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] overflow-hidden">
          <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 px-4 py-3">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Multi-Batch Breakdown
            </h2>
            <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
              {clamped.length > 0
                ? `${startNumber}.png – ${startNumber + clamped.length - 1}.png`
                : "No prompts yet"}
            </span>
          </div>

          {batchGroups.length === 0 ? (
            <div className="flex min-h-[340px] flex-col items-center justify-center p-8 text-center">
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Up to 20 Batches × 20 Images
              </p>
              <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-zinc-500">
                Paste up to {MAX_TOTAL_PROMPTS} prompts on the left. Each
                completed batch is cached locally so you can download individual
                batches (e.g., Batch 1 &amp; Batch 3) or all images in one ZIP
                at the end.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-200 dark:divide-zinc-800 max-h-[540px] overflow-y-auto">
              {batchGroups.map((group) => (
                <div key={group.batchNumber} className="px-4 py-3 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-amber-700 dark:text-[#F2B705]">
                      Batch {group.batchNumber}
                    </span>
                    <span className="font-mono text-zinc-700 dark:text-zinc-300 tabular-nums">
                      {group.from}.png – {group.to}.png ({group.items.length})
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-600 dark:text-zinc-400 line-clamp-1">
                    First: {group.items[0]?.prompt}
                  </p>
                  <p className="text-[11px] text-zinc-500">
                    {hasReferenceImage
                      ? "Auto-linked to Master Stickman Character Reference Directory"
                      : "Pulls automatically from Master Stickman Reference Directory when loaded"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
