import { useRef, useState } from "react";
import {
  Check,
  Copy,
  Download,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
} from "lucide-react";
import type { AspectRatio, InstructionPreset } from "../types/studio";

interface PresetsViewProps {
  presets: InstructionPreset[];
  activePresetId: string;
  onSelectActivePreset: (id: string) => void;
  onUpdatePreset: (
    id: string,
    patch: Partial<Omit<InstructionPreset, "id">>
  ) => void;
  onCreatePreset: () => string;
  onDuplicatePreset: (id: string) => string;
  onDeletePreset: (id: string) => void;
  onResetDefaults: () => void;
  onImportPresets: (imported: InstructionPreset[]) => void;
}

const ASPECT_RATIOS: AspectRatio[] = ["16:9", "4:3", "1:1", "3:4", "9:16"];

export function PresetsView({
  presets,
  activePresetId,
  onSelectActivePreset,
  onUpdatePreset,
  onCreatePreset,
  onDuplicatePreset,
  onDeletePreset,
  onResetDefaults,
  onImportPresets,
}: PresetsViewProps) {
  const [editingId, setEditingId] = useState<string>(activePresetId);
  const [importError, setImportError] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const selectedPreset =
    presets.find((p) => p.id === editingId) ?? presets[0];

  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(presets, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "frameforge-presets.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!Array.isArray(parsed)) {
          throw new Error("Invalid preset file format.");
        }
        const valid: InstructionPreset[] = parsed
          .filter(
            (item) =>
              item &&
              typeof item.name === "string" &&
              typeof item.instructions === "string"
          )
          .map((item, idx) => ({
            id:
              typeof item.id === "string" && item.id.trim()
                ? item.id
                : `imported-${Date.now()}-${idx}`,
            name: item.name.trim(),
            summary: typeof item.summary === "string" ? item.summary : "",
            instructions: item.instructions,
            negativeRules:
              typeof item.negativeRules === "string" ? item.negativeRules : "",
            defaultAspectRatio: ASPECT_RATIOS.includes(item.defaultAspectRatio)
              ? item.defaultAspectRatio
              : "16:9",
            updatedAt: Date.now(),
          }));

        if (valid.length === 0) {
          throw new Error("No valid presets found in that JSON file.");
        }
        onImportPresets(valid);
        setEditingId(valid[0].id);
      } catch (err) {
        setImportError(
          err instanceof Error ? err.message : "Could not import preset file."
        );
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between border-b border-zinc-200 dark:border-zinc-800 pb-5">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Reusable Instruction Presets
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Define how every scene prompt is styled, framed, and constrained.
            Presets save automatically in your browser.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <input
            ref={importInputRef}
            type="file"
            accept="application/json"
            onChange={handleImportJson}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => importInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#111114] px-3 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:border-zinc-400 dark:hover:border-zinc-600 hover:text-zinc-950 dark:hover:text-white transition-colors whitespace-nowrap"
          >
            <Upload className="h-3.5 w-3.5" />
            Import JSON
          </button>
          <button
            type="button"
            onClick={handleExportJson}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#111114] px-3 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:border-zinc-400 dark:hover:border-zinc-600 hover:text-zinc-950 dark:hover:text-white transition-colors whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5" />
            Export JSON
          </button>
          <button
            type="button"
            onClick={onResetDefaults}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#111114] px-3 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-600 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors whitespace-nowrap"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Restore Defaults
          </button>
          <button
            type="button"
            onClick={() => {
              const id = onCreatePreset();
              setEditingId(id);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#F2B705] px-3.5 py-2 text-xs font-semibold text-[#09090B] hover:bg-[#f7c52a] transition-colors whitespace-nowrap"
          >
            <Plus className="h-3.5 w-3.5" />
            New Preset
          </button>
        </div>
      </div>

      {importError && (
        <div className="rounded-lg border border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-xs text-red-700 dark:text-red-200">
          {importError}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        {/* Left List of Saved Presets */}
        <div className="lg:col-span-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] divide-y divide-zinc-200 dark:divide-zinc-800/80 overflow-hidden">
          {presets.map((preset) => {
            const isSelected = preset.id === selectedPreset.id;
            const isActiveInStudio = preset.id === activePresetId;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => setEditingId(preset.id)}
                className={`w-full px-4 py-3.5 text-left transition-colors ${
                  isSelected
                    ? "bg-zinc-100 dark:bg-[#18181B]"
                    : "hover:bg-zinc-50 dark:hover:bg-[#141418]"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`text-sm font-medium truncate ${
                      isSelected
                        ? "text-zinc-950 dark:text-zinc-100"
                        : "text-zinc-700 dark:text-zinc-300"
                    }`}
                  >
                    {preset.name || "Untitled Preset"}
                  </span>
                  {isActiveInStudio && (
                    <span className="text-[11px] font-medium text-amber-600 dark:text-[#F2B705] shrink-0">
                      Active
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-zinc-500 line-clamp-2">
                  {preset.summary || preset.instructions}
                </p>
                <div className="mt-2 flex items-center gap-2 font-mono text-[11px] text-zinc-500 tabular-nums">
                  <span>{preset.defaultAspectRatio}</span>
                  <span aria-hidden="true">·</span>
                  <span>{preset.instructions.length} chars</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Right Full Preset Editor */}
        {selectedPreset && (
          <div className="lg:col-span-8 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 dark:border-zinc-800 pb-4">
              <div>
                <h2 className="font-display text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  {selectedPreset.name || "Untitled Preset"}
                </h2>
                <p className="text-xs text-zinc-500">
                  Changes apply immediately and persist in your browser.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {selectedPreset.id === activePresetId ? (
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-[#18181B] px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-[#F2B705]">
                    <Check className="h-3.5 w-3.5" />
                    Active in Studio
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onSelectActivePreset(selectedPreset.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#F2B705] px-3.5 py-1.5 text-xs font-semibold text-[#09090B] hover:bg-[#f7c52a] transition-colors whitespace-nowrap"
                  >
                    Use in Studio
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    const copyId = onDuplicatePreset(selectedPreset.id);
                    setEditingId(copyId);
                  }}
                  title="Duplicate preset"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 dark:border-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:border-zinc-400 dark:hover:border-zinc-600 hover:text-zinc-950 dark:hover:text-white transition-colors"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Duplicate
                </button>

                <button
                  type="button"
                  disabled={presets.length <= 1}
                  onClick={() => {
                    const nextPreset = presets.find(
                      (p) => p.id !== selectedPreset.id
                    );
                    onDeletePreset(selectedPreset.id);
                    if (nextPreset) setEditingId(nextPreset.id);
                  }}
                  title="Delete preset"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 dark:border-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:border-red-300 dark:hover:border-red-500/40 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2 space-y-1.5">
                <label
                  htmlFor="preset-name-input"
                  className="text-xs font-medium text-zinc-700 dark:text-zinc-300"
                >
                  Preset Name
                </label>
                <input
                  id="preset-name-input"
                  type="text"
                  value={selectedPreset.name}
                  onChange={(e) =>
                    onUpdatePreset(selectedPreset.id, { name: e.target.value })
                  }
                  className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:border-[#F2B705] focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="preset-aspect-select"
                  className="text-xs font-medium text-zinc-700 dark:text-zinc-300"
                >
                  Default Aspect Ratio
                </label>
                <select
                  id="preset-aspect-select"
                  value={selectedPreset.defaultAspectRatio}
                  onChange={(e) =>
                    onUpdatePreset(selectedPreset.id, {
                      defaultAspectRatio: e.target.value as AspectRatio,
                    })
                  }
                  className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] px-3 py-2 font-mono text-sm text-zinc-900 dark:text-zinc-100 focus:border-[#F2B705] focus:outline-none"
                >
                  {ASPECT_RATIOS.map((ratio) => (
                    <option key={ratio} value={ratio}>
                      {ratio}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="preset-summary-input"
                className="text-xs font-medium text-zinc-700 dark:text-zinc-300"
              >
                Short Description
              </label>
              <input
                id="preset-summary-input"
                type="text"
                value={selectedPreset.summary}
                onChange={(e) =>
                  onUpdatePreset(selectedPreset.id, { summary: e.target.value })
                }
                placeholder="Brief summary of when to use this visual instruction preset..."
                className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] px-3 py-2 text-xs text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:border-[#F2B705] focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="preset-instructions-input"
                className="text-xs font-medium text-zinc-700 dark:text-zinc-300"
              >
                Predefined Prompt-Handling Instructions
              </label>
              <textarea
                id="preset-instructions-input"
                rows={10}
                value={selectedPreset.instructions}
                onChange={(e) =>
                  onUpdatePreset(selectedPreset.id, {
                    instructions: e.target.value,
                  })
                }
                placeholder="Write your complete visual style bible, anatomy rules, lighting direction, and composition instructions applied to every scene..."
                className="w-full resize-y rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] px-3.5 py-3 text-xs leading-relaxed text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:border-[#F2B705] focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="preset-negative-input"
                className="text-xs font-medium text-zinc-700 dark:text-zinc-300"
              >
                Strict Visual Constraints (Elements to Avoid)
              </label>
              <textarea
                id="preset-negative-input"
                rows={3}
                value={selectedPreset.negativeRules}
                onChange={(e) =>
                  onUpdatePreset(selectedPreset.id, {
                    negativeRules: e.target.value,
                  })
                }
                placeholder="List styles, artifacts, or elements the image model must strictly avoid..."
                className="w-full resize-y rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] px-3.5 py-2.5 text-xs leading-relaxed text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:border-[#F2B705] focus:outline-none"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
