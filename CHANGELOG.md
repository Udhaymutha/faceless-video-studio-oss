# Active Progress Log — Version 0.1.0

**Release:** `v0.1.0`  
**Status:** Core 5-Stage Production Pipeline Complete & Cache Cleared  
**Date:** 2026-11-24

## Completed in v0.1.0

- **Script Writer (Default Homepage)**
  - Integrated 3-part Master Prompt (Topic & Title DNA, Continuity/Format/Duration, Research & TTS Output Contract).
  - Multi-genre support, Shorts/Reels mode, season/episode continuity tracking, custom creative inputs, and JSON project export/import.
- **Narration Studio**
  - Direct script import from Script Writer.
  - Full 70-voice Gemini 3.8 TTS catalog with sample playback, pace/punctuation/emotion controls, inline expressive cues, and stitched `.wav` audio export.
- **Scene Breakdown Studio**
  - Verbatim beat-splitting engine (Module 1) + full-script automated Image & selective Video Prompt generation (Module 2).
  - Multimodal Character Sheet file attachment (images, PDFs, text) + studio reference pull.
  - Direct export of extracted prompts to Storyboard.
- **Storyboard & Multi-Batch Image Studio**
  - Master Character Reference Directory, Director's Brief review & presets, up to 400 queued scenes (20 per batch), local IndexedDB caching, and Storyboard-only prompt limit footer.
- **Export All Workspace**
  - Selectable checklist bundling `script.txt`, `narration.wav`, `scene breakdown.txt`, `scene prompts.txt`, and nested `images.zip` into a single master `.zip` file named with the current date & time (or a custom name).
- **Cache Management**
  - Cleared server-side temporary cache and added clean full-app cache reset across all IndexedDB stores and settings.

## Planned for v1.x

- [ ] User login screen and session management
- [ ] Credential database to securely store user accounts
- [ ] Payment portal and credit system to meter API usage
