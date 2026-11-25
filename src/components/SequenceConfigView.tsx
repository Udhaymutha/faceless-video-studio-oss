import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { MAX_TOTAL_PROMPTS } from "../data/defaultPresets";
import type {
  AspectRatio,
  BatchSettings,
  ImageModel,
  ImageSize,
  InstructionPreset,
  MasterPromptReview,
  ReferenceImage,
} from "../types/studio";
import { compilePreviewPrompt } from "../utils/promptParser";

interface SequenceConfigViewProps {
  presets: InstructionPreset[];
  activePreset: InstructionPreset;
  settings: BatchSettings;
  referenceImage: ReferenceImage | null;
  review: MasterPromptReview | null;
  sampleScenePrompt: string;
  sampleSceneNumber: number;
  totalCachedImages: number;
  isBatchRunning: boolean;
  onSelectPreset: (presetId: string) => void;
  onUpdateActivePreset: (
    patch: Partial<Pick<InstructionPreset, "negativeRules">>
  ) => void;
  onOpenPresetsManager: () => void;
  onUpdateSettings: (patch: Partial<BatchSettings>) => void;
  onResetSequenceCounter: () => void;
  onClearLocalCache: () => void;
}

const ASPECT_RATIOS: AspectRatio[] = ["16:9", "4:3", "1:1", "3:4", "9:16"];

