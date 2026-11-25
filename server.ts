import "dotenv/config";
import express from "express";
import type { Request, Response } from "express";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Common Master Stickman Character Reference Directory on disk
const REFERENCE_DIRECTORY_NAME = "master-stickman-reference-directory";
const REFERENCE_DIRECTORY_PATH = path.join(
  os.tmpdir(),
  "sceneroll",
  REFERENCE_DIRECTORY_NAME
);
const REFERENCE_META_FILE = path.join(REFERENCE_DIRECTORY_PATH, "metadata.json");

const ALLOWED_MODELS = new Set([
  "gemini-3.1-flash-lite-image",
  "gemini-nano-banana-2.1",
]);

const ALLOWED_ASPECT_RATIOS = new Set([
  "1:1",
  "3:4",
  "4:3",
  "9:16",
  "16:9",
]);

const ALLOWED_IMAGE_SIZES = new Set(["1K", "2K"]);

interface ReferenceImagePayload {
  data: string;
  mimeType: string;
}

interface StoredReferenceDirectoryMeta {
  name: string;
  characterName: string;
  characterNotes: string;
  mimeType: string;
  imageFilename: string;
  updatedAt: number;
}

interface StoredReferenceDirectoryEntry {
  name: string;
  characterName: string;
  characterNotes: string;
  mimeType: string;
  data: string;
  updatedAt: number;
}

interface ReferenceDirectorySaveBody {
  name?: string;
  characterName?: string;
  characterNotes?: string;
  mimeType?: string;
  data?: string;
}

interface ReviewMasterPromptRequestBody {
  masterPrompt?: string;
  negativeRules?: string;
  characterName?: string;
  characterNotes?: string;
  referenceImage?: ReferenceImagePayload | null;
}

interface GenerateSceneRequestBody {
  sceneNumber?: number;
  prompt?: string;
  instructions?: string;
  negativeRules?: string;
  characterProfile?: string;
  characterNotes?: string;
  aspectRatio?: string;
  model?: string;
  imageSize?: string;
}

function extensionForMime(mimeType: string): string {
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  if (mimeType.includes("webp")) return "webp";
  return "png";
}

async function ensureReferenceDirectory(): Promise<void> {
  await fs.mkdir(REFERENCE_DIRECTORY_PATH, { recursive: true });
}

async function saveReferenceToDirectory(params: {
  name: string;
  characterName: string;
  characterNotes: string;
  mimeType: string;
  data: string;
}): Promise<StoredReferenceDirectoryMeta> {
  await ensureReferenceDirectory();

  // Remove any older master-stickman image files with a different extension
  const existingFiles = await fs.readdir(REFERENCE_DIRECTORY_PATH).catch(() => []);
  for (const file of existingFiles) {
    if (file.startsWith("master-stickman.")) {
      await fs
        .unlink(path.join(REFERENCE_DIRECTORY_PATH, file))
        .catch(() => undefined);
    }
  }

  const ext = extensionForMime(params.mimeType);
  const imageFilename = `master-stickman.${ext}`;
  const imageBuffer = Buffer.from(params.data, "base64");
  await fs.writeFile(
    path.join(REFERENCE_DIRECTORY_PATH, imageFilename),
    imageBuffer
  );

  const meta: StoredReferenceDirectoryMeta = {
    name: params.name || imageFilename,
    characterName: params.characterName || "Master Stickman",
    characterNotes: params.characterNotes || "",
    mimeType: params.mimeType,
    imageFilename,
    updatedAt: Date.now(),
  };

  await fs.writeFile(REFERENCE_META_FILE, JSON.stringify(meta, null, 2), "utf8");
  return meta;
}

async function loadReferenceFromDirectory(): Promise<StoredReferenceDirectoryEntry | null> {
  try {
    const rawMeta = await fs.readFile(REFERENCE_META_FILE, "utf8");
    const meta = JSON.parse(rawMeta) as StoredReferenceDirectoryMeta;
    if (!meta?.imageFilename || !meta?.mimeType) {
      return null;
    }
    const imagePath = path.join(REFERENCE_DIRECTORY_PATH, meta.imageFilename);
    const buffer = await fs.readFile(imagePath);
    if (buffer.length === 0) {
      return null;
    }
    return {
      name: meta.name,
      characterName: meta.characterName,
      characterNotes: meta.characterNotes,
      mimeType: meta.mimeType,
      data: buffer.toString("base64"),
      updatedAt: meta.updatedAt,
    };
  } catch {
    return null;
  }
}

async function updateReferenceDirectoryMeta(patch: {
  characterName?: string;
  characterNotes?: string;
}): Promise<StoredReferenceDirectoryMeta | null> {
  try {
    const rawMeta = await fs.readFile(REFERENCE_META_FILE, "utf8");
    const meta = JSON.parse(rawMeta) as StoredReferenceDirectoryMeta;
    const updated: StoredReferenceDirectoryMeta = {
      ...meta,
      characterName:
        typeof patch.characterName === "string"
          ? patch.characterName
          : meta.characterName,
      characterNotes:
        typeof patch.characterNotes === "string"
          ? patch.characterNotes
          : meta.characterNotes,
      updatedAt: Date.now(),
    };
    await fs.writeFile(
      REFERENCE_META_FILE,
      JSON.stringify(updated, null, 2),
      "utf8"
    );
    return updated;
  } catch {
    return null;
  }
}

async function clearReferenceDirectory(): Promise<void> {
  try {
    const files = await fs.readdir(REFERENCE_DIRECTORY_PATH);
    await Promise.all(
      files.map((file) =>
        fs
          .unlink(path.join(REFERENCE_DIRECTORY_PATH, file))
          .catch(() => undefined)
      )
    );
  } catch {
    // Directory may not exist yet
  }
}

function getGenAIClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not configured. Please select an API key in Settings > Secrets."
    );
  }
  return new GoogleGenAI({
    apiKey,
    apiVersion: "v1beta",
    httpOptions: {
      apiVersion: "v1beta",
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function buildCompiledPrompt(params: {
  sceneNumber: number;
  prompt: string;
  instructions: string;
  negativeRules: string;
  characterProfile: string;
  characterNotes: string;
  characterName: string;
  hasDirectoryReference: boolean;
}): string {
  const sections: string[] = [];

  if (params.instructions.trim()) {
    sections.push(
      `DIRECTOR'S BRIEF & WORKFLOW RULES:\n${params.instructions.trim()}`
    );
  }

  if (params.hasDirectoryReference) {
    const identityLines = [
      "COMMON MASTER STICKMAN CHARACTER REFERENCE DIRECTORY (STRICT — ALWAYS ACTIVE):",
      `- The attached reference image is automatically loaded from the common Master Stickman Character Reference Directory${params.characterName ? ` (${params.characterName})` : ""}.`,
      "- Strictly pull the character's identity and design directly from this Master Stickman Character Reference Directory image for this scene.",
      "- Keep the character fully consistent with the Master Stickman Character Reference Directory: head/face features, stickman body proportions, line weight, hair, fill/skin tone, outfit details, accessories, and overall art style.",
      "- If the scene prompt describes the character differently from the Master Stickman Character Reference Directory, follow the Master Stickman Character Reference Directory for character identity and design, and follow the scene prompt for scene, pose, action, expression, camera angle, lighting, background, and mood.",
      "- Exception: if the scene prompt explicitly requests a different outfit, pose, or expression, apply that change while keeping the Master Stickman character recognizably the same.",
      "- Generate the image immediately. Never ask the user to attach a reference image and never check the prompt for reference attachments.",
    ];

    if (params.characterProfile.trim()) {
      identityLines.push(
        `\nLOCKED MASTER STICKMAN PROFILE:\n${params.characterProfile.trim()}`
      );
    }

    if (params.characterNotes.trim()) {
      identityLines.push(
        `\nDIRECTORY CHARACTER NOTES:\n${params.characterNotes.trim()}`
      );
    }

    sections.push(identityLines.join("\n"));
  }

  if (params.negativeRules.trim()) {
    sections.push(
      `STRICT VISUAL CONSTRAINTS (DO NOT INCLUDE):\n${params.negativeRules.trim()}`
    );
  }

  sections.push(
    `SCENE ${params.sceneNumber} IMAGE PROMPT:\n${params.prompt.trim()}`
  );

  return sections.join("\n\n");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractErrorDetails(err: unknown): {
  status: number;
  message: string;
  retryable: boolean;
} {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();

  if (
    lower.includes("api_key_invalid") ||
    lower.includes("api key not valid") ||
    lower.includes("permission_denied") ||
    lower.includes("403")
  ) {
    return {
      status: 403,
      message:
        "API key permission or validity error. Please verify your billing-enabled Gemini API key in Settings > Secrets.",
      retryable: false,
    };
  }

  if (
    lower.includes("resource_exhausted") ||
    lower.includes("429") ||
    lower.includes("quota") ||
    lower.includes("rate limit")
  ) {
    return {
      status: 429,
      message:
        "Rate limit or quota reached for image generation. Lower batch concurrency or check your billing-enabled API key in Settings > Secrets.",
      retryable: true,
    };
  }

  if (
    lower.includes("503") ||
    lower.includes("unavailable") ||
    lower.includes("overloaded")
  ) {
    return {
      status: 503,
      message: "The Gemini model is temporarily busy. Please retry this scene.",
      retryable: true,
    };
  }

  if (
    lower.includes("safety") ||
    lower.includes("blocked") ||
    lower.includes("prohibited")
  ) {
    return {
      status: 400,
      message:
        "This scene prompt was blocked by content safety filters. Try rephrasing the prompt and retrying.",
      retryable: false,
    };
  }

  return {
    status: 500,
    message: raw || "Image generation failed unexpectedly.",
    retryable: false,
  };
}

async function createApp() {
  await ensureReferenceDirectory();

  const app = express();
  app.use(express.json({ limit: "25mb" }));

  app.get("/api/health", async (_req: Request, res: Response) => {
    const dirRef = await loadReferenceFromDirectory();
    res.json({
      status: "ok",
      hasApiKey: Boolean(process.env.GEMINI_API_KEY),
      referenceDirectoryReady: Boolean(dirRef),
    });
  });

  /**
   * Common Master Stickman Character Reference Directory endpoints.
   * Every image generation pulls directly from this directory automatically.
   */
  app.get("/api/reference-directory", async (_req: Request, res: Response) => {
    const entry = await loadReferenceFromDirectory();
    res.json({
      exists: Boolean(entry),
      directoryName: REFERENCE_DIRECTORY_NAME,
      reference: entry,
    });
  });

  app.post("/api/reference-directory", async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as ReferenceDirectorySaveBody;
    const hasImageData =
      typeof body.data === "string" &&
      body.data.length > 0 &&
      typeof body.mimeType === "string" &&
      body.mimeType.startsWith("image/");

    if (hasImageData) {
      try {
        const meta = await saveReferenceToDirectory({
          name: typeof body.name === "string" ? body.name : "master-stickman.png",
          characterName:
            typeof body.characterName === "string"
              ? body.characterName
              : "Master Stickman",
          characterNotes:
            typeof body.characterNotes === "string" ? body.characterNotes : "",
          mimeType: body.mimeType as string,
          data: body.data as string,
        });
        res.json({
          ok: true,
          directoryName: REFERENCE_DIRECTORY_NAME,
          meta,
        });
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : "Failed to save reference image to directory.";
        res.status(500).json({ error: msg });
      }
      return;
    }

    // Metadata-only update (character name / notes)
    const updated = await updateReferenceDirectoryMeta({
      characterName: body.characterName,
      characterNotes: body.characterNotes,
    });

    if (!updated) {
      res
        .status(400)
        .json({ error: "Provide a valid image file for the reference directory." });
      return;
    }

    res.json({
      ok: true,
      directoryName: REFERENCE_DIRECTORY_NAME,
      meta: updated,
    });
  });

  app.delete("/api/reference-directory", async (_req: Request, res: Response) => {
    await clearReferenceDirectory();
    res.json({ ok: true, directoryName: REFERENCE_DIRECTORY_NAME });
  });

  /**
   * Reviews the active Director's Brief and inspects the Master Stickman
   * Character Reference Directory directly so identity and style rules are locked.
   */
  app.post("/api/review-master-prompt", async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as ReviewMasterPromptRequestBody;
    const masterPrompt =
      typeof body.masterPrompt === "string" ? body.masterPrompt.trim() : "";
    const negativeRules =
      typeof body.negativeRules === "string" ? body.negativeRules.trim() : "";

    if (!masterPrompt) {
      res.status(400).json({ error: "Director's Brief cannot be empty." });
      return;
    }

    // Pull directly from the common Master Stickman Character Reference Directory
    const directoryEntry = await loadReferenceFromDirectory();
    const characterName =
      typeof body.characterName === "string" && body.characterName.trim()
        ? body.characterName.trim()
        : directoryEntry?.characterName ?? "";
    const characterNotes =
      typeof body.characterNotes === "string" && body.characterNotes.trim()
        ? body.characterNotes.trim()
        : directoryEntry?.characterNotes ?? "";

    const effectiveReference: ReferenceImagePayload | null = directoryEntry
      ? { data: directoryEntry.data, mimeType: directoryEntry.mimeType }
      : body.referenceImage &&
          typeof body.referenceImage.data === "string" &&
          body.referenceImage.data.length > 0 &&
          typeof body.referenceImage.mimeType === "string" &&
          body.referenceImage.mimeType.startsWith("image/")
        ? body.referenceImage
        : null;

    let ai: GoogleGenAI;
    try {
      ai = getGenAIClient();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Missing GEMINI_API_KEY";
      res.status(500).json({ error: msg });
      return;
    }

    const parts: Array<
      | { text: string }
      | { inlineData: { data: string; mimeType: string } }
    > = [];

    if (effectiveReference) {
      parts.push({
        inlineData: {
          data: effectiveReference.data,
          mimeType: effectiveReference.mimeType,
        },
      });
    }

    parts.push({
      text: [
        "Review the following Director's Brief workflow instructions" +
          (effectiveReference
            ? " and inspect the attached image loaded from the common Master Stickman Character Reference Directory."
            : "."),
        "Do NOT generate images. Return a concise JSON production brief that locks the rules and Master Stickman character visual identity so every subsequent scene pulls consistently from the common reference directory.",
        `\nDIRECTOR'S BRIEF:\n${masterPrompt}`,
        negativeRules ? `\nVISUAL CONSTRAINTS:\n${negativeRules}` : "",
        characterName ? `\nCHARACTER NAME: ${characterName}` : "",
        characterNotes ? `\nCHARACTER NOTES: ${characterNotes}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    });

    try {
      const response = await ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: { parts },
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              styleLock: {
                type: Type.STRING,
                description:
                  "Short 1-sentence lock describing the exact art style observed in the Master Stickman Character Reference Directory image and Director's Brief.",
              },
              characterProfile: {
                type: Type.STRING,
                description:
                  "Precise visual description of the reference character from the Master Stickman Character Reference Directory (face, line style, proportions, hair, outfit details, accessories) to maintain exact identity consistency. Empty string if directory is empty.",
              },
              activeRules: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description:
                  "3 to 5 concise active enforcement rules confirmed from the Director's Brief.",
              },
              readyForBatch: {
                type: Type.BOOLEAN,
                description:
                  "True if the Director's Brief is valid and ready for batch generation.",
              },
            },
            required: [
              "styleLock",
              "characterProfile",
              "activeRules",
              "readyForBatch",
            ],
          },
        },
      });

      const rawJson = (response.text ?? "{}").trim();
      const parsed = JSON.parse(rawJson) as {
        styleLock?: string;
        characterProfile?: string;
        activeRules?: string[];
        readyForBatch?: boolean;
      };

      res.json({
        styleLock: parsed.styleLock || "Reference art style locked.",
        characterProfile: parsed.characterProfile || "",
        activeRules: Array.isArray(parsed.activeRules)
          ? parsed.activeRules.slice(0, 5)
          : [],
        readyForBatch: parsed.readyForBatch !== false,
        reviewedWithReference: Boolean(effectiveReference),
        reviewedAt: Date.now(),
      });
    } catch (err) {
      const details = extractErrorDetails(err);
      res.status(details.status).json({ error: details.message });
    }
  });

  /**
   * Generates a single scene image.
   * Directly reads the character reference from the common Master Stickman
   * Character Reference Directory without checking prompts for attachments.
   */
  app.post("/api/generate-scene", async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as GenerateSceneRequestBody;

    const sceneNumber =
      typeof body.sceneNumber === "number" && Number.isFinite(body.sceneNumber)
        ? Math.max(1, Math.floor(body.sceneNumber))
        : 1;
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const instructions =
      typeof body.instructions === "string" ? body.instructions.trim() : "";
    const negativeRules =
      typeof body.negativeRules === "string" ? body.negativeRules.trim() : "";
    const characterProfile =
      typeof body.characterProfile === "string"
        ? body.characterProfile.trim()
        : "";
    const aspectRatio =
      typeof body.aspectRatio === "string" &&
      ALLOWED_ASPECT_RATIOS.has(body.aspectRatio)
        ? body.aspectRatio
        : "16:9";
    const model =
      typeof body.model === "string" && ALLOWED_MODELS.has(body.model)
        ? body.model
        : "gemini-3.1-flash-lite-image";
    const imageSize =
      typeof body.imageSize === "string" && ALLOWED_IMAGE_SIZES.has(body.imageSize)
        ? body.imageSize
        : "1K";

    if (!prompt) {
      res
        .status(400)
        .json({ error: `Scene ${sceneNumber} prompt cannot be empty.` });
      return;
    }

    // Always resolve character reference directly from the common Master Stickman Reference Directory
    const directoryEntry = await loadReferenceFromDirectory();
    const characterNotes =
      typeof body.characterNotes === "string" && body.characterNotes.trim()
        ? body.characterNotes.trim()
        : directoryEntry?.characterNotes ?? "";

    const compiledPrompt = buildCompiledPrompt({
      sceneNumber,
      prompt,
      instructions,
      negativeRules,
      characterProfile,
      characterNotes,
      characterName: directoryEntry?.characterName ?? "",
      hasDirectoryReference: Boolean(directoryEntry),
    });

    const parts: Array<
      | { text: string }
      | { inlineData: { data: string; mimeType: string } }
    > = [];

    if (directoryEntry) {
      parts.push({
        inlineData: {
          data: directoryEntry.data,
          mimeType: directoryEntry.mimeType,
        },
      });
    }

    parts.push({ text: compiledPrompt });

    const imageConfig: Record<string, string> = {
      aspectRatio,
    };

    if (model === "gemini-nano-banana-2.1") {
      imageConfig.imageSize = imageSize;
    }

    let ai: GoogleGenAI;
    try {
      ai = getGenAIClient();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Missing GEMINI_API_KEY";
      res.status(500).json({ error: msg });
      return;
    }

    const maxAttempts = 3;
    let lastError: {
      status: number;
      message: string;
      retryable: boolean;
    } | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: { parts },
          config: {
            imageConfig,
          },
        });

        const responseParts = response.candidates?.[0]?.content?.parts ?? [];
        let imageData: string | null = null;
        let mimeType = "image/png";
        let modelNote = "";

        for (const part of responseParts) {
          if (part.inlineData?.data && !imageData) {
            imageData = part.inlineData.data;
            mimeType = part.inlineData.mimeType || "image/png";
          } else if (part.text) {
            modelNote += part.text;
          }
        }

        if (!imageData) {
          const finishReason = response.candidates?.[0]?.finishReason;
          const fallbackMsg = modelNote.trim()
            ? `Model returned text instead of an image: ${modelNote.trim().slice(0, 200)}`
            : `No image was returned for scene ${sceneNumber}${finishReason ? ` (${finishReason})` : ""}.`;
          res.status(422).json({ error: fallbackMsg });
          return;
        }

        res.json({
          sceneNumber,
          imageDataUrl: `data:${mimeType};base64,${imageData}`,
          mimeType,
          compiledPrompt,
          model,
          aspectRatio,
          usedReferenceDirectory: Boolean(directoryEntry),
        });
        return;
      } catch (err) {
        const details = extractErrorDetails(err);
        lastError = details;
        if (details.retryable && attempt < maxAttempts) {
          const delayMs = 1200 * Math.pow(2, attempt - 1);
          await sleep(delayMs);
          continue;
        }
        break;
      }
    }

    res.status(lastError?.status ?? 500).json({
      error: lastError?.message ?? `Failed to generate scene ${sceneNumber}.`,
    });
  });

  // ---------------------------------------------------------------------------
  // Script Writer Studio Endpoints (Topic Ideation, Web-Grounded Script Writing,
  // Automatic 6-Point Continuity Tracking & Script Revisions)
  // ---------------------------------------------------------------------------

  const ALLOWED_SCRIPT_GENRES = new Set([
    "Survival",
    "Apocalypse",
    "Horror",
    "Sci-Fi",
    "Adventure",
    "Comedy",
    "Fun",
    "Romantic",
  ]);

  const ALLOWED_FORMATS = new Set([
    "single",
    "multiple",
    "long_run",
    "sequel",
    "prequel",
  ]);

  function stripCodeFencesForTts(rawText: string): string {
    let cleaned = rawText.trim();
    // If model wrapped output in ```...```, extract inside the block
    const fencedMatch = cleaned.match(/^```[a-zA-Z0-9_-]*\s*\n([\s\S]*?)\n```$/);
    if (fencedMatch && fencedMatch[1]) {
      cleaned = fencedMatch[1].trim();
    } else {
      cleaned = cleaned
        .replace(/^```[a-zA-Z0-9_-]*\s*\n?/, "")
        .replace(/\n?```\s*$/, "")
        .trim();
    }
    return cleaned;
  }

  function extractResearchSources(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    response: any
  ): Array<{ title: string; uri: string }> {
    const chunks =
      response?.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (!Array.isArray(chunks)) return [];
    const seen = new Set<string>();
    const sources: Array<{ title: string; uri: string }> = [];
    for (const chunk of chunks) {
      const uri = typeof chunk?.web?.uri === "string" ? chunk.web.uri.trim() : "";
      if (!uri || seen.has(uri)) continue;
      // Exclude YouTube videos per master prompt research rule
      if (uri.toLowerCase().includes("youtube.com") || uri.toLowerCase().includes("youtu.be")) {
        continue;
      }
      seen.add(uri);
      const title =
        typeof chunk?.web?.title === "string" && chunk.web.title.trim()
          ? chunk.web.title.trim()
          : uri;
      sources.push({ title, uri });
    }
    return sources.slice(0, 12);
  }

  function getLastSentencesExcerpt(scriptText: string): string {
    const paragraphs = scriptText
      .split(/\n+/)
      .map((p) => p.trim())
      .filter(Boolean);
    const tail = paragraphs.slice(-2).join(" ");
    return tail.slice(-550);
  }

  async function extractContinuityAndCast(
    ai: GoogleGenAI,
    params: {
      seriesTitle: string;
      seasonNumber: number;
      episodeNumber: number;
      scriptText: string;
      existingCharacters: Array<{
        name: string;
        role: string;
        status: string;
        introducedIn: string;
      }>;
      previousContinuity: Record<string, string> | null;
    }
  ): Promise<{
    episodeTitle: string;
    continuityState: {
      catastrophePhase: string;
      elapsedTimeline: string;
      primarySetting: string;
      systemsAndResources: string;
      activeCastSummary: string;
      unresolvedCliffhanger: string;
      lastEpisodeEndingExcerpt: string;
    };
    discoveredCharacters: Array<{
      name: string;
      role: string;
      status: string;
    }>;
  }> {
    const excerpt = getLastSentencesExcerpt(params.scriptText);
    const episodeLabel = `S${params.seasonNumber}E${params.episodeNumber}`;

    try {
      const extraction = await ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: [
          `Analyze this finished narrated episode script for "${params.seriesTitle}" (${episodeLabel}) and extract exact continuity state for the next episode.`,
          params.previousContinuity
            ? `PRIOR CONTINUITY:\n${JSON.stringify(params.previousContinuity, null, 2)}`
            : "",
          params.existingCharacters.length > 0
            ? `KNOWN CAST ROSTER:\n${params.existingCharacters
                .map((c) => `- ${c.name} (${c.role}) — ${c.status}`)
                .join("\n")}`
            : "",
          `FINISHED SCRIPT:\n${params.scriptText.slice(0, 28000)}`,
        ]
          .filter(Boolean)
          .join("\n\n"),
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              episodeTitle: {
                type: Type.STRING,
                description:
                  "Short 3 to 7 word episode title summarizing this installment (Title Case, no episode prefix).",
              },
              catastrophePhase: {
                type: Type.STRING,
                description:
                  "Catastrophe type and exact current phase of collapse at the end of this episode.",
              },
              elapsedTimeline: {
                type: Type.STRING,
                description:
                  "Exact elapsed time passed since the event began (e.g., 'Day 4, 92 hours after blackout').",
              },
              primarySetting: {
                type: Type.STRING,
                description:
                  "Exact current location, shelter, and environmental/climate conditions where the episode ends.",
              },
              systemsAndResources: {
                type: Type.STRING,
                description:
                  "Status of active vs depleted systems and supplies (power, water, food, fuel, comms, medicine).",
              },
              activeCastSummary: {
                type: Type.STRING,
                description:
                  "Concise summary of protagonist and all named characters, roles, relationships, and current status.",
              },
              unresolvedCliffhanger: {
                type: Type.STRING,
                description:
                  "Exact unresolved threat, decision, or cliffhanger left open at the final moment of this episode.",
              },
              discoveredCharacters: {
                type: Type.ARRAY,
                description:
                  "All named recurring characters appearing in this episode (excluding unnamed passersby).",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    role: { type: Type.STRING },
                    status: { type: Type.STRING },
                  },
                  required: ["name", "role", "status"],
                },
              },
            },
            required: [
              "episodeTitle",
              "catastrophePhase",
              "elapsedTimeline",
              "primarySetting",
              "systemsAndResources",
              "activeCastSummary",
              "unresolvedCliffhanger",
              "discoveredCharacters",
            ],
          },
        },
      });

      const parsed = JSON.parse((extraction.text ?? "{}").trim()) as {
        episodeTitle?: string;
        catastrophePhase?: string;
        elapsedTimeline?: string;
        primarySetting?: string;
        systemsAndResources?: string;
        activeCastSummary?: string;
        unresolvedCliffhanger?: string;
        discoveredCharacters?: Array<{
          name?: string;
          role?: string;
          status?: string;
        }>;
      };

      return {
        episodeTitle:
          parsed.episodeTitle?.trim() || `Episode ${params.episodeNumber}`,
        continuityState: {
          catastrophePhase:
            parsed.catastrophePhase?.trim() || params.seriesTitle,
          elapsedTimeline:
            parsed.elapsedTimeline?.trim() || `End of ${episodeLabel}`,
          primarySetting: parsed.primarySetting?.trim() || "Ongoing survival setting",
          systemsAndResources:
            parsed.systemsAndResources?.trim() || "Supplies severely strained",
          activeCastSummary:
            parsed.activeCastSummary?.trim() || "Protagonist surviving ongoing crisis",
          unresolvedCliffhanger:
            parsed.unresolvedCliffhanger?.trim() ||
            "Immediate survival stakes carry forward directly into the next episode.",
          lastEpisodeEndingExcerpt: excerpt,
        },
        discoveredCharacters: Array.isArray(parsed.discoveredCharacters)
          ? parsed.discoveredCharacters
              .filter(
                (c): c is { name: string; role: string; status: string } =>
                  typeof c?.name === "string" && c.name.trim().length > 0
              )
              .map((c) => ({
                name: c.name.trim(),
                role: (c.role || "Survivor").trim(),
                status: (c.status || "Active").trim(),
              }))
          : [],
      };
    } catch {
      return {
        episodeTitle: `Episode ${params.episodeNumber}`,
        continuityState: {
          catastrophePhase: params.seriesTitle,
          elapsedTimeline: `End of ${episodeLabel}`,
          primarySetting: "Continuing directly from the closing scene",
          systemsAndResources: "Critical supplies remain limited",
          activeCastSummary:
            params.existingCharacters.length > 0
              ? params.existingCharacters
                  .map((c) => `${c.name} (${c.role})`)
                  .join(", ")
              : "Solo protagonist",
          unresolvedCliffhanger:
            "Pick up directly from the final moment of the previous episode.",
          lastEpisodeEndingExcerpt: excerpt,
        },
        discoveredCharacters: [],
      };
    }
  }

  /**
   * Part 1: Generate 10 fresh, deduplicated viral topics matching the user's
   * exact Topic DNA and Title Rules for the chosen genre.
   */
  app.post("/api/script/topics", async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as {
      genre?: string;
      excludeTopics?: string[];
      briefPart1?: string;
    };

    const genre =
      typeof body.genre === "string" && ALLOWED_SCRIPT_GENRES.has(body.genre)
        ? body.genre
        : "Survival";
    const excludeTopics = Array.isArray(body.excludeTopics)
      ? body.excludeTopics
          .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
          .slice(-80)
      : [];
    const briefPart1 =
      typeof body.briefPart1 === "string" ? body.briefPart1.trim() : "";

    let ai: GoogleGenAI;
    try {
      ai = getGenAIClient();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Missing GEMINI_API_KEY";
      res.status(500).json({ error: msg });
      return;
    }

    const isSurvivalCore = genre === "Survival" || genre === "Apocalypse";

    const promptLines = [
      briefPart1 ||
        "Generate 10 high-retention YouTube survival/apocalypse video titles.",
      `\nACTIVE GENRE: ${genre}`,
      isSurvivalCore
        ? `TITLE FORMULA REQUIREMENT: Strictly use Formula A ("I Survived ...") and Formula B ("Stranded in ...") across the 10 titles (roughly 5 of each). Every title MUST be 6 to 11 words, Title Case, at most one word in ALL CAPS, zero numbers, zero emojis, zero brackets, zero version tags (never append 1.1, v2, Ep 1, or draft suffixes), and zero clickbait punctuation. Verify strict English grammar and singular/plural agreement (for example, "Every Cargo Ship", never "Every Cargo Ships").`
        : `GENRE ADAPTATION REQUIREMENT: Keep the same grounded, realistic, high-retention narrative DNA and human stakes while tailoring the premise and tone to the "${genre}" genre. Prefer "I Survived ..." and "Stranded in ..." formulas where natural, or clean 6 to 11 word Title Case hooks with zero numbers, emojis, brackets, version tags, or clickbait punctuation, and strict English grammar and singular/plural agreement.`,
      `FAMILY SPREAD: Spread the 10 topics cleanly across all three families ("Immediate Survival", "Systemic Collapse", and "Aftermath & Rebuilding").`,
      excludeTopics.length > 0
        ? `\nALREADY-ANALYZED / PREVIOUSLY SUGGESTED TOPICS (NEVER REPEAT OR SUGGEST A VARIANT OF ANY OF THESE):\n${excludeTopics
            .map((t, i) => `${i + 1}. ${t}`)
            .join("\n")}`
        : "",
      `\nReturn exactly 10 brand-new, completely distinct video topics as JSON.`,
    ]
      .filter(Boolean)
      .join("\n");

    try {
      const response = await ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: promptLines,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              topics: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: {
                      type: Type.STRING,
                      description:
                        "6 to 11 words, Title Case, at most one word in ALL CAPS, no numbers/emojis/brackets.",
                    },
                    family: {
                      type: Type.STRING,
                      enum: [
                        "Immediate Survival",
                        "Systemic Collapse",
                        "Aftermath & Rebuilding",
                      ],
                    },
                    formula: {
                      type: Type.STRING,
                      enum: ["I Survived", "Stranded in", "Genre Hook"],
                    },
                  },
                  required: ["title", "family", "formula"],
                },
              },
            },
            required: ["topics"],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? "{}").trim()) as {
        topics?: Array<{
          title?: string;
          family?: string;
          formula?: string;
        }>;
      };

      const excludedLower = new Set(excludeTopics.map((t) => t.toLowerCase().trim()));
      const topics = (Array.isArray(parsed.topics) ? parsed.topics : [])
        .filter((item) => {
          const title = typeof item?.title === "string" ? item.title.trim() : "";
          return title.length > 0 && !excludedLower.has(title.toLowerCase());
        })
        .slice(0, 10)
        .map((item) => ({
          title: (item.title as string).trim(),
          family:
            item.family === "Systemic Collapse" ||
            item.family === "Aftermath & Rebuilding"
              ? item.family
              : "Immediate Survival",
          formula:
            item.formula === "Stranded in" || item.formula === "Genre Hook"
              ? item.formula
              : "I Survived",
          genre,
        }));

      if (topics.length === 0) {
        res
          .status(502)
          .json({ error: "Could not generate new topics. Please try again." });
        return;
      }

      res.json({ topics });
    } catch (err) {
      const details = extractErrorDetails(err);
      res.status(details.status).json({ error: details.message });
    }
  });

  /**
   * Part 2 & 3: Research-grounded narrative script generation with Google Search
   * grounding + strict TTS output contract + automatic 6-point continuity update.
   */
  app.post("/api/script/generate", async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as {
      title?: string;
      genre?: string;
      format?: string;
      shortsMode?: boolean;
      plannedEpisodeCount?: number;
      durationMinutes?: number;
      customStoryNotes?: string;
      seasonNumber?: number;
      episodeNumber?: number;
      characterMode?: string;
      characters?: Array<{
        name: string;
        role: string;
        status?: string;
        introducedIn?: string;
      }>;
      newEpisodeCharacterMode?: "none" | "custom" | "ai_choose";
      newEpisodeCharacters?: Array<{ name: string; role: string }>;
      continuityState?: {
        catastrophePhase?: string;
        elapsedTimeline?: string;
        primarySetting?: string;
        systemsAndResources?: string;
        activeCastSummary?: string;
        unresolvedCliffhanger?: string;
        lastEpisodeEndingExcerpt?: string;
      } | null;
      endingStyle?:
        | "continuing"
        | "season_partial_conclusion"
        | "full_conclusion"
        | "tight_suspense";
      briefConfig?: {
        part1TopicAndTitleRules?: string;
        part2ContinuityAndScopeRules?: string;
        part3ScriptDnaAndTtsRules?: string;
      };
    };

    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) {
      res.status(400).json({ error: "Select or enter a topic title before generating a script." });
      return;
    }

    const genre =
      typeof body.genre === "string" && ALLOWED_SCRIPT_GENRES.has(body.genre)
        ? body.genre
        : "Survival";
    const format =
      typeof body.format === "string" && ALLOWED_FORMATS.has(body.format)
        ? body.format
        : "single";
    const shortsMode = Boolean(body.shortsMode);
    const plannedEpisodeCount =
      typeof body.plannedEpisodeCount === "number" &&
      Number.isFinite(body.plannedEpisodeCount)
        ? Math.max(1, Math.min(10, Math.floor(body.plannedEpisodeCount)))
        : 10;
    const durationMinutes =
      typeof body.durationMinutes === "number" &&
      Number.isFinite(body.durationMinutes)
        ? Math.max(1, Math.min(60, Math.round(body.durationMinutes)))
        : 20;
    const customStoryNotes =
      typeof body.customStoryNotes === "string"
        ? body.customStoryNotes.trim()
        : "";

    const isSingleShortReel = shortsMode && format === "single";
    const targetSeconds = isSingleShortReel ? 30 : durationMinutes * 60;
    const targetWords = isSingleShortReel ? 75 : durationMinutes * 150;
    const shortsSegmentCount = shortsMode
      ? isSingleShortReel
        ? 1
        : Math.max(1, Math.round(targetSeconds / 30))
      : undefined;

    const seasonNumber =
      typeof body.seasonNumber === "number" && body.seasonNumber >= 1
        ? Math.floor(body.seasonNumber)
        : 1;
    const episodeNumber =
      typeof body.episodeNumber === "number" && body.episodeNumber >= 1
        ? Math.floor(body.episodeNumber)
        : 1;
    const isContinuingEpisode =
      (format !== "single" && (seasonNumber > 1 || episodeNumber > 1)) ||
      (format === "sequel" && Boolean(body.continuityState));
    const isNewSeasonOpener =
      format !== "single" && seasonNumber > 1 && episodeNumber === 1;
    const isSeasonFinale =
      format !== "single" && episodeNumber >= plannedEpisodeCount;

    const existingCharacters = Array.isArray(body.characters)
      ? body.characters
          .filter((c) => typeof c?.name === "string" && c.name.trim().length > 0)
          .map((c) => ({
            name: c.name.trim(),
            role: (c.role || "Survivor").trim(),
            status: (c.status || "Active").trim(),
            introducedIn: (c.introducedIn || "S1E1").trim(),
          }))
      : [];

    const newCharacters = Array.isArray(body.newEpisodeCharacters)
      ? body.newEpisodeCharacters
          .filter((c) => typeof c?.name === "string" && c.name.trim().length > 0)
          .map((c) => ({
            name: c.name.trim(),
            role: (c.role || "Survivor").trim(),
          }))
      : [];

    const endingStyle =
      body.endingStyle === "full_conclusion" ||
      body.endingStyle === "tight_suspense" ||
      body.endingStyle === "season_partial_conclusion"
        ? body.endingStyle
        : format === "single"
          ? "full_conclusion"
          : isSeasonFinale
            ? "season_partial_conclusion"
            : "continuing";

    let ai: GoogleGenAI;
    try {
      ai = getGenAIClient();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Missing GEMINI_API_KEY";
      res.status(500).json({ error: msg });
      return;
    }

    const systemInstruction = [
      body.briefConfig?.part1TopicAndTitleRules || "",
      body.briefConfig?.part2ContinuityAndScopeRules || "",
      body.briefConfig?.part3ScriptDnaAndTtsRules || "",
      "CRITICAL OUTPUT CONTRACT: Return ONLY the pure spoken narration words ready to paste straight into a text-to-speech engine. Zero titles, zero chapter headings, zero labels, zero part numbers, zero timestamps, zero speaker tags, zero brackets, zero stage directions, zero markdown, zero URLs/citations inside the narration, zero word counts, zero handoff text, and zero dashes/semicolons/parentheses/slashes.",
    ]
      .filter(Boolean)
      .join("\n\n");

    const castDirectiveLines: string[] = [];
    if (body.characterMode === "solo" && existingCharacters.length === 0 && newCharacters.length === 0 && body.newEpisodeCharacterMode !== "ai_choose") {
      castDirectiveLines.push(
        "CAST MODE: Single protagonist personal first-person journey. Keep focus tightly on the narrator's lived experience."
      );
    } else {
      castDirectiveLines.push(
        "CAST MODE: Multi-character lived narrative alongside the first-person narrator. Weave named characters naturally into prose and dialogue beats without script tags."
      );
      if (existingCharacters.length > 0) {
        castDirectiveLines.push(
          `LOCKED EXISTING CAST (keep exact names and roles 100% consistent):\n${existingCharacters
            .map((c) => `- ${c.name}: ${c.role} (status: ${c.status})`)
            .join("\n")}`
        );
      }
      if (newCharacters.length > 0) {
        castDirectiveLines.push(
          `NEW CHARACTERS INTRODUCED IN THIS EPISODE (introduce naturally and keep names exact):\n${newCharacters
            .map((c) => `- ${c.name}: ${c.role}`)
            .join("\n")}`
        );
      }
      if (
        body.characterMode === "ai_choose" &&
        existingCharacters.length === 0 &&
        newCharacters.length === 0
      ) {
        castDirectiveLines.push(
          "AI CAST SELECTION: Create 2 to 4 realistic, memorable recurring character names matched to grounded survival roles (e.g., neighbor, nurse, mechanic, family member) and use their exact names consistently."
        );
      } else if (body.newEpisodeCharacterMode === "ai_choose") {
        castDirectiveLines.push(
          "NEW EPISODE AI CHARACTER: Introduce 1 to 2 realistic new named characters relevant to this episode's survival challenge alongside the existing cast."
        );
      }
    }

    const continuityLines: string[] = [];
    if (isNewSeasonOpener && body.continuityState) {
      continuityLines.push(
        `SEASON ${seasonNumber} PREMIERE — FRESH CHAPTER WITH FULL CONTINUITY:`,
        `- Open Season ${seasonNumber}, Episode 1 as a FRESH CHAPTER with renewed forward momentum and evolving stakes following Season ${seasonNumber - 1}'s partial conclusion.`,
        "- Keep the EXACT same narrator voice, grounded storytelling style, cast roster, and established world history from Season 1. NEVER reboot or repeat 'On the day it started...'.",
        `- Prior Catastrophe & Phase: ${body.continuityState.catastrophePhase || title}`,
        `- Prior Elapsed Timeline: ${body.continuityState.elapsedTimeline || "Continuing directly"}`,
        `- Setting & Conditions: ${body.continuityState.primarySetting || "Ongoing"}`,
        `- Active & Depleted Systems: ${body.continuityState.systemsAndResources || "Strained"}`,
        `- Active Cast: ${body.continuityState.activeCastSummary || "Existing cast"}`,
        `- Season ${seasonNumber - 1} Partial Conclusion Hook: ${body.continuityState.unresolvedCliffhanger || "Launch fresh chapter directly from prior suspense"}`,
        body.continuityState.lastEpisodeEndingExcerpt
          ? `- Final Lines of Previous Season Finale:\n"${body.continuityState.lastEpisodeEndingExcerpt}"`
          : ""
      );
    } else if (isContinuingEpisode && body.continuityState) {
      continuityLines.push(
        "MANDATORY CONTINUATION FROM PREVIOUS EPISODE (DO NOT RESET TO 'ON THE DAY IT STARTED'):",
        `- Catastrophe & Phase: ${body.continuityState.catastrophePhase || title}`,
        `- Elapsed Timeline: ${body.continuityState.elapsedTimeline || "Continuing directly"}`,
        `- Setting & Conditions: ${body.continuityState.primarySetting || "Ongoing"}`,
        `- Active & Depleted Systems: ${body.continuityState.systemsAndResources || "Strained"}`,
        `- Active Cast: ${body.continuityState.activeCastSummary || "Existing cast"}`,
        `- Previous Unresolved Threat / Cliffhanger: ${body.continuityState.unresolvedCliffhanger || "Continue directly"}`,
        body.continuityState.lastEpisodeEndingExcerpt
          ? `- Exact Final Lines of Previous Episode:\n"${body.continuityState.lastEpisodeEndingExcerpt}"`
          : "",
        "OPENING REQUIREMENT: Open with a 15-second immediate-danger hook from the current timeline, then advance directly where the previous episode left off! Never re-explain the start of the catastrophe as if it were Episode 1."
      );
    } else if (format === "prequel") {
      continuityLines.push(
        "PREQUEL OPENING REQUIREMENT: Open with a punchy 15-second cold open flashing the imminent catastrophe, then focus on the overlooked early warning signs, cascading infrastructure failures, and final hours leading up to the event."
      );
    } else {
      continuityLines.push(
        "EPISODE 1 / STANDALONE OPENING REQUIREMENT: NEVER spend the first 45 seconds on slow everyday errands. Open immediately with a 15-second (35 to 50 words) high-stakes cold open pulled from peak crisis or immediate survival consequence, then immediately snap back to the ordinary moment (60 to 100 words) and trigger the first shift within the first 35 to 45 seconds of narration."
      );
    }

    const endingInstruction =
      endingStyle === "season_partial_conclusion"
        ? `SEASON ${seasonNumber} FINALE — PARTIAL CONCLUSION (MANDATORY): Deliver a PARTIAL CONCLUSION for this season finale. Resolve Season ${seasonNumber}'s immediate survival crisis and emotional arc in a genuinely conclusive, satisfying way so the season feels complete, WHILE leaving a suspenseful underlying revelation or unresolved horizon open at the end so Season ${seasonNumber + 1} can open cleanly as a fresh chapter continuing the same scripting voice and continuity. Do NOT end abruptly mid-sentence and do NOT permanently close the entire world.`
        : endingStyle === "full_conclusion"
          ? "ENDING STYLE: Full Conclusion — resolve all active story arcs, survival stakes, and character fates cleanly with a memorable emotional button line and no sudden cliffhanger."
          : endingStyle === "tight_suspense"
            ? "ENDING STYLE: Tight Suspenseful Ending — resolve this episode's immediate crisis beat while leaving overarching tension tight and open-ended so the story can either stop here or continue later."
            : "ENDING STYLE: Continuing Series Hook — resolve this episode's immediate survival chapter while closing with a gripping narrative cliffhanger/bridge directly setting up the next episode.";

    const lengthAndShortsInstruction = isSingleShortReel
      ? [
          "SHORTS / INSTAGRAM REEL MODE (SINGLE 30-SECOND SHORT):",
          "- Target length: strictly 30 seconds — approximately 70 to 80 spoken words at 150 words per minute.",
          "- Deliver one razor-sharp vertical short/reel script: instant scroll-stopping hook in the first 3 seconds, one gripping grounded twist/survival realization in the middle, and a punchy final button line.",
          "- Output strictly pure spoken words only with zero labels, headings, or brackets.",
        ].join("\n")
      : shortsMode && shortsSegmentCount
        ? [
            `SHORTS / REELS CONTINUITY MODE (${durationMinutes} MINUTES SPLIT INTO ${shortsSegmentCount} × 30-SECOND REEL SEGMENTS):`,
            `- Target total length: ${durationMinutes} minutes — approximately ${targetWords} spoken words at 150 words per minute (within 5 percent).`,
            `- CRITICAL 30-SECOND CONTINUITY STRUCTURE: Write the script as exactly ${shortsSegmentCount} consecutive paragraphs, separated by a blank line, where EACH paragraph is paced for one 30-second YouTube Short / Instagram Reel (~70 to 80 spoken words per paragraph).`,
            "- Each 30-second paragraph must flow seamlessly from the previous paragraph's natural pause/gap, open with immediate momentum, land a vivid mini-beat or micro-turn, and end on a natural breath/tension beat that pulls the listener smoothly into the next 30-second segment.",
            "- NEVER write 'Part 1', 'Reel 2', '0:30', '[Pause]', or any labels/headings inside the text — use ONLY clean paragraph breaks between each 30-second spoken segment so it stays 100 percent pure TTS narration while making downstream 30-second scene/prompt breakdown effortless.",
          ].join("\n")
        : `TARGET LENGTH: ${durationMinutes} minutes — approximately ${targetWords} spoken words (at 150 words per minute, within 5 percent).${
            durationMinutes < 3
              ? " Because duration is under 3 minutes, compress cleanly into story hook, two survival beats, reflection recap, and button line."
              : ""
          }`;

    const customDirectionBlock = customStoryNotes
      ? [
          "USER CUSTOM STORY DIRECTION & EMOTIONAL/PLOT INPUTS (WEAVE NATURALLY INTO THIS EPISODE):",
          customStoryNotes,
          "Honor these creative notes (such as romance, jealousy, possessiveness, character conflicts, or specific twists) authentically through lived scenes, dialogue beats, and narrator reflection while preserving the channel's grounded voice and strict TTS contract.",
        ].join("\n")
      : "";

    const userPrompt = [
      `Write the complete narrated script for the topic: "${title}"`,
      `GENRE: ${genre}`,
      `FORMAT: ${format} (${
        format === "single"
          ? isSingleShortReel
            ? "Standalone 30-Second Short / Reel"
            : "Standalone Single Episode"
          : `Season ${seasonNumber}, Episode ${episodeNumber} of ${plannedEpisodeCount}${
              shortsMode ? " (Shorts/Reels 30s Continuity Format)" : ""
            }`
      })`,
      lengthAndShortsInstruction,
      castDirectiveLines.join("\n"),
      customDirectionBlock,
      continuityLines.filter(Boolean).join("\n"),
      endingInstruction,
      "STEP 1 (INTERNAL RESEARCH): Use Google Search right now to verify scientific, engineering, historical, and survival facts from authoritative reports, papers, and historical disaster records (never YouTube transcripts). Express scientific uncertainty naturally in prose where experts disagree.",
      "STEP 2 (DELIVER PURE TTS NARRATION): Output ONLY the finished spoken script text with zero markdown, zero headings, zero part numbers, zero timestamps, zero brackets, zero speaker labels, zero URLs, and zero extra commentary before or after the script.",
    ]
      .filter(Boolean)
      .join("\n\n");

    try {
      const response = await ai.models.generateContent({
        model: "gemini-4-neon",
        contents: userPrompt,
        config: {
          systemInstruction,
          tools: [{ googleSearch: {} }],
        },
      });

      const scriptText = stripCodeFencesForTts(response.text ?? "");
      if (!scriptText) {
        res
          .status(502)
          .json({ error: "The model returned an empty script. Please retry." });
        return;
      }

      const researchSources = extractResearchSources(response);
      const wordCount = scriptText.split(/\s+/).filter(Boolean).length;

      const mergedKnownCast = [
        ...existingCharacters,
        ...newCharacters.map((c) => ({
          name: c.name,
          role: c.role,
          status: "Active",
          introducedIn: `S${seasonNumber}E${episodeNumber}`,
        })),
      ];

      const extracted = await extractContinuityAndCast(ai, {
        seriesTitle: title,
        seasonNumber,
        episodeNumber,
        scriptText,
        existingCharacters: mergedKnownCast,
        previousContinuity: body.continuityState
          ? (body.continuityState as Record<string, string>)
          : null,
      });

      res.json({
        episodeTitle: extracted.episodeTitle,
        scriptText,
        wordCount,
        targetMinutes: isSingleShortReel ? 0.5 : durationMinutes,
        targetSeconds,
        isShortsMode: shortsMode,
        shortsSegmentCount,
        endingStyle,
        researchSources,
        continuityState: extracted.continuityState,
        discoveredCharacters: extracted.discoveredCharacters,
        generatedAt: Date.now(),
      });
    } catch (err) {
      const details = extractErrorDetails(err);
      res.status(details.status).json({ error: details.message });
    }
  });

  /**
   * Revise an existing episode script cleanly per user notes while preserving
   * the strict TTS output contract and refreshing continuity state.
   */
  app.post("/api/script/revise", async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as {
      title?: string;
      genre?: string;
      seasonNumber?: number;
      episodeNumber?: number;
      durationMinutes?: number;
      shortsMode?: boolean;
      targetSeconds?: number;
      shortsSegmentCount?: number;
      customStoryNotes?: string;
      currentScript?: string;
      revisionInstructions?: string;
      characters?: Array<{
        name: string;
        role: string;
        status?: string;
        introducedIn?: string;
      }>;
      briefConfig?: {
        part2ContinuityAndScopeRules?: string;
        part3ScriptDnaAndTtsRules?: string;
      };
    };

    const currentScript =
      typeof body.currentScript === "string" ? body.currentScript.trim() : "";
    const revisionInstructions =
      typeof body.revisionInstructions === "string"
        ? body.revisionInstructions.trim()
        : "";
    if (!currentScript || !revisionInstructions) {
      res.status(400).json({
        error: "Both the current script and revision instructions are required.",
      });
      return;
    }

    const title = typeof body.title === "string" ? body.title.trim() : "Episode";
    const seasonNumber =
      typeof body.seasonNumber === "number" && body.seasonNumber >= 1
        ? Math.floor(body.seasonNumber)
        : 1;
    const episodeNumber =
      typeof body.episodeNumber === "number" && body.episodeNumber >= 1
        ? Math.floor(body.episodeNumber)
        : 1;
    const durationMinutes =
      typeof body.durationMinutes === "number" &&
      Number.isFinite(body.durationMinutes)
        ? Math.max(1, Math.min(60, Math.round(body.durationMinutes)))
        : 20;
    const shortsMode = Boolean(body.shortsMode);
    const targetSeconds =
      typeof body.targetSeconds === "number" && body.targetSeconds >= 15
        ? Math.round(body.targetSeconds)
        : durationMinutes * 60;
    const targetWords = Math.round((targetSeconds / 60) * 150);
    const customStoryNotes =
      typeof body.customStoryNotes === "string"
        ? body.customStoryNotes.trim()
        : "";

    let ai: GoogleGenAI;
    try {
      ai = getGenAIClient();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Missing GEMINI_API_KEY";
      res.status(500).json({ error: msg });
      return;
    }

    const systemInstruction = [
      body.briefConfig?.part2ContinuityAndScopeRules || "",
      body.briefConfig?.part3ScriptDnaAndTtsRules || "",
      "STRICT TTS OUTPUT CONTRACT: Return ONLY the complete revised spoken narration words ready to paste straight into a text-to-speech engine. Zero headings, zero part numbers, zero timestamps, zero brackets, zero speaker labels, zero markdown, zero URLs, zero notes, zero dashes/semicolons/parentheses/slashes.",
    ]
      .filter(Boolean)
      .join("\n\n");

    const shortsRevisionDirective = shortsMode
      ? body.shortsSegmentCount && body.shortsSegmentCount > 1
        ? `SHORTS CONTINUITY FORMAT: Keep the revised script structured cleanly as ${body.shortsSegmentCount} consecutive 30-second paragraphs (~75 words each, separated by blank lines) with natural continuity pauses and zero labels.`
        : "SHORTS / REEL FORMAT: Keep the revised script tightly paced as a single 30-second Short / Reel (~75 spoken words)."
      : "";

    try {
      const response = await ai.models.generateContent({
        model: "gemini-4-neon",
        contents: [
          `Revise the narrated script for "${title}" (Season ${seasonNumber}, Episode ${episodeNumber}) according to the user's requested changes below.`,
          `USER REVISION REQUEST:\n${revisionInstructions}`,
          customStoryNotes
            ? `ONGOING STORY DIRECTION NOTES:\n${customStoryNotes}`
            : "",
          `TARGET LENGTH: Approximately ${targetWords} spoken words (${
            targetSeconds < 60
              ? `${targetSeconds} seconds`
              : `${durationMinutes} minutes`
          } at 150 WPM) unless the user requested a different length.`,
          shortsRevisionDirective,
          `CURRENT SCRIPT TO REVISE:\n${currentScript}`,
          "Verify any new scientific, engineering, or historical claims via Google Search. Return ONLY the complete revised TTS-ready spoken narration.",
        ]
          .filter(Boolean)
          .join("\n\n"),
        config: {
          systemInstruction,
          tools: [{ googleSearch: {} }],
        },
      });

      const scriptText = stripCodeFencesForTts(response.text ?? "");
      if (!scriptText) {
        res
          .status(502)
          .json({ error: "Revision returned an empty script. Please retry." });
        return;
      }

      const researchSources = extractResearchSources(response);
      const wordCount = scriptText.split(/\s+/).filter(Boolean).length;

      const existingCharacters = Array.isArray(body.characters)
        ? body.characters
            .filter((c) => typeof c?.name === "string" && c.name.trim().length > 0)
            .map((c) => ({
              name: c.name.trim(),
              role: (c.role || "Survivor").trim(),
              status: (c.status || "Active").trim(),
              introducedIn: (c.introducedIn || "S1E1").trim(),
            }))
        : [];

      const extracted = await extractContinuityAndCast(ai, {
        seriesTitle: title,
        seasonNumber,
        episodeNumber,
        scriptText,
        existingCharacters,
        previousContinuity: null,
      });

      res.json({
        episodeTitle: extracted.episodeTitle,
        scriptText,
        wordCount,
        targetMinutes: targetSeconds < 60 ? 0.5 : durationMinutes,
        targetSeconds,
        researchSources,
        continuityState: extracted.continuityState,
        discoveredCharacters: extracted.discoveredCharacters,
        updatedAt: Date.now(),
      });
    } catch (err) {
      const details = extractErrorDetails(err);
      res.status(details.status).json({ error: details.message });
    }
  });

  // ---------------------------------------------------------------------------
  // Narration Studio — Google Gemini 3.8 TTS Endpoints
  // ---------------------------------------------------------------------------
  const ALLOWED_TTS_MODELS = new Set([
    "gemini-3.8-flash-tts",
    "gemini-3.8-flash-lite-tts",
  ]);

  const ALLOWED_TTS_VOICES = new Set([
    "Achernar",
    "Achird",
    "Algenib",
    "Algieba",
    "Alnilam",
    "Aoede",
    "Arlo",
    "Autonoe",
    "Bodi",
    "Brio",
    "Callirrhoe",
    "Charon",
    "Cleo",
    "Cruz",
    "Daro",
    "Despina",
    "Elio",
    "Enceladus",
    "Enya",
    "Enzo",
    "Erinome",
    "Fenrir",
    "Finn",
    "Fola",
    "Gacrux",
    "Gero",
    "Hali",
    "Iapetus",
    "Jett",
    "Jori",
    "Kira",
    "Knox",
    "Koda",
    "Kore",
    "Laomedeia",
    "Leda",
    "Lora",
    "Ludo",
    "Lumi",
    "Mako",
    "Milo",
    "Neno",
    "Nika",
    "Nyla",
    "Olin",
    "Orus",
    "Puck",
    "Pulcherrima",
    "Rami",
    "Rasalgethi",
    "Riko",
    "Rina",
    "Sadachbia",
    "Sadaltager",
    "Sami",
    "Schedar",
    "Sola",
    "Sulafat",
    "Tari",
    "Tavi",
    "Tova",
    "Umbriel",
    "Varo",
    "Veda",
    "Vindemiatrix",
    "Zali",
    "Zeno",
    "Zephyr",
    "Zubenelgenubi",
    "Zuri",
  ]);

  interface NarrationPreviewRequestBody {
    voiceName?: string;
    sampleText?: string;
    style?: string;
  }

  interface NarrationSynthesizeRequestBody {
    text?: string;
    voiceName?: string;
    model?: string;
    style?: string;
  }

  async function synthesizeTtsAudio(params: {
    ai: GoogleGenAI;
    model: string;
    voiceName: string;
    text: string;
    style?: string;
    maxAttempts?: number;
  }): Promise<{ audioBase64: string; mimeType: string }> {
    const maxAttempts = params.maxAttempts ?? 3;
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const part: {
          text: string;
          speechMetadata?: { style: string };
        } = { text: params.text };

        if (params.style && params.style.trim()) {
          part.speechMetadata = { style: params.style.trim() };
        }

        const response = await params.ai.models.generateContent({
          model: params.model,
          contents: [
            {
              role: "user",
              parts: [part],
            },
          ],
          config: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: params.voiceName,
                },
              },
            },
          },
        });

        const parts = response.candidates?.[0]?.content?.parts ?? [];
        const audioPart = parts.find(
          (p) => typeof p.inlineData?.data === "string" && p.inlineData.data.length > 0
        );

        if (audioPart?.inlineData?.data) {
          return {
            audioBase64: audioPart.inlineData.data,
            mimeType: audioPart.inlineData.mimeType || "audio/wav",
          };
        }

        throw new Error(
          "The TTS model did not return audio data for this segment. Please retry."
        );
      } catch (err) {
        lastError = err;
        const details = extractErrorDetails(err);
        if (!details.retryable || attempt >= maxAttempts) {
          throw err;
        }
        await sleep(900 * attempt);
      }
    }

    throw lastError ?? new Error("Narration synthesis failed.");
  }

  app.post("/api/narration/preview", async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as NarrationPreviewRequestBody;
      const voiceName =
        typeof body.voiceName === "string" && ALLOWED_TTS_VOICES.has(body.voiceName)
          ? body.voiceName
          : "Charon";
      const sampleText = (body.sampleText ?? "").trim().slice(0, 600);
      if (!sampleText) {
        res.status(400).json({ error: "Sample text is required for voice preview." });
        return;
      }
      const style =
        typeof body.style === "string" ? body.style.trim().slice(0, 500) : "";

      const ai = getGenAIClient();
      const result = await synthesizeTtsAudio({
        ai,
        model: "gemini-3.8-flash-lite-tts",
        voiceName,
        text: sampleText,
        style:
          style ||
          "Clear, natural, studio-quality storytelling narration sample.",
        maxAttempts: 2,
      });

      res.json({
        audioBase64: result.audioBase64,
        mimeType: result.mimeType,
        voiceName,
      });
    } catch (err) {
      const details = extractErrorDetails(err);
      res.status(details.status).json({
        error: details.message.replace(/image generation/gi, "narration audio"),
      });
    }
  });

  app.post(
    "/api/narration/synthesize-chunk",
    async (req: Request, res: Response) => {
      try {
        const body = (req.body ?? {}) as NarrationSynthesizeRequestBody;
        const text = (body.text ?? "").trim();
        if (!text) {
          res.status(400).json({ error: "Narration text segment cannot be empty." });
          return;
        }
        if (text.length > 4000) {
          res.status(400).json({
            error:
              "Narration segment exceeds maximum single-chunk length. Split into smaller paragraphs.",
          });
          return;
        }

        const voiceName =
          typeof body.voiceName === "string" &&
          ALLOWED_TTS_VOICES.has(body.voiceName)
            ? body.voiceName
            : "Charon";

        const model =
          typeof body.model === "string" && ALLOWED_TTS_MODELS.has(body.model)
            ? body.model
            : "gemini-3.8-flash-tts";

        const style =
          typeof body.style === "string" ? body.style.trim().slice(0, 800) : "";

        const ai = getGenAIClient();
        const result = await synthesizeTtsAudio({
          ai,
          model,
          voiceName,
          text,
          style,
          maxAttempts: 3,
        });

        res.json({
          audioBase64: result.audioBase64,
          mimeType: result.mimeType,
          voiceName,
          model,
        });
      } catch (err) {
        const details = extractErrorDetails(err);
        res.status(details.status).json({
          error: details.message.replace(/image generation/gi, "narration audio"),
        });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // Scene Breakdown Studio — Module 1 (Beat Breakdown) & Module 2 (Image/Video Prompts)
  // ---------------------------------------------------------------------------
  interface SceneBreakdownBeatsBody {
    scriptText?: string;
    wpm?: number;
    module1Prompt?: string;
  }

  interface SceneBreakdownPromptsBatchBody {
    fullScript?: string;
    characterSheet?: string;
    characterSheetAttachment?: {
      name?: string;
      mimeType?: string;
      data?: string;
    } | null;
    beatsBatch?: Array<{ sceneNumber: number; text: string }>;
    previousScenesContext?: Array<{
      sceneNumber: number;
      narrationCovered: string;
      characterPresent: boolean;
      imagePrompt: string;
    }>;
    module2Prompt?: string;
    maxVideoPrompts?: number;
  }

  function splitScriptIntoSafeBeatChunks(
    scriptText: string,
    maxWordsPerChunk = 450
  ): string[] {
    const paragraphs = scriptText
      .trim()
      .split(/\n\s*\n+/)
      .map((p) => p.trim())
      .filter(Boolean);

    const chunks: string[] = [];
    let currentParts: string[] = [];
    let currentWords = 0;

    const flush = () => {
      if (currentParts.length > 0) {
        chunks.push(currentParts.join("\n\n"));
        currentParts = [];
        currentWords = 0;
      }
    };

    for (const para of paragraphs) {
      const paraWords = para.split(/\s+/).filter(Boolean).length;
      if (paraWords > maxWordsPerChunk) {
        flush();
        // Split oversized single paragraph at sentence boundaries
        const sentences = para.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) ?? [para];
        let sParts: string[] = [];
        let sWords = 0;
        for (const rawS of sentences) {
          const s = rawS.trim();
          if (!s) continue;
          const w = s.split(/\s+/).filter(Boolean).length;
          if (sWords > 0 && sWords + w > maxWordsPerChunk) {
            chunks.push(sParts.join(" "));
            sParts = [s];
            sWords = w;
          } else {
            sParts.push(s);
            sWords += w;
          }
        }
        if (sParts.length > 0) {
          chunks.push(sParts.join(" "));
        }
        continue;
      }

      if (currentWords > 0 && currentWords + paraWords > maxWordsPerChunk) {
        flush();
      }
      currentParts.push(para);
      currentWords += paraWords;
    }

    flush();
    return chunks;
  }

  function verifyChunkVerbatimTokens(
    sourceChunk: string,
    lines: string[]
  ): { exact: boolean; detail: string } {
    const expected = sourceChunk.trim().split(/\s+/).filter(Boolean);
    const actual = lines.flatMap((line) =>
      line.trim().split(/\s+/).filter(Boolean)
    );
    if (expected.length !== actual.length) {
      return {
        exact: false,
        detail: `Expected ${expected.length} words but got ${actual.length} words.`,
      };
    }
    for (let i = 0; i < expected.length; i++) {
      if (expected[i] !== actual[i]) {
        return {
          exact: false,
          detail: `Mismatch at word #${i + 1}: expected "${expected[i]}" but got "${actual[i]}".`,
        };
      }
    }
    return { exact: true, detail: "exact" };
  }

  async function breakChunkIntoBeats(params: {
    ai: GoogleGenAI;
    chunkText: string;
    wpm: number;
    module1Prompt: string;
    chunkIndex: number;
    totalChunks: number;
  }): Promise<string[]> {
    let feedback = "";

    for (let attempt = 1; attempt <= 2; attempt++) {
      const userPrompt = [
        `<WPM>${params.wpm}</WPM>`,
        params.totalChunks > 1
          ? `NOTE: This is section ${params.chunkIndex + 1} of ${params.totalChunks} of the full script. Break ONLY the exact text inside <NEW_SCRIPT> below.`
          : "",
        `<NEW_SCRIPT>\n${params.chunkText}\n</NEW_SCRIPT>`,
        feedback
          ? `CORRECTION REQUIRED FROM PREVIOUS CHECK: ${feedback} Preserve EVERY single word, punctuation mark, capitalization, and order 100% verbatim—ONLY insert line breaks at word boundaries.`
          : "",
        "Return JSON with a single property `lines` (an array of beat line strings, without numbering prefixes).",
      ]
        .filter(Boolean)
        .join("\n\n");

      const response = await params.ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: userPrompt,
        config: {
          systemInstruction: params.module1Prompt,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              lines: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: ["lines"],
          },
        },
      });

      const raw = (response.text ?? "{}").trim();
      const parsed = JSON.parse(raw) as { lines?: unknown };
      const cleanLines = Array.isArray(parsed.lines)
        ? parsed.lines
            .filter((item): item is string => typeof item === "string")
            .map((line) =>
              line
                .replace(/^\s*\d+\.\s+/, "")
                .replace(/\s+/g, " ")
                .trim()
            )
            .filter(Boolean)
        : [];

      if (cleanLines.length === 0) {
        feedback = "Previous attempt returned zero beat lines.";
        continue;
      }

      const check = verifyChunkVerbatimTokens(params.chunkText, cleanLines);
      if (check.exact || attempt === 2) {
        return cleanLines;
      }
      feedback = check.detail;
    }

    // Fallback: sentence/clause split preserving exact words
    return params.chunkText
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  app.post("/api/scene-breakdown/beats", async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as SceneBreakdownBeatsBody;
      const scriptText = (body.scriptText ?? "").trim();
      if (!scriptText) {
        res
          .status(400)
          .json({ error: "Please provide a script before running Scene Breakdown." });
        return;
      }

      const wpm =
        typeof body.wpm === "number" && Number.isFinite(body.wpm)
          ? Math.max(80, Math.min(240, Math.round(body.wpm)))
          : 150;

      const module1Prompt =
        typeof body.module1Prompt === "string" && body.module1Prompt.trim()
          ? body.module1Prompt.trim()
          : "You are a verbatim Script Line-Breaking Engine. Break the script into short visual beat lines (~5 words each) without editing, adding, or removing any word or punctuation mark.";

      const ai = getGenAIClient();
      const chunks = splitScriptIntoSafeBeatChunks(scriptText, 450);
      const allLines: string[] = [];

      for (let i = 0; i < chunks.length; i++) {
        let lastErr: unknown = null;
        let chunkLines: string[] | null = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            chunkLines = await breakChunkIntoBeats({
              ai,
              chunkText: chunks[i],
              wpm,
              module1Prompt,
              chunkIndex: i,
              totalChunks: chunks.length,
            });
            break;
          } catch (err) {
            lastErr = err;
            const details = extractErrorDetails(err);
            if (!details.retryable || attempt >= 3) throw err;
            await sleep(900 * attempt);
          }
        }
        if (chunkLines) {
          allLines.push(...chunkLines);
        } else if (lastErr) {
          throw lastErr;
        }
      }

      const beats = allLines.map((text, idx) => ({
        sceneNumber: idx + 1,
        text,
      }));

      res.json({
        beats,
        totalChunksProcessed: chunks.length,
        wpm,
      });
    } catch (err) {
      const details = extractErrorDetails(err);
      res.status(details.status).json({
        error: details.message.replace(/image generation/gi, "scene breakdown"),
      });
    }
  });

  app.post(
    "/api/scene-breakdown/prompts-batch",
    async (req: Request, res: Response) => {
      try {
        const body = (req.body ?? {}) as SceneBreakdownPromptsBatchBody;
        const beatsBatch = Array.isArray(body.beatsBatch)
          ? body.beatsBatch
              .filter(
                (b) =>
                  typeof b?.sceneNumber === "number" &&
                  typeof b?.text === "string" &&
                  b.text.trim().length > 0
              )
              .slice(0, 25)
          : [];

        if (beatsBatch.length === 0) {
          res
            .status(400)
            .json({ error: "A non-empty batch of numbered beat lines is required." });
          return;
        }

        const fullScript =
          typeof body.fullScript === "string"
            ? body.fullScript.trim().slice(0, 18000)
            : "";

        const ALLOWED_CHARACTER_SHEET_MIMES = new Set([
          "image/png",
          "image/jpeg",
          "image/webp",
          "image/gif",
          "application/pdf",
        ]);

        let validatedAttachment: {
          name: string;
          mimeType: string;
          data: string;
        } | null = null;

        if (body.characterSheetAttachment && typeof body.characterSheetAttachment === "object") {
          const rawMime = String(body.characterSheetAttachment.mimeType ?? "")
            .trim()
            .toLowerCase();
          const rawData = String(body.characterSheetAttachment.data ?? "")
            .replace(/^data:[^;]+;base64,/i, "")
            .trim();
          const safeName = String(body.characterSheetAttachment.name ?? "character-sheet")
            .replace(/[\r\n<>]/g, "")
            .slice(0, 140);

          if (rawMime && rawData) {
            if (!ALLOWED_CHARACTER_SHEET_MIMES.has(rawMime)) {
              res.status(400).json({
                error:
                  "Unsupported Character Sheet file type. Please attach a PNG, JPG, WEBP, GIF, PDF, or text file.",
              });
              return;
            }
            // Cap base64 payload (~15 MB binary)
            if (rawData.length > 20 * 1024 * 1024) {
              res.status(400).json({
                error: "Character Sheet attachment is too large (max 15 MB).",
              });
              return;
            }
            validatedAttachment = {
              name: safeName || "character-sheet",
              mimeType: rawMime,
              data: rawData,
            };
          }
        }

        const rawCharacterNotes =
          typeof body.characterSheet === "string"
            ? body.characterSheet.trim().slice(0, 4000)
            : "";

        const characterSheetSection = validatedAttachment
          ? [
              `ATTACHED CHARACTER SHEET FILE ("${validatedAttachment.name}", ${validatedAttachment.mimeType}): Use the attached Character Sheet file as the permanent Reference Character Source for character-present scenes ONLY. Faithfully preserve the character's identity, head/face design, colors, clothing, and accessories shown or described in the attached file while keeping the immutable stick-body anatomy lock.`,
              rawCharacterNotes
                ? `ADDITIONAL CHARACTER NOTES:\n${rawCharacterNotes}`
                : "",
            ]
              .filter(Boolean)
              .join("\n\n")
          : `SUPPLIED CHARACTER SHEET (Permanent Reference Character Source for character-present scenes ONLY):\n${
              rawCharacterNotes ||
              "Standard minimalist educational stickman character: very large rounded cartoon head, expressive eyes and mouth, small primitive torso, thin black stick arms, thin black stick legs, rounded black mitten hands, tiny rounded black feet, thick smooth black outlines, flat colors."
            }`;

        const module2Prompt =
          typeof body.module2Prompt === "string" && body.module2Prompt.trim()
            ? body.module2Prompt.trim()
            : "You are an AI Storyboard Director, Image Prompt Engineer, and Video Prompt Engineer. Create one detailed scene-specific Image Prompt per narration beat line and optional Video Prompts (maximum 2 per 20 scenes) only when motion is genuinely required.";

        const maxVideoPrompts =
          typeof body.maxVideoPrompts === "number" &&
          Number.isFinite(body.maxVideoPrompts)
            ? Math.max(0, Math.min(2, Math.round(body.maxVideoPrompts)))
            : 2;

        const prevContextLines = Array.isArray(body.previousScenesContext)
          ? body.previousScenesContext
              .slice(-3)
              .map(
                (p) =>
                  `Scene ${p.sceneNumber} (${p.characterPresent ? "Character Present" : "Character Absent"}) | Narration: "${p.narrationCovered}" | Previous Visual Summary: ${p.imagePrompt.slice(0, 220)}`
              )
              .join("\n")
          : "";

        const numberedBeatsList = beatsBatch
          .map((b) => `${b.sceneNumber}. ${b.text.trim()}`)
          .join("\n");

        const userPrompt = [
          fullScript
            ? `FULL STORY CONTEXT (for narrative/world understanding only — each scene's image MUST still match its OWN specific narration line one-to-one):\n${fullScript}`
            : "",
          characterSheetSection,
          prevContextLines
            ? `IMMEDIATELY PRECEDING SCENES (for continuity & ANTI-REPETITION CHECK — do NOT copy-paste previous pose, camera angle, framing, or background):\n${prevContextLines}`
            : "",
          `APPROVED BEAT LINES TO GENERATE NOW (${beatsBatch.length} scenes — generate EXACTLY one item per scene number below, no skipping, merging, or splitting):\n${numberedBeatsList}`,
          `STRICT BATCH OUTPUT CONSTRAINTS:
- Output JSON with key "scenes" containing EXACTLY ${beatsBatch.length} objects matching scene numbers ${beatsBatch[0].sceneNumber} through ${beatsBatch[beatsBatch.length - 1].sceneNumber}.
- For each scene:
  - "sceneNumber": exact integer scene number from the approved list above.
  - "narrationCovered": the EXACT verbatim beat line text.
  - "characterPresent": boolean — decide independently per scene (true ONLY if the narration logically requires the character; false for environment/object/event/symbolic/atmospheric scenes). When false, explicitly state inside imagePrompt that no human characters / no main character appear.
  - "imagePrompt": highly detailed, concrete, self-contained image prompt adhering to the immutable 2D flat-cartoon style, stick-body anatomy lock (when characterPresent is true), and exact 1-to-1 narration visual matching.
  - "videoPrompt": detailed animation prompt ONLY for scenes that genuinely require motion (maximum ${maxVideoPrompts} non-empty videoPrompt entries across this entire ${beatsBatch.length}-scene batch; minimum 0). For all other scenes, set "videoPrompt" to an empty string "".`,
        ]
          .filter(Boolean)
          .join("\n\n");

        const requestContents = validatedAttachment
          ? {
              parts: [
                {
                  inlineData: {
                    mimeType: validatedAttachment.mimeType,
                    data: validatedAttachment.data,
                  },
                },
                { text: userPrompt },
              ],
            }
          : userPrompt;

        const ai = getGenAIClient();
        let lastError: unknown = null;
        let parsedScenes: Array<{
          sceneNumber?: number;
          narrationCovered?: string;
          characterPresent?: boolean;
          imagePrompt?: string;
          videoPrompt?: string;
        }> = [];

        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const response = await ai.models.generateContent({
              model: "gemini-4-hydrogen",
              contents: requestContents,
              config: {
                systemInstruction: module2Prompt,
                thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
                responseMimeType: "application/json",
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    scenes: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          sceneNumber: { type: Type.INTEGER },
                          narrationCovered: { type: Type.STRING },
                          characterPresent: { type: Type.BOOLEAN },
                          imagePrompt: { type: Type.STRING },
                          videoPrompt: { type: Type.STRING },
                        },
                        required: [
                          "sceneNumber",
                          "narrationCovered",
                          "characterPresent",
                          "imagePrompt",
                          "videoPrompt",
                        ],
                      },
                    },
                  },
                  required: ["scenes"],
                },
              },
            });

            const raw = (response.text ?? "{}").trim();
            const parsed = JSON.parse(raw) as {
              scenes?: typeof parsedScenes;
            };
            if (Array.isArray(parsed.scenes) && parsed.scenes.length > 0) {
              parsedScenes = parsed.scenes;
              break;
            }
            throw new Error("Model returned an empty scenes prompt batch.");
          } catch (err) {
            lastError = err;
            const details = extractErrorDetails(err);
            if (!details.retryable || attempt >= 3) throw err;
            await sleep(950 * attempt);
          }
        }

        if (parsedScenes.length === 0 && lastError) {
          throw lastError;
        }

        const byNumber = new Map<
          number,
          (typeof parsedScenes)[number]
        >();
        parsedScenes.forEach((item, idx) => {
          const key =
            typeof item.sceneNumber === "number"
              ? item.sceneNumber
              : beatsBatch[idx]?.sceneNumber;
          if (typeof key === "number" && !byNumber.has(key)) {
            byNumber.set(key, item);
          }
        });

        let videoCount = 0;
        const normalizedScenes = beatsBatch.map((beat, idx) => {
          const matched = byNumber.get(beat.sceneNumber) ?? parsedScenes[idx];
          const rawImagePrompt = (matched?.imagePrompt ?? "").trim();
          let rawVideoPrompt = (matched?.videoPrompt ?? "").trim();

          // Normalize placeholder "not available" strings from model to empty string
          if (
            /^(none|n\/a|not available|no video prompt|null|-)$/i.test(
              rawVideoPrompt
            )
          ) {
            rawVideoPrompt = "";
          }

          // Strictly enforce Module 2 rule: max 2 video prompts per 20-scene batch
          if (rawVideoPrompt) {
            if (videoCount < maxVideoPrompts) {
              videoCount += 1;
            } else {
              rawVideoPrompt = "";
            }
          }

          return {
            sceneNumber: beat.sceneNumber,
            narrationCovered: beat.text.trim(),
            characterPresent: Boolean(matched?.characterPresent),
            imagePrompt: rawImagePrompt,
            videoPrompt: rawVideoPrompt,
          };
        });

        res.json({
          scenes: normalizedScenes,
          videoPromptCount: videoCount,
        });
      } catch (err) {
        const details = extractErrorDetails(err);
        res.status(details.status).json({
          error: details.message.replace(
            /image generation/gi,
            "scene prompt generation"
          ),
        });
      }
    }
  );

  const isProd = process.env.NODE_ENV === "production";
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("/{*splat}", (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, "0.0.0.0", () => {
    console.log(`FrameForge studio server running on http://0.0.0.0:${port}`);
  });
}

createApp().catch((err) => {
  console.error("Failed to start FrameForge server:", err);
  process.exit(1);
});
