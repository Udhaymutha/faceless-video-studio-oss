import { useEffect } from "react";
import {
  CheckCircle2,
  FolderCheck,
  HardDrive,
  Monitor,
  Moon,
  RotateCcw,
  Sun,
  Trash2,
  X,
} from "lucide-react";
import { MAX_TOTAL_PROMPTS } from "../data/defaultPresets";
import type {
  AspectRatio,
  BatchSettings,
  ImageModel,
  ImageSize,
  ReferenceImage,
  ThemeMode,
} from "../types/studio";

interface SettingsPopoverProps {
  isOpen: boolean;
  settings: BatchSettings;
  resolvedTheme: "dark" | "light";
  referenceImage: ReferenceImage | null;
  totalCachedImages: number;
  isBatchRunning: boolean;
  onClose: () => void;
  onUpdateSettings: (patch: Partial<BatchSettings>) => void;
  onResetSequenceCounter: () => void;
  onClearLocalCache: () => void;
}

const THEME_OPTIONS: Array<{
  id: ThemeMode;
  label: string;
  icon: typeof Moon;
}> = [
  { id: "dark", label: "Dark", icon: Moon },
  { id: "light", label: "Light", icon: Sun },
  { id: "system", label: "System", icon: Monitor },
];

const ASPECT_RATIOS: AspectRatio[] = ["16:9", "4:3", "1:1", "3:4", "9:16"];

