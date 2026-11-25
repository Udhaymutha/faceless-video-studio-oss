import { useEffect, useRef, useState } from "react";
import {
  BookMarked,
  ChevronDown,
  Clapperboard,
  FileUp,
  FolderArchive,
  LayoutGrid,
  Menu,
  Play,
  ScrollText,
  Settings,
  SlidersHorizontal,
  Square,
  Volume2,
  X,
} from "lucide-react";
import type {
  BatchSettings,
  ReferenceImage,
  StudioView,
} from "../types/studio";
import { SettingsPopover } from "./SettingsPopover";

interface TopBarProps {
  activeView: StudioView;
  onSelectView: (view: StudioView) => void;
  isBatchRunning: boolean;
  populatedCount: number;
  settings: BatchSettings;
  resolvedTheme: "dark" | "light";
  referenceImage: ReferenceImage | null;
  totalCachedImages: number;
  onUpdateSettings: (patch: Partial<BatchSettings>) => void;
  onResetSequenceCounter: () => void;
  onClearLocalCache: () => void;
  onGenerateBatch: () => void;
  onCancelBatch: () => void;
}

const STORYBOARD_SUB_ITEMS: Array<{
  id: StudioView;
  label: string;
  description: string;
  icon: typeof LayoutGrid;
}> = [
  {
    id: "storyboard",
    label: "Storyboard",
    description: "Character directory & active batch sheet",
    icon: LayoutGrid,
  },
  {
    id: "bulk",
    label: "Bulk Import",
    description: "Paste up to 400 prompts (20 per batch)",
    icon: FileUp,
  },
  {
    id: "config",
    label: "Output & Sequence",
    description: "Sequence numbering, model & visual constraints",
    icon: SlidersHorizontal,
  },
  {
    id: "presets",
    label: "Presets",
    description: "Manage Director's Brief instructions",
    icon: BookMarked,
  },
];

const ALL_NAV_LABELS: Record<StudioView, string> = {
  script: "Script Writer",
  narration: "Narration",
  breakdown: "Scene Breakdown",
  storyboard: "Storyboard",
  bulk: "Bulk Import",
  config: "Output & Sequence",
  presets: "Presets",
  export: "Export All",
};

