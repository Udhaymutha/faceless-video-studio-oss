import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Clock,
  Download,
  Expand,
  Film,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react";
import type { AspectRatio, SceneItem } from "../types/studio";
import { getSceneFilename } from "../utils/promptParser";

interface SceneCardProps {
  scene: SceneItem;
  index: number;
  totalScenes: number;
  sceneNumber: number;
  aspectRatio: AspectRatio;
  onUpdatePrompt: (id: string, prompt: string) => void;
  onGenerateSingle: (id: string) => void;
  onDownloadSingle: (id: string) => void;
  onInspect: (id: string) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onDelete: (id: string) => void;
}

const ASPECT_CLASS_MAP: Record<AspectRatio, string> = {
  "16:9": "aspect-video",
  "4:3": "aspect-[4/3]",
  "1:1": "aspect-square",
  "3:4": "aspect-[3/4]",
  "9:16": "aspect-[9/16]",
};

export function SceneCard({
  scene,
  index,
  totalScenes,
  sceneNumber,
  aspectRatio,
  onUpdatePrompt,
  onGenerateSingle,
  onDownloadSingle,
  onInspect,
  onMoveUp,
  onMoveDown,
  onDelete,
}: SceneCardProps) {
  const filename = getSceneFilename(sceneNumber, scene.mimeType);
  const aspectClass = ASPECT_CLASS_MAP[aspectRatio];
  const isBusy = scene.status === "generating" || scene.status === "queued";

  return (
    <article className="flex flex-col rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] overflow-hidden transition-colors hover:border-zinc-300 dark:hover:border-zinc-700/90">
      {/* Header Row — Labeled with strict scene number */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-zinc-200 dark:border-zinc-800/80">
        <div className="flex items-center gap-2 min-w-0 text-xs">
          <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums whitespace-nowrap">
            {sceneNumber}
          </span>
          <span aria-hidden="true" className="text-zinc-400 dark:text-zinc-600">
            ·
          </span>
          <span className="font-mono text-zinc-500 dark:text-zinc-400 tabular-nums whitespace-nowrap">
            {filename}
          </span>
          <span aria-hidden="true" className="text-zinc-400 dark:text-zinc-600">
            ·
          </span>
          {scene.status === "completed" && (
            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              Ready
            </span>
          )}
          {scene.status === "generating" && (
            <span className="inline-flex items-center gap-1 text-amber-600 dark:text-[#F2B705] whitespace-nowrap">
              <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
              Rendering
            </span>
          )}
          {scene.status === "queued" && (
            <span className="inline-flex items-center gap-1 text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              Queued
            </span>
          )}
          {scene.status === "error" && (
            <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 whitespace-nowrap">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              Failed
            </span>
          )}
          {scene.status === "idle" && (
            <span className="text-zinc-500 whitespace-nowrap">Draft</span>
          )}
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={() => onMoveUp(index)}
            disabled={index === 0 || isBusy}
            aria-label={`Move scene ${sceneNumber} earlier`}
            title="Move earlier in sequence"
            className="rounded-md p-1 text-zinc-400 dark:text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-800 dark:hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onMoveDown(index)}
            disabled={index === totalScenes - 1 || isBusy}
            aria-label={`Move scene ${sceneNumber} later`}
            title="Move later in sequence"
            className="rounded-md p-1 text-zinc-400 dark:text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-800 dark:hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(scene.id)}
            disabled={totalScenes <= 1 || isBusy}
            aria-label={`Remove scene ${sceneNumber}`}
            title="Remove scene slot"
            className="rounded-md p-1 text-zinc-400 dark:text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Media Frame */}
      <div
        className={`relative w-full ${aspectClass} bg-zinc-100 dark:bg-[#09090B] overflow-hidden`}
      >
        {scene.status === "completed" && scene.imageDataUrl ? (
          <div className="group relative h-full w-full">
            <img
              src={scene.imageDataUrl}
              alt={`Scene ${sceneNumber}`}
              referrerPolicy="no-referrer"
              onClick={() => onInspect(scene.id)}
              className="h-full w-full object-cover cursor-pointer transition-transform duration-200 group-hover:scale-[1.015]"
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/80 via-black/35 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-150" />
            <div className="absolute bottom-3 right-3 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
              <button
                type="button"
                onClick={() => onInspect(scene.id)}
                className="inline-flex items-center gap-1.5 rounded-md bg-zinc-950/90 border border-zinc-700 px-2.5 py-1.5 text-xs font-medium text-zinc-100 hover:bg-zinc-900"
              >
                <Expand className="h-3.5 w-3.5" />
                Inspect
              </button>
              <button
                type="button"
                onClick={() => onDownloadSingle(scene.id)}
                className="inline-flex items-center gap-1.5 rounded-md bg-[#F2B705] px-2.5 py-1.5 font-mono text-xs font-semibold text-[#09090B] hover:bg-[#f7c52a]"
              >
                <Download className="h-3.5 w-3.5" />
                {filename}
              </button>
            </div>
          </div>
        ) : scene.status === "generating" ? (
          <div className="studio-shimmer relative flex h-full w-full flex-col items-center justify-center gap-2.5 bg-zinc-100 dark:bg-[#121216] p-4 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-amber-600 dark:text-[#F2B705]" />
            <div className="space-y-0.5">
              <p className="font-mono text-xs font-medium text-zinc-800 dark:text-zinc-200 tabular-nums">
                Rendering {filename}
              </p>
              <p className="text-[11px] text-zinc-500">
                Pulling from Master Stickman Reference Directory
              </p>
            </div>
          </div>
        ) : scene.status === "queued" ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-zinc-100 dark:bg-[#0d0d10] p-4 text-center">
            <Clock className="h-5 w-5 text-zinc-400 dark:text-zinc-600" />
            <p className="font-mono text-xs text-zinc-600 dark:text-zinc-400 tabular-nums">
              {filename} queued
            </p>
          </div>
        ) : scene.status === "error" ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-red-50 dark:bg-red-950/20 p-5 text-center">
            <AlertCircle className="h-5 w-5 text-red-500 dark:text-red-400 shrink-0" />
            <p className="max-w-xs text-xs leading-relaxed text-red-700 dark:text-red-200 line-clamp-3">
              {scene.errorMessage || "Failed to generate this scene."}
            </p>
            <button
              type="button"
              onClick={() => onGenerateSingle(scene.id)}
              className="inline-flex items-center gap-1.5 rounded-md border border-red-300 dark:border-red-500/40 bg-white dark:bg-red-950/60 px-3 py-1.5 text-xs font-medium text-red-700 dark:text-red-100 hover:bg-red-50 dark:hover:bg-red-900/60 transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Retry {sceneNumber}
            </button>
          </div>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-zinc-100/80 dark:bg-[#0c0c0f] p-4 text-center">
            <Film className="h-5 w-5 text-zinc-400 dark:text-zinc-700" />
            <div className="flex items-center gap-2 font-mono text-xs text-zinc-500 tabular-nums">
              <span>{filename}</span>
              <span aria-hidden="true">·</span>
              <span>{aspectRatio}</span>
            </div>
          </div>
        )}
      </div>

      {/* Prompt Editor & Actions */}
      <div className="flex flex-1 flex-col gap-3 p-4">
        {scene.narration && (
          <p className="text-xs italic text-zinc-500 dark:text-zinc-400 line-clamp-2">
            “{scene.narration}”
          </p>
        )}

        <textarea
          rows={3}
          value={scene.prompt}
          onChange={(e) => onUpdatePrompt(scene.id, e.target.value)}
          placeholder={`Describe scene ${sceneNumber}...`}
          aria-label={`Prompt for scene ${sceneNumber}`}
          className="w-full flex-1 resize-none rounded-lg border border-zinc-200 dark:border-zinc-800/90 bg-zinc-50 dark:bg-[#09090B] px-3 py-2 text-xs leading-relaxed text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:border-[#F2B705] focus:outline-none"
        />

        <div className="flex items-center justify-between gap-2 pt-1">
          <button
            type="button"
            onClick={() => onGenerateSingle(scene.id)}
            disabled={isBusy || !scene.prompt.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#18181B] px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:border-zinc-400 dark:hover:border-zinc-500 hover:text-zinc-950 dark:hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${scene.status === "generating" ? "animate-spin" : ""}`}
            />
            {scene.status === "completed" ? "Regenerate" : "Generate"}
          </button>

          <button
            type="button"
            onClick={() => onDownloadSingle(scene.id)}
            disabled={scene.status !== "completed" || !scene.imageDataUrl}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-1.5 font-mono text-xs text-zinc-700 dark:text-zinc-300 hover:border-zinc-400 dark:hover:border-zinc-600 hover:text-zinc-950 dark:hover:text-white disabled:opacity-35 disabled:cursor-not-allowed transition-colors whitespace-nowrap tabular-nums"
          >
            <Download className="h-3.5 w-3.5" />
            {filename}
          </button>
        </div>
      </div>
    </article>
  );
}
