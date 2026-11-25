# AI Automation Generator — Open-Source Edition (v0.1.0)

End-to-end automated storytelling production suite combining research-grounded script writing, Gemini TTS narration, verbatim scene & prompt breakdown, multi-batch storyboard generation, and one-click master ZIP export.

---

## Active Workflow (v0.1.0)

1. **Script Writer**
   - Generates 10 deduplicated viral topic ideas across genres with strict title rules.
   - Supports Single Episode, Multiple Episodes, Long-Run Series, Sequel, Prequel, and Shorts/Reels formats with multi-season continuity (10 episodes per season) and custom or AI-chosen character casts.
   - Outputs clean, TTS-ready spoken narration scripts grounded in live web search, plus full JSON project backup export/import.

2. **Narration**
   - Imports scripts directly from Script Writer or accepts manual script input.
   - Supports all 70 Gemini 3.8 TTS voices (including Riko, Enzo, Sami, etc.) with live voice sample previews.
   - Includes pacing, punctuation, emotion presets, inline expressive cues (`[whisper]`, `[loud]`, `[bold]`, `[pause Xs]`, `<breath>`, etc.), and stitched `.wav` download.

3. **Scene Breakdown**
   - Breaks narration scripts 100% verbatim into numbered visual beats (Module 1) with exact word-coverage verification.
   - Accepts Character Sheet file attachments (PNG, JPG, WEBP, PDF, TXT, MD) or pulls the saved studio character reference.
   - Automatically generates scene-adaptive Image Prompts for every scene and selective Video Prompts (up to 2 per 20 scenes) end to end, with one-click handoff to Storyboard.

4. **Storyboard**
   - Manages up to 400 prompts across 20-image batches with a persistent Master Character Reference Directory, Director's Brief presets, live batch queue management, and local IndexedDB caching.

5. **Export All**
   - Standalone export workspace with checkboxes and live previews to package:
     - `script.txt` (Story Script)
     - `narration.wav` (Narration Audio)
     - `scene breakdown.txt` (Scene Beat Breakdown)
     - `scene prompts.txt` (Scene Number, Image Prompt, and Video Prompt if available)
     - `images.zip` (all generated Storyboard batches nested in one inner ZIP)
   - Bundles all selected assets into a single master `.zip` file defaulted to today's date and time (or a custom filename).

---

## Quick Start (Self-Host Locally)

### 1. Clone & Install
```bash
git clone https://github.com/<your-username>/ai-automation-generator.git
cd ai-automation-generator
npm install
```

### 2. Add Your Gemini API Key
Copy `.env.example` to `.env` and add your own Gemini API key (kept strictly server-side — never committed to GitHub):
```bash
cp .env.example .env
```
Edit `.env`:
```env
GEMINI_API_KEY="your-gemini-api-key-here"
```

### 3. Run Locally
Development mode:
```bash
npm run dev
```
Production build & start:
```bash
npm run build
NODE_ENV=production npx tsx server.ts
```
Open `http://localhost:3000`.

---

## Deploy Anywhere (Docker / Cloud Run / Render / Railway)

Build and run with Docker:
```bash
docker build -t ai-automation-generator .
docker run -p 3000:3000 -e GEMINI_API_KEY="your-gemini-api-key-here" ai-automation-generator
```

Or connect your GitHub repository directly to **Google Cloud Run**, **Render**, or **Railway**, set the environment variable `GEMINI_API_KEY`, and deploy using the included `Dockerfile`.

---

## License

Released under the [MIT License](./LICENSE).