export function TopBar({
  activeView,
  onSelectView,
  isBatchRunning,
  populatedCount,
  settings,
  resolvedTheme,
  referenceImage,
  totalCachedImages,
  onUpdateSettings,
  onResetSequenceCounter,
  onClearLocalCache,
  onGenerateBatch,
  onCancelBatch,
}: TopBarProps) {
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [isStoryboardGroupOpen, setIsStoryboardGroupOpen] = useState(
    activeView !== "script" &&
      activeView !== "narration" &&
      activeView !== "breakdown" &&
      activeView !== "export"
  );
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isGenOptionsOpen, setIsGenOptionsOpen] = useState(false);

  const desktopGenBtnRef = useRef<HTMLButtonElement | null>(null);
  const mobileGenBtnRef = useRef<HTMLButtonElement | null>(null);
  const desktopGenMenuRef = useRef<HTMLDivElement | null>(null);
  const mobileGenMenuRef = useRef<HTMLDivElement | null>(null);

  const isScriptView = activeView === "script";
  const isNarrationView = activeView === "narration";
  const isBreakdownView = activeView === "breakdown";
  const isExportView = activeView === "export";
  const isHideGenerateControls =
    isScriptView || isNarrationView || isBreakdownView || isExportView;
  const isInStoryboardSection = !isHideGenerateControls;

  // Keep Storyboard submenu expanded when entering any Storyboard sub-tab, and close gen popover on non-Storyboard views
  useEffect(() => {
    if (isHideGenerateControls) {
      setIsGenOptionsOpen(false);
    } else {
      setIsStoryboardGroupOpen(true);
    }
  }, [isHideGenerateControls]);

  // Close navigation drawer on Escape
  useEffect(() => {
    if (!isNavOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsNavOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isNavOpen]);

  // Close Auto-Generate dropdown on Escape or outside click
  useEffect(() => {
    if (!isGenOptionsOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsGenOptionsOpen(false);
    };

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (
        desktopGenMenuRef.current?.contains(target) ||
        desktopGenBtnRef.current?.contains(target) ||
        mobileGenMenuRef.current?.contains(target) ||
        mobileGenBtnRef.current?.contains(target)
      ) {
        return;
      }
      setIsGenOptionsOpen(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleMouseDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleMouseDown);
    };
  }, [isGenOptionsOpen]);

  const activeNavLabel = ALL_NAV_LABELS[activeView] ?? "Storyboard";

  const renderGenerateControls = (variant: "desktop" | "mobile") => {
    const isMobile = variant === "mobile";
    return (
      <div
        className={`relative flex items-center gap-2 ${
          isMobile ? "w-full" : "shrink-0"
        }`}
      >
        {isBatchRunning ? (
          <button
            type="button"
            onClick={onCancelBatch}
            className={`inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-500 transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 ${
              isMobile ? "flex-1 min-h-[44px]" : "h-9 shrink-0"
            }`}
          >
            <Square className="h-3.5 w-3.5 fill-current shrink-0" />
            Stop Batch
          </button>
        ) : (
          <button
            type="button"
            onClick={onGenerateBatch}
            disabled={populatedCount === 0}
            className={`inline-flex items-center justify-center gap-2 rounded-lg bg-[#F2B705] px-4 text-sm font-semibold text-[#09090B] hover:bg-[#f7c52a] disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B705] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#09090B] ${
              isMobile ? "flex-1 min-h-[44px]" : "h-9 shrink-0"
            }`}
          >
            <Play className="h-3.5 w-3.5 fill-current shrink-0" />
            {populatedCount > 0
              ? `Generate ${populatedCount}`
              : "Generate Sequence"}
          </button>
        )}

        {/* Dropdown right next to Generate Sequence for Auto-Generate Next Sequence */}
        <button
          ref={isMobile ? mobileGenBtnRef : desktopGenBtnRef}
          type="button"
          onClick={() => {
            setIsNavOpen(false);
            setIsGenOptionsOpen((prev) => !prev);
          }}
          aria-label="Sequence generation options"
          aria-expanded={isGenOptionsOpen}
          aria-haspopup="menu"
          title={
            settings.autoGenerateNextSequence
              ? "Auto generate next sequence: ON"
              : "Sequence generation options"
          }
          className={`inline-flex items-center justify-center rounded-lg border transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B705] ${
            isMobile ? "h-11 w-11" : "h-9 w-9"
          } ${
            isGenOptionsOpen || settings.autoGenerateNextSequence
              ? "border-[#F2B705] bg-amber-50 dark:bg-[#18181B] text-amber-600 dark:text-[#F2B705]"
              : "border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#111114] text-zinc-600 dark:text-zinc-300 hover:border-zinc-400 dark:hover:border-zinc-600 hover:text-zinc-950 dark:hover:text-white"
          }`}
        >
          <ChevronDown
            className={`h-4 w-4 transition-transform duration-150 ${
              isGenOptionsOpen ? "rotate-180" : ""
            }`}
          />
        </button>

        {isGenOptionsOpen && (
          <div
            ref={isMobile ? mobileGenMenuRef : desktopGenMenuRef}
            role="menu"
            aria-label="Sequence generation options"
            className="absolute right-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-zinc-200 dark:border-zinc-700/90 bg-white dark:bg-[#111114] p-3.5 shadow-2xl"
          >
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={settings.autoGenerateNextSequence}
                onChange={(e) =>
                  onUpdateSettings({
                    autoGenerateNextSequence: e.target.checked,
                  })
                }
                className="mt-0.5 h-4 w-4 rounded border-zinc-400 dark:border-zinc-600 bg-white dark:bg-[#09090B] accent-[#F2B705] cursor-pointer shrink-0"
              />
              <div className="space-y-1 min-w-0">
                <span className="block text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                  Auto generate next sequence
                </span>
                <span className="block text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-400">
                  {settings.autoGenerateNextSequence
                    ? "Automatically saves each finished 20-image batch to local cache and starts the next batch without pausing."
                    : "Pauses after each 20-image batch finishes and waits for you to click Next manually."}
                </span>
              </div>
            </label>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Sticky Compact Top Bar (<= 15% mobile height, zero horizontal scroll) */}
      <header className="sticky top-0 z-30 h-14 sm:h-16 w-full border-b border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-[#09090B]/95 backdrop-blur-sm transition-colors">
        <div className="flex h-full w-full items-center justify-between gap-3 px-4 sm:px-5 lg:px-7">
          {/* Left: Three-Lines Menu Button + FrameForge Brand Wordmark */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => {
                setIsGenOptionsOpen(false);
                setIsNavOpen((prev) => !prev);
              }}
              aria-label="Open navigation menu"
              aria-expanded={isNavOpen}
              aria-controls="studio-navigation-drawer"
              title="Navigation"
              className={`flex h-10 w-10 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B705] ${
                isNavOpen
                  ? "border-[#F2B705] bg-amber-50 dark:bg-[#18181B] text-amber-600 dark:text-[#F2B705]"
                  : "border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#111114] text-zinc-700 dark:text-zinc-200 hover:border-zinc-400 dark:hover:border-zinc-600 hover:text-zinc-950 dark:hover:text-white"
              }`}
            >
              <Menu className="h-5 w-5 sm:h-4 sm:w-4" />
            </button>

            <button
              type="button"
              onClick={() => onSelectView("script")}
              className="font-display text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 whitespace-nowrap shrink-0 hover:text-black dark:hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B705] rounded-sm"
            >
              FrameForge
            </button>

            {/* Quiet inline active section indicator */}
            <span
              aria-hidden="true"
              className="hidden md:inline text-zinc-300 dark:text-zinc-700"
            >
              /
            </span>
            <span className="hidden md:inline text-xs font-medium text-zinc-500 dark:text-zinc-400 truncate">
              {activeNavLabel}
            </span>
          </div>

          {/* Right (Tablet & Desktop >= 640px): Generate Sequence + Auto-Generate Dropdown (Storyboard pages only) */}
          {!isHideGenerateControls && (
            <div className="hidden sm:flex items-center shrink-0">
              {renderGenerateControls("desktop")}
            </div>
          )}

          {/* Right (Mobile < 640px): Quiet active tab label only so top bar stays clean */}
          <span className="sm:hidden text-xs font-medium text-zinc-500 dark:text-zinc-400 truncate">
            {activeNavLabel}
          </span>
        </div>
      </header>

      {/* Mobile Wrapped Action Strip (< 640px): Shown only on Storyboard pages, hidden on Script Writer & Narration */}
      {!isHideGenerateControls && (
        <div className="sm:hidden w-full border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] px-4 py-2.5 transition-colors">
          {renderGenerateControls("mobile")}
        </div>
      )}

      {/* Left Navigation Drawer (opened from top-left three-lines button) */}
      {isNavOpen && (
        <div className="fixed inset-0 z-50 flex" role="presentation">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/55 backdrop-blur-xs"
            onClick={() => setIsNavOpen(false)}
            aria-hidden="true"
          />

          {/* Left Navigation Panel */}
          <nav
            id="studio-navigation-drawer"
            aria-label="Primary studio navigation"
            className="relative z-10 flex h-full w-[284px] max-w-[86vw] flex-col border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] shadow-2xl"
          >
            {/* Drawer Header */}
            <div className="flex h-14 sm:h-16 items-center justify-between gap-3 border-b border-zinc-200 dark:border-zinc-800 px-5 shrink-0">
              <span className="font-display text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                FrameForge
              </span>
              <button
                type="button"
                onClick={() => setIsNavOpen(false)}
                aria-label="Close navigation menu"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-600 hover:text-zinc-900 dark:hover:text-white transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Navigation Items: Script Writer + Storyboard Main Header with 4-Tab Dropdown */}
            <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1.5">
              {/* Top-Level Module 1: Script Writer */}
              <button
                type="button"
                onClick={() => {
                  onSelectView("script");
                  setIsNavOpen(false);
                }}
                className={`flex w-full min-h-[48px] items-center gap-3 rounded-lg px-3.5 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B705] ${
                  isScriptView
                    ? "bg-amber-50 dark:bg-[#18181B] text-zinc-950 dark:text-zinc-100 border border-[#F2B705]/70"
                    : "border border-transparent text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/70 hover:text-zinc-950 dark:hover:text-white"
                }`}
              >
                <ScrollText
                  className={`h-4 w-4 shrink-0 ${
                    isScriptView
                      ? "text-amber-600 dark:text-[#F2B705]"
                      : "text-zinc-500 dark:text-zinc-400"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold leading-tight">
                    Script Writer
                  </span>
                  <span className="block text-[11px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                    Viral topics, research scripts &amp; seasons
                  </span>
                </div>
              </button>

              {/* Top-Level Module 2: Narration (Right below Script Writer) */}
              <button
                type="button"
                onClick={() => {
                  onSelectView("narration");
                  setIsNavOpen(false);
                }}
                className={`flex w-full min-h-[48px] items-center gap-3 rounded-lg px-3.5 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B705] ${
                  isNarrationView
                    ? "bg-amber-50 dark:bg-[#18181B] text-zinc-950 dark:text-zinc-100 border border-[#F2B705]/70"
                    : "border border-transparent text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/70 hover:text-zinc-950 dark:hover:text-white"
                }`}
              >
                <Volume2
                  className={`h-4 w-4 shrink-0 ${
                    isNarrationView
                      ? "text-amber-600 dark:text-[#F2B705]"
                      : "text-zinc-500 dark:text-zinc-400"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold leading-tight">
                    Narration
                  </span>
                  <span className="block text-[11px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                    Google TTS voices, cues &amp; audio clips
                  </span>
                </div>
              </button>

              {/* Top-Level Module 3: Scene Breakdown (Right below Narration) */}
              <button
                type="button"
                onClick={() => {
                  onSelectView("breakdown");
                  setIsNavOpen(false);
                }}
                className={`flex w-full min-h-[48px] items-center gap-3 rounded-lg px-3.5 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B705] ${
                  isBreakdownView
                    ? "bg-amber-50 dark:bg-[#18181B] text-zinc-950 dark:text-zinc-100 border border-[#F2B705]/70"
                    : "border border-transparent text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/70 hover:text-zinc-950 dark:hover:text-white"
                }`}
              >
                <Clapperboard
                  className={`h-4 w-4 shrink-0 ${
                    isBreakdownView
                      ? "text-amber-600 dark:text-[#F2B705]"
                      : "text-zinc-500 dark:text-zinc-400"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold leading-tight">
                    Scene Breakdown
                  </span>
                  <span className="block text-[11px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                    Beat split, image &amp; video prompts
                  </span>
                </div>
              </button>

              {/* Top-Level Module 4: Storyboard Main Header + Expandable 4-Tab Dropdown */}
              <div className="space-y-1">
                <div
                  className={`flex w-full min-h-[48px] items-center rounded-lg border transition-colors ${
                    isInStoryboardSection
                      ? "bg-amber-50/70 dark:bg-[#18181B] border-[#F2B705]/60 text-zinc-950 dark:text-zinc-100"
                      : "border-transparent text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/70"
                  }`}
                >
                  {/* Clicking Storyboard goes directly to Storyboard & opens dropdown */}
                  <button
                    type="button"
                    onClick={() => {
                      onSelectView("storyboard");
                      setIsStoryboardGroupOpen(true);
                      setIsNavOpen(false);
                    }}
                    className="flex min-w-0 flex-1 items-center gap-3 px-3.5 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B705] rounded-l-lg"
                  >
                    <LayoutGrid
                      className={`h-4 w-4 shrink-0 ${
                        isInStoryboardSection
                          ? "text-amber-600 dark:text-[#F2B705]"
                          : "text-zinc-500 dark:text-zinc-400"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold leading-tight">
                        Storyboard
                      </span>
                      <span className="block text-[11px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                        Scenes, bulk import, sequence &amp; presets
                      </span>
                    </div>
                  </button>

                  {/* Dropdown Arrow Toggle */}
                  <button
                    type="button"
                    onClick={() => setIsStoryboardGroupOpen((prev) => !prev)}
                    aria-label={
                      isStoryboardGroupOpen
                        ? "Collapse Storyboard options"
                        : "Expand Storyboard options"
                    }
                    aria-expanded={isStoryboardGroupOpen}
                    aria-controls="storyboard-nav-submenu"
                    className="flex h-11 w-10 shrink-0 items-center justify-center rounded-r-lg text-zinc-500 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B705]"
                  >
                    <ChevronDown
                      className={`h-4 w-4 transition-transform duration-150 ${
                        isStoryboardGroupOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                </div>

                {/* Storyboard Dropdown Sub-Options: Storyboard, Bulk Import, Output & Sequence, Presets */}
                {isStoryboardGroupOpen && (
                  <div
                    id="storyboard-nav-submenu"
                    className="ml-4 space-y-1 border-l border-zinc-200 dark:border-zinc-800 pl-2.5 pt-0.5"
                  >
                    {STORYBOARD_SUB_ITEMS.map((item) => {
                      const Icon = item.icon;
                      const isActive = activeView === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            onSelectView(item.id);
                            setIsNavOpen(false);
                          }}
                          className={`flex w-full min-h-[42px] items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B705] ${
                            isActive
                              ? "bg-amber-50 dark:bg-[#1E1A0E] text-zinc-950 dark:text-zinc-100 border border-[#F2B705]/70"
                              : "border border-transparent text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/70 hover:text-zinc-950 dark:hover:text-white"
                          }`}
                        >
                          <Icon
                            className={`h-3.5 w-3.5 shrink-0 ${
                              isActive
                                ? "text-amber-600 dark:text-[#F2B705]"
                                : "text-zinc-500 dark:text-zinc-400"
                            }`}
                          />
                          <div className="min-w-0 flex-1">
                            <span className="block text-xs font-semibold leading-tight">
                              {item.label}
                            </span>
                            <span className="block text-[10px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                              {item.description}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Top-Level Module 5: Export All (Standalone page below Storyboard) */}
              <button
                type="button"
                onClick={() => {
                  onSelectView("export");
                  setIsNavOpen(false);
                }}
                className={`flex w-full min-h-[48px] items-center gap-3 rounded-lg px-3.5 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B705] ${
                  isExportView
                    ? "bg-amber-50 dark:bg-[#18181B] text-zinc-950 dark:text-zinc-100 border border-[#F2B705]/70"
                    : "border border-transparent text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/70 hover:text-zinc-950 dark:hover:text-white"
                }`}
              >
                <FolderArchive
                  className={`h-4 w-4 shrink-0 ${
                    isExportView
                      ? "text-amber-600 dark:text-[#F2B705]"
                      : "text-zinc-500 dark:text-zinc-400"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold leading-tight">
                    Export All
                  </span>
                  <span className="block text-[11px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                    Master ZIP for script, audio &amp; visuals
                  </span>
                </div>
              </button>
            </div>

            {/* Bottom of Navigation Drawer: Settings Button */}
            <div className="mt-auto border-t border-zinc-200 dark:border-zinc-800 p-3 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setIsNavOpen(false);
                  setIsSettingsOpen(true);
                }}
                className="flex w-full min-h-[48px] items-center justify-between gap-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] px-3.5 py-2.5 text-left text-zinc-800 dark:text-zinc-200 hover:border-[#F2B705] hover:text-zinc-950 dark:hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B705]"
              >
                <span className="inline-flex items-center gap-3 min-w-0">
                  <Settings className="h-4 w-4 shrink-0 text-amber-600 dark:text-[#F2B705]" />
                  <span className="text-sm font-semibold">Settings</span>
                </span>
                <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400 shrink-0">
                  {resolvedTheme === "dark" ? "Dark" : "Light"}
                </span>
              </button>
            </div>
          </nav>
        </div>
      )}

      {/* Workspace Settings Pop-Up (opened from Settings at bottom of navigation drawer) */}
      <SettingsPopover
        isOpen={isSettingsOpen}
        settings={settings}
        resolvedTheme={resolvedTheme}
        referenceImage={referenceImage}
        totalCachedImages={totalCachedImages}
        isBatchRunning={isBatchRunning}
        onClose={() => setIsSettingsOpen(false)}
        onUpdateSettings={onUpdateSettings}
        onResetSequenceCounter={onResetSequenceCounter}
        onClearLocalCache={onClearLocalCache}
      />
    </>
  );
}