export function SettingsPopover({
  isOpen,
  settings,
  resolvedTheme,
  referenceImage,
  totalCachedImages,
  isBatchRunning,
  onClose,
  onUpdateSettings,
  onResetSequenceCounter,
  onClearLocalCache,
}: SettingsPopoverProps) {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4"
      role="presentation"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/55 backdrop-blur-xs"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Responsive Pop-Up Dialog (bottom sheet on mobile, centered dialog on desktop) */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Workspace Settings"
        className="relative z-10 w-full sm:max-w-[440px] max-h-[88vh] overflow-y-auto rounded-t-2xl sm:rounded-xl border border-zinc-200 dark:border-zinc-700/90 bg-white dark:bg-[#111114] shadow-2xl"
      >
        {/* Mobile drag handle indicator */}
        <div className="flex justify-center pt-2.5 pb-0.5 sm:hidden" aria-hidden="true">
          <span className="h-1 w-10 rounded-full bg-zinc-300 dark:bg-zinc-700" />
        </div>

        {/* Popover Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-[#111114]/95 backdrop-blur-sm px-5 py-3.5">
          <div>
            <h2 className="font-display text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Workspace Settings
            </h2>
            <p className="text-[11px] text-zinc-500">
              Active theme: {resolvedTheme === "dark" ? "Dark Studio" : "Light Studio"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close workspace settings"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-600 hover:text-zinc-900 dark:hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Section 1: Interface Theme */}
          <section className="space-y-2.5">
            <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 block">
              Interface Theme
            </span>
            <div className="grid grid-cols-3 gap-2.5">
              {THEME_OPTIONS.map((option) => {
                const Icon = option.icon;
                const isSelected = settings.theme === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => onUpdateSettings({ theme: option.id })}
                    className={`flex flex-col items-start gap-2 rounded-lg border p-2.5 text-left transition-colors ${
                      isSelected
                        ? "border-[#F2B705] bg-amber-50/70 dark:bg-[#18181B]"
                        : "border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-[#09090B] hover:border-zinc-400 dark:hover:border-zinc-600"
                    }`}
                  >
                    <div
                      className={`w-full h-9 rounded border p-1.5 flex flex-col justify-between ${
                        option.id === "light"
                          ? "bg-[#F5F5F7] border-zinc-300"
                          : option.id === "dark"
                            ? "bg-[#09090B] border-zinc-800"
                            : "bg-gradient-to-r from-[#09090B] via-[#09090B] to-[#F5F5F7] border-zinc-500/50"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`h-1.5 w-6 rounded-xs ${
                            option.id === "light" ? "bg-zinc-800" : "bg-zinc-200"
                          }`}
                        />
                        <span className="h-1.5 w-3 rounded-xs bg-[#F2B705]" />
                      </div>
                      <div className="grid grid-cols-2 gap-1">
                        <span
                          className={`h-2.5 rounded-xs border ${
                            option.id === "light"
                              ? "bg-white border-zinc-300"
                              : "bg-[#18181B] border-zinc-700"
                          }`}
                        />
                        <span
                          className={`h-2.5 rounded-xs border ${
                            option.id === "light"
                              ? "bg-white border-zinc-300"
                              : "bg-[#18181B] border-zinc-700"
                          }`}
                        />
                      </div>
                    </div>

                    <div className="flex w-full items-center justify-between gap-1">
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-zinc-900 dark:text-zinc-100">
                        <Icon className="h-3 w-3 text-amber-600 dark:text-[#F2B705]" />
                        {option.label}
                      </span>
                      {isSelected && (
                        <CheckCircle2 className="h-3.5 w-3.5 text-amber-600 dark:text-[#F2B705] shrink-0" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <div className="border-t border-zinc-200 dark:border-zinc-800" />

          {/* Section 2: Default Batch & Output Preferences */}
          <section className="space-y-3.5">
            <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 block">
              Default Batch &amp; Output Preferences
            </span>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label
                  htmlFor="popover-model"
                  className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400 block"
                >
                  Image Model
                </label>
                <select
                  id="popover-model"
                  value={settings.model}
                  onChange={(e) =>
                    onUpdateSettings({ model: e.target.value as ImageModel })
                  }
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] px-2.5 py-2 text-xs text-zinc-900 dark:text-zinc-100 focus:border-[#F2B705] focus:outline-none"
                >
                  <option value="gemini-3.1-flash-lite-image">
                    Fast Batch (Flash Lite)
                  </option>
                  <option value="gemini-nano-banana-2.1">
                    High Res (Nano Banana 2.1)
                  </option>
                </select>
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="popover-target-count"
                  className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400 block"
                >
                  Total Images (1–{MAX_TOTAL_PROMPTS})
                </label>
                <input
                  id="popover-target-count"
                  type="number"
                  min={1}
                  max={MAX_TOTAL_PROMPTS}
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
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] px-2.5 py-2 font-mono text-xs tabular-nums text-zinc-900 dark:text-zinc-100 focus:border-[#F2B705] focus:outline-none"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400 block">
                Aspect Ratio
              </span>
              <div className="grid grid-cols-5 gap-1.5">
                {ASPECT_RATIOS.map((ratio) => {
                  const active = settings.aspectRatio === ratio;
                  return (
                    <button
                      key={ratio}
                      type="button"
                      onClick={() => onUpdateSettings({ aspectRatio: ratio })}
                      className={`min-h-[36px] rounded-md py-1.5 font-mono text-xs tabular-nums transition-colors ${
                        active
                          ? "bg-[#F2B705] font-semibold text-[#09090B]"
                          : "border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#18181B] text-zinc-700 dark:text-zinc-300 hover:border-zinc-400 dark:hover:border-zinc-600"
                      }`}
                    >
                      {ratio}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400 block">
                  Parallel Jobs
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  {([1, 2, 3] as const).map((level) => {
                    const active = settings.concurrency === level;
                    return (
                      <button
                        key={level}
                        type="button"
                        onClick={() => onUpdateSettings({ concurrency: level })}
                        className={`min-h-[36px] rounded-md py-1.5 font-mono text-xs tabular-nums transition-colors ${
                          active
                            ? "bg-zinc-900 dark:bg-zinc-100 font-semibold text-white dark:text-zinc-950"
                            : "border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#18181B] text-zinc-700 dark:text-zinc-300 hover:border-zinc-400 dark:hover:border-zinc-600"
                        }`}
                      >
                        {level}x
                      </button>
                    );
                  })}
                </div>
              </div>

              {settings.model === "gemini-nano-banana-2.1" && (
                <div className="space-y-1.5">
                  <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400 block">
                    Resolution
                  </span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(["1K", "2K"] as ImageSize[]).map((size) => {
                      const active = settings.imageSize === size;
                      return (
                        <button
                          key={size}
                          type="button"
                          onClick={() => onUpdateSettings({ imageSize: size })}
                          className={`min-h-[36px] rounded-md py-1.5 font-mono text-xs tabular-nums transition-colors ${
                            active
                              ? "bg-zinc-900 dark:bg-zinc-100 font-semibold text-white dark:text-zinc-950"
                              : "border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#18181B] text-zinc-700 dark:text-zinc-300"
                          }`}
                        >
                          {size}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </section>

          <div className="border-t border-zinc-200 dark:border-zinc-800" />

          {/* Section 3: Local Cache & Reference Directory */}
          <section className="space-y-3">
            <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 block">
              Local Cache &amp; Reference Directory
            </span>

            <div className="space-y-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
                  <FolderCheck className="h-3.5 w-3.5 text-amber-600 dark:text-[#F2B705] shrink-0" />
                  Reference Directory
                </span>
                <span className="font-mono text-[11px] text-zinc-800 dark:text-zinc-200 truncate max-w-[160px]">
                  {referenceImage ? referenceImage.name : "Empty"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
                  <HardDrive className="h-3.5 w-3.5 text-amber-600 dark:text-[#F2B705] shrink-0" />
                  Cached Images
                </span>
                <span className="font-mono text-[11px] text-zinc-800 dark:text-zinc-200 tabular-nums">
                  {totalCachedImages} · Last #{settings.lastUsedSceneNumber || "—"}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={isBatchRunning || settings.lastUsedSceneNumber === 0}
                onClick={onResetSequenceCounter}
                className="inline-flex flex-1 min-h-[40px] items-center justify-center gap-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#18181B] px-3 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:border-zinc-400 dark:hover:border-zinc-500 disabled:opacity-40 transition-colors whitespace-nowrap"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset Sequence
              </button>

              <button
                type="button"
                disabled={isBatchRunning}
                onClick={onClearLocalCache}
                className="inline-flex flex-1 min-h-[40px] items-center justify-center gap-1.5 rounded-lg border border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs font-medium text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-950/60 disabled:opacity-40 transition-colors whitespace-nowrap"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear All Cache
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
