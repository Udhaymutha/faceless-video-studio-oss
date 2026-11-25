import { useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  RefreshCw,
  X,
} from "lucide-react";
import type { SceneItem } from "../types/studio";
import { getSceneFilename } from "../utils/promptParser";

interface LightboxModalProps {
  scenes: SceneItem[];
  activeSceneId: string | null;
  startNumber: number;
  onClose: () => void;
  onNavigate: (id: string) => void;
  onDownload: (id: string) => void;
  onRegenerate: (id: string) => void;
}

export function LightboxModal({
  scenes,
  activeSceneId,
  startNumber,
  onClose,
  onNavigate,
  onDownload,
  onRegenerate,
}: LightboxModalProps) {
  const [showCompiled, setShowCompiled] = useState(false);

  const completedEntries = scenes
    .map((scene, idx) => ({ scene, sceneNumber: startNumber + idx }))
    .filter(
      (entry) => entry.scene.status === "completed" && entry.scene.imageDataUrl
    );

  const currentIdx = completedEntries.findIndex(
    (entry) => entry.scene.id === activeSceneId
  );

  const current = currentIdx >= 0 ? completedEntries[currentIdx] : null;

  useEffect(() => {
    if (!current) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowLeft" && currentIdx > 0) {
        onNavigate(completedEntries[currentIdx - 1].scene.id);
      } else if (
        e.key === "ArrowRight" &&
        currentIdx < completedEntries.length - 1
      ) {
        onNavigate(completedEntries[currentIdx + 1].scene.id);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [current, currentIdx, completedEntries, onClose, onNavigate]);

  if (!current || !current.scene.imageDataUrl) {
    return null;
  }

  const filename = getSceneFilename(current.sceneNumber, current.scene.mimeType);
  const hasPrev = currentIdx > 0;
  const hasNext = currentIdx < completedEntries.length - 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Inspect scene ${current.sceneNumber}`}
      className="fixed inset-0 z-50 flex flex-col bg-black/95 backdrop-blur-sm"
    >
      <div className="flex items-center justify-between gap-4 border-b border-zinc-800/80 px-6 py-4">
        <div className="flex items-center gap-3 min-w-0">
          <h2 className="font-mono text-base font-semibold text-zinc-100 tabular-nums">
            {current.sceneNumber}
          </h2>
          <span aria-hidden="true" className="text-zinc-600">
            ·
          </span>
          <span className="font-mono text-xs text-zinc-400 tabular-nums">
            {filename} ({currentIdx + 1} of {completedEntries.length} ready)
          </span>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => onRegenerate(current.scene.id)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:border-zinc-500 hover:text-white transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Regenerate
          </button>
          <button
            type="button"
            onClick={() => onDownload(current.scene.id)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#F2B705] px-3.5 py-1.5 font-mono text-xs font-semibold text-[#09090B] hover:bg-[#f7c52a] transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Download {filename}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close lightbox"
            className="rounded-lg border border-zinc-800 p-2 text-zinc-400 hover:border-zinc-600 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden p-6">
        {hasPrev && (
          <button
            type="button"
            onClick={() => onNavigate(completedEntries[currentIdx - 1].scene.id)}
            aria-label="Previous image"
            className="absolute left-5 z-10 rounded-full border border-zinc-700 bg-zinc-950/85 p-3 text-zinc-200 hover:border-zinc-500 hover:text-white transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}

        <img
          src={current.scene.imageDataUrl}
          alt={`Scene ${current.sceneNumber}`}
          referrerPolicy="no-referrer"
          className="max-h-[68vh] max-w-[85vw] rounded-lg border border-zinc-800 object-contain shadow-2xl"
        />

        {hasNext && (
          <button
            type="button"
            onClick={() => onNavigate(completedEntries[currentIdx + 1].scene.id)}
            aria-label="Next image"
            className="absolute right-5 z-10 rounded-full border border-zinc-700 bg-zinc-950/85 p-3 text-zinc-200 hover:border-zinc-500 hover:text-white transition-colors"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        )}
      </div>

      <div className="border-t border-zinc-800/80 bg-[#0d0d10] px-6 py-4">
        <div className="mx-auto max-w-4xl space-y-2">
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs font-medium text-zinc-400">
              {showCompiled
                ? "Full Compiled Prompt Sent to Model"
                : `Scene ${current.sceneNumber} Prompt`}
            </span>
            {current.scene.compiledPrompt && (
              <button
                type="button"
                onClick={() => setShowCompiled((v) => !v)}
                className="text-xs font-medium text-[#F2B705] hover:text-[#f7c52a]"
              >
                {showCompiled ? "Show scene prompt only" : "View compiled prompt"}
              </button>
            )}
          </div>

          <p className="max-h-28 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-zinc-200">
            {showCompiled && current.scene.compiledPrompt
              ? current.scene.compiledPrompt
              : current.scene.prompt}
          </p>
        </div>
      </div>
    </div>
  );
}
