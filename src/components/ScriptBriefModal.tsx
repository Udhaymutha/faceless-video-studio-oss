import { useEffect, useState } from "react";
import { RotateCcw, ScrollText, X } from "lucide-react";
import { DEFAULT_SCRIPT_BRIEF } from "../data/scriptMasterPrompt";
import type { ScriptBriefConfig } from "../types/scriptWriter";

interface ScriptBriefModalProps {
  isOpen: boolean;
  briefConfig: ScriptBriefConfig;
  onClose: () => void;
  onUpdateBrief: (next: ScriptBriefConfig) => void;
  onResetDefaults: () => void;
}

type BriefTab = "part1" | "part2" | "part3";

const BRIEF_TABS: Array<{
  id: BriefTab;
  label: string;
  field: keyof ScriptBriefConfig;
  description: string;
}> = [
  {
    id: "part1",
    label: "1. Topic & Title DNA",
    field: "part1TopicAndTitleRules",
    description:
      "Controls automatic 10-topic ideation, viral title formulas, three topic families, and deduplication.",
  },
  {
    id: "part2",
    label: "2. Continuity & Format",
    field: "part2ContinuityAndScopeRules",
    description:
      "Controls Single vs Series arcs, Episode 2+ direct continuation, character locking, ending styles, and 150 WPM pacing.",
  },
  {
    id: "part3",
    label: "3. Script DNA & TTS Rules",
    field: "part3ScriptDnaAndTtsRules",
    description:
      "Controls live web research rules, storyteller voice, 11-beat narrative framework, and strict spoken-only TTS formatting.",
  },
];

export function ScriptBriefModal({
  isOpen,
  briefConfig,
  onClose,
  onUpdateBrief,
  onResetDefaults,
}: ScriptBriefModalProps) {
  const [activeTab, setActiveTab] = useState<BriefTab>("part1");

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const currentTab =
    BRIEF_TABS.find((t) => t.id === activeTab) ?? BRIEF_TABS[0];

  const isModified =
    briefConfig.part1TopicAndTitleRules !==
      DEFAULT_SCRIPT_BRIEF.part1TopicAndTitleRules ||
    briefConfig.part2ContinuityAndScopeRules !==
      DEFAULT_SCRIPT_BRIEF.part2ContinuityAndScopeRules ||
    briefConfig.part3ScriptDnaAndTtsRules !==
      DEFAULT_SCRIPT_BRIEF.part3ScriptDnaAndTtsRules;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="Master Script Brief"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 px-5 py-4 sm:px-6">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 dark:bg-[#18181B] border border-[#F2B705]/40 text-amber-600 dark:text-[#F2B705]">
              <ScrollText className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-base font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                Script Writer Master Brief
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                Predefined narrative DNA, continuity rules &amp; TTS output contract
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Script Brief"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-600 hover:text-zinc-900 dark:hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 3-Part Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#0D0D10] px-5 py-2.5 sm:px-6">
          {BRIEF_TABS.map((tab) => {
            const active = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "bg-zinc-900 dark:bg-[#F2B705] text-white dark:text-[#09090B]"
                    : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/70 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Editor Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6 space-y-3">
          <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
            {currentTab.description}
          </p>

          <textarea
            value={briefConfig[currentTab.field]}
            onChange={(e) =>
              onUpdateBrief({
                ...briefConfig,
                [currentTab.field]: e.target.value,
              })
            }
            rows={15}
            className="w-full rounded-xl border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] px-4 py-3 font-mono text-xs leading-relaxed text-zinc-900 dark:text-zinc-100 focus:border-[#F2B705] focus:outline-none"
          />
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 dark:border-zinc-800 px-5 py-3.5 sm:px-6 bg-zinc-50 dark:bg-[#0D0D10]">
          <button
            type="button"
            onClick={onResetDefaults}
            disabled={!isModified}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#18181B] px-3 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:border-zinc-400 dark:hover:border-zinc-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Restore Default Brief
          </button>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-lg bg-[#F2B705] px-4 py-2 text-xs font-semibold text-[#09090B] hover:bg-[#f7c52a] transition-colors"
          >
            Save &amp; Close
          </button>
        </div>
      </div>
    </div>
  );
}