export function SequenceConfigView({
  presets,
  activePreset,
  settings,
  referenceImage,
  review,
  sampleScenePrompt,
  sampleSceneNumber,
  totalCachedImages,
  isBatchRunning,
  onSelectPreset,
  onUpdateActivePreset,
  onOpenPresetsManager,
  onUpdateSettings,
  onResetSequenceCounter,
  onClearLocalCache,
}: SequenceConfigViewProps) {
  const [showPreview, setShowPreview] = useState(false);

  const compiledPreview = compilePreviewPrompt({
    sceneNumber: sampleSceneNumber,
    prompt: sampleScenePrompt,
    instructions: activePreset.instructions,
    negativeRules: activePreset.negativeRules,
    characterProfile: review?.characterProfile,
    characterNotes: referenceImage?.characterNotes,
    hasReferenceImage: Boolean(referenceImage),
  });

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div className="border-b border-zinc-200 dark:border-zinc-800 pb-5 space-y-1">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          Output &amp; Sequence
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Configure continuous scene numbering, active Director&apos;s Brief
          constraints, image model, aspect ratio, and parallel rendering.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        {/* Left Column: Running Sequence + Director's Brief Preset */}
        <div className="lg:col-span-6 space-y-6">
          {/* Card 1: Running Sequence & Local Cache */}
          <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] p-5 space-y-4 transition-colors">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Running Sequence
              </h2>
              {settings.lastUsedSceneNumber > 0 && (
                <button
                  type="button"
                  disabled={isBatchRunning}
                  onClick={onResetSequenceCounter}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 disabled:opacity-40 transition-colors whitespace-nowrap"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset to 1
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <span className="text-xs text-zinc-500 block">
                  Last Scene Used
                </span>
                <p className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] px-3 py-2 font-mono text-sm font-semibold tabular-nums text-zinc-800 dark:text-zinc-200">
                  {settings.lastUsedSceneNumber > 0
                    ? settings.lastUsedSceneNumber
                    : "—"}
                </p>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="config-start-number"
                  className="text-xs text-zinc-500 block"
                >
                  Batch Start #
                </label>
                <input
                  id="config-start-number"
                  type="number"
                  min={1}
                  max={9999}
                  disabled={isBatchRunning}
                  value={settings.startNumber}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    onUpdateSettings({
                      startNumber: Number.isFinite(val) && val >= 1 ? val : 1,
                    });
                  }}
                  className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] px-3 py-2 font-mono text-sm font-semibold tabular-nums text-amber-700 dark:text-[#F2B705] focus:border-[#F2B705] focus:outline-none disabled:opacity-50"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200 dark:border-zinc-800/80 pt-3 text-xs text-zinc-500">
              <span className="font-mono tabular-nums">
                Local cache: {totalCachedImages} image
                {totalCachedImages === 1 ? "" : "s"}
              </span>
              {totalCachedImages > 0 && (
                <button
                  type="button"
                  disabled={isBatchRunning}
                  onClick={onClearLocalCache}
                  className="inline-flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-40 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear cache
                </button>
              )}
            </div>
          </section>

          {/* Card 2: Director's Brief Preset & Visual Constraints */}
          <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] p-5 space-y-4 transition-colors">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label
                htmlFor="config-preset-select"
                className="font-display text-sm font-semibold text-zinc-900 dark:text-zinc-100"
              >
                Director&apos;s Brief Preset
              </label>
              <button
                type="button"
                onClick={onOpenPresetsManager}
                className="text-xs font-medium text-amber-600 dark:text-[#F2B705] hover:text-amber-700 dark:hover:text-[#f7c52a] transition-colors whitespace-nowrap shrink-0"
              >
                Manage presets
              </button>
            </div>

            <select
              id="config-preset-select"
              value={activePreset.id}
              onChange={(e) => onSelectPreset(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-[#18181B] px-3 py-2.5 text-xs text-zinc-900 dark:text-zinc-100 focus:border-[#F2B705] focus:outline-none"
            >
              {presets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </select>

            <div className="space-y-1.5">
              <label
                htmlFor="config-negative-rules"
                className="text-xs font-medium text-zinc-600 dark:text-zinc-400 block"
              >
                Visual Constraints (Avoid)
              </label>
              <textarea
                id="config-negative-rules"
                rows={4}
                value={activePreset.negativeRules}
                onChange={(e) =>
                  onUpdateActivePreset({ negativeRules: e.target.value })
                }
                placeholder="Elements to exclude across every image..."
                className="w-full resize-y rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] px-3.5 py-2.5 text-xs leading-relaxed text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:border-[#F2B705] focus:outline-none"
              />
            </div>
          </section>
        </div>

        {/* Right Column: Output Settings + Compiled Prompt Preview */}
        <div className="lg:col-span-6 space-y-6">
          {/* Card 3: Output Settings */}
          <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] p-5 space-y-4 transition-colors">
            <h2 className="font-display text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Output Settings
            </h2>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label
                  htmlFor="config-target-count"
                  className="font-medium text-zinc-600 dark:text-zinc-400"
                >
                  Max Sequence Images
                </label>
                <span className="font-mono text-[11px] text-zinc-500 tabular-nums">
                  1–{MAX_TOTAL_PROMPTS}
                </span>
              </div>
              <input
                id="config-target-count"
                type="number"
                min={1}
                max={MAX_TOTAL_PROMPTS}
                disabled={isBatchRunning}
                value={settings.targetImageCount}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!Number.isFinite(val)) return;
                  onUpdateSettings({
                    targetImageCount: Math.max(
                      1,
                      Math.min(MAX_TOTAL_PROMPTS, val)
                    ),
                  });
                }}
                className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] px-3 py-2 font-mono text-sm tabular-nums text-zinc-900 dark:text-zinc-100 focus:border-[#F2B705] focus:outline-none disabled:opacity-50"
              />
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400 block">
                Aspect Ratio
              </span>
              <div className="grid grid-cols-5 gap-2">
                {ASPECT_RATIOS.map((ratio) => {
                  const active = settings.aspectRatio === ratio;
                  return (
                    <button
                      key={ratio}
                      type="button"
                      onClick={() => onUpdateSettings({ aspectRatio: ratio })}
                      className={`min-h-[40px] rounded-lg py-2 font-mono text-xs tabular-nums transition-colors ${
                        active
                          ? "bg-[#F2B705] font-semibold text-[#09090B]"
                          : "border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#18181B] text-zinc-700 dark:text-zinc-300 hover:border-zinc-400 dark:hover:border-zinc-700 hover:text-zinc-950 dark:hover:text-white"
                      }`}
                    >
                      {ratio}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="config-model-select"
                className="text-xs font-medium text-zinc-600 dark:text-zinc-400 block"
              >
                Image Model
              </label>
              <select
                id="config-model-select"
                value={settings.model}
                onChange={(e) =>
                  onUpdateSettings({ model: e.target.value as ImageModel })
                }
                className="w-full rounded-lg border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-[#18181B] px-3 py-2.5 text-xs text-zinc-900 dark:text-zinc-100 focus:border-[#F2B705] focus:outline-none"
              >
                <option value="gemini-3.1-flash-lite-image">
                  Fast Batch (Flash Lite Image)
                </option>
                <option value="gemini-nano-banana-2.1">
                  High Resolution (Nano Banana 2.1)
                </option>
              </select>
            </div>

            {settings.model === "gemini-nano-banana-2.1" && (
              <div className="space-y-1.5">
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400 block">
                  Resolution
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {(["1K", "2K"] as ImageSize[]).map((size) => {
                    const active = settings.imageSize === size;
                    return (
                      <button
                        key={size}
                        type="button"
                        onClick={() => onUpdateSettings({ imageSize: size })}
                        className={`min-h-[40px] rounded-lg py-2 font-mono text-xs tabular-nums transition-colors ${
                          active
                            ? "bg-zinc-900 dark:bg-zinc-100 font-semibold text-white dark:text-zinc-950"
                            : "border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#18181B] text-zinc-700 dark:text-zinc-300 hover:border-zinc-400 dark:hover:border-zinc-700"
                        }`}
                      >
                        {size}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400 block">
                Parallel Generation Jobs
              </span>
              <div className="grid grid-cols-3 gap-2">
                {([1, 2, 3] as const).map((level) => {
                  const active = settings.concurrency === level;
                  return (
                    <button
                      key={level}
                      type="button"
                      onClick={() => onUpdateSettings({ concurrency: level })}
                      className={`min-h-[40px] rounded-lg py-2 font-mono text-xs tabular-nums transition-colors ${
                        active
                          ? "bg-zinc-900 dark:bg-zinc-100 font-semibold text-white dark:text-zinc-950"
                          : "border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#18181B] text-zinc-700 dark:text-zinc-300 hover:border-zinc-400 dark:hover:border-zinc-700"
                      }`}
                    >
                      {level}x
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Card 4: Compiled Prompt Preview */}
          <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] p-5 space-y-3 transition-colors">
            <button
              type="button"
              onClick={() => setShowPreview((prev) => !prev)}
              className="flex w-full items-center justify-between gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100 hover:text-black dark:hover:text-white transition-colors"
            >
              <span>Compiled Prompt (Scene {sampleSceneNumber})</span>
              {showPreview ? (
                <ChevronDown className="h-4 w-4 text-zinc-500 shrink-0" />
              ) : (
                <ChevronRight className="h-4 w-4 text-zinc-500 shrink-0" />
              )}
            </button>

            {showPreview && (
              <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] p-3.5 font-mono text-[11px] leading-relaxed text-zinc-700 dark:text-zinc-400">
                {compiledPreview}
              </pre>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
