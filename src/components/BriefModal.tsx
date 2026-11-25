import { useEffect } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  X,
  XCircle,
} from "lucide-react";
import type { InstructionPreset, MasterPromptReview } from "../types/studio";

interface BriefModalProps {
  isOpen: boolean;
  activePreset: InstructionPreset;
  review: MasterPromptReview | null;
  isReviewCurrent: boolean;
  isReviewing: boolean;
  reviewError: string | null;
  onClose: () => void;
  onUpdateInstructions: (instructions: string) => void;
  onUpdateNegativeRules: (negativeRules: string) => void;
  onRunReviewNow: () => void;
}

export function BriefModal({
  isOpen,
  activePreset,
  review,
  isReviewCurrent,
  isReviewing,
  reviewError,
  onClose,
  onUpdateInstructions,
  onUpdateNegativeRules,
  onRunReviewNow,
}: BriefModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isReviewed = isReviewCurrent && Boolean(review);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Director's Brief"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4"
    >
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 px-6 py-4">
          <div className="flex items-center gap-3 min-w-0">
            {isReviewing ? (
              <Loader2 className="h-5 w-5 animate-spin text-amber-600 dark:text-[#F2B705] shrink-0" />
            ) : isReviewed ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <XCircle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0" />
            )}
            <div className="min-w-0">
              <h2 className="font-display text-base font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                Director&apos;s Brief
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                {activePreset.name} ·{" "}
                {isReviewing
                  ? "Reviewing directives…"
                  : isReviewed
                    ? "Reviewed and active"
                    : "Not yet reviewed"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onRunReviewNow}
              disabled={isReviewing}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#F2B705] px-3.5 py-1.5 text-xs font-semibold text-[#09090B] hover:bg-[#f7c52a] disabled:opacity-40 transition-colors whitespace-nowrap"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isReviewing ? "animate-spin" : ""}`}
              />
              {isReviewing ? "Reviewing…" : "Review Now"}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Director's Brief"
              className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-1.5 text-zinc-500 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-600 hover:text-zinc-900 dark:hover:text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {reviewError && (
            <div className="flex items-start gap-2.5 rounded-lg border border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-950/35 px-4 py-3 text-xs text-red-700 dark:text-red-200">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-500 dark:text-red-400 mt-0.5" />
              <span>{reviewError}</span>
            </div>
          )}

          {isReviewed && review && (
            <div className="rounded-lg border border-emerald-300 dark:border-emerald-500/30 bg-emerald-50 dark:bg-[#0f1814] p-4 space-y-2 text-xs">
              <div className="flex items-center gap-2 font-semibold text-emerald-800 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>
                  Brief Verified
                  {review.reviewedWithReference
                    ? " · Master Stickman Reference Directory Linked"
                    : " · Ready for Master Stickman Reference Directory"}
                </span>
              </div>
              <p className="text-zinc-800 dark:text-zinc-200 leading-relaxed">
                {review.styleLock}
              </p>
              {review.characterProfile && (
                <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  {review.characterProfile}
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <label
              htmlFor="brief-modal-instructions"
              className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block"
            >
              Production Workflow &amp; Continuity Rules
            </label>
            <textarea
              id="brief-modal-instructions"
              rows={13}
              value={activePreset.instructions}
              onChange={(e) => onUpdateInstructions(e.target.value)}
              className="w-full resize-y rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] p-3.5 font-mono text-xs leading-relaxed text-zinc-800 dark:text-zinc-200 focus:border-[#F2B705] focus:outline-none"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="brief-modal-negative"
              className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block"
            >
              Visual Constraints (Avoid)
            </label>
            <textarea
              id="brief-modal-negative"
              rows={2}
              value={activePreset.negativeRules}
              onChange={(e) => onUpdateNegativeRules(e.target.value)}
              className="w-full resize-y rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] p-3 text-xs leading-relaxed text-zinc-800 dark:text-zinc-200 focus:border-[#F2B705] focus:outline-none"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
