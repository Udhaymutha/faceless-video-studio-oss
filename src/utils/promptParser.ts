import JSZip from "jszip";
import type { SceneItem } from "../types/studio";

export interface ParsedSceneDraft {
  prompt: string;
  narration?: string;
  useReferenceCharacter: boolean;
  detectedNumber?: number;
}

export interface ExportableImageEntry {
  sceneNumber: number;
  imageDataUrl: string;
  mimeType?: string;
}

export function parseBulkPrompts(rawText: string): ParsedSceneDraft[] {
  const normalized = rawText.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return [];
  }

  const hasStructuredScenes =
    /(?:^|\n)\s*SCENE\s+\d+/i.test(normalized) &&
    /(?:^|\n)\s*IMAGE\s+PROMPT\b/i.test(normalized);

  if (hasStructuredScenes) {
    const blocks = normalized
      .split(/(?=(?:^|\n)\s*SCENE\s+\d+\b)/i)
      .map((b) => b.trim())
      .filter((b) => /^SCENE\s+\d+/i.test(b));

    const parsed: ParsedSceneDraft[] = [];

    for (const block of blocks) {
      const numberMatch = block.match(/^SCENE\s+(\d+)/i);
      const detectedNumber = numberMatch ? Number(numberMatch[1]) : undefined;

      const narrationMatch = block.match(
        /Narration\s+Covered\s*:?\s*\n?([\s\S]*?)(?=\n\s*IMAGE\s+PROMPT\b)/i
      );
      const narration = narrationMatch
        ? narrationMatch[1].replace(/^[━─—\-_=]{3,}$/gm, "").trim()
        : undefined;

      const imagePromptMatch = block.match(
        /IMAGE\s+PROMPT\s*:?\s*\n?([\s\S]*?)(?=\n\s*(?:VIDEO\s+PROMPT\b|[━─—_=]{5,}|Would you like the next)|$)/i
      );
      const prompt = imagePromptMatch
        ? imagePromptMatch[1].replace(/^[━─—\-_=]{3,}$/gm, "").trim()
        : "";

      if (prompt) {
        parsed.push({
          prompt,
          narration: narration || undefined,
          useReferenceCharacter: true,
          detectedNumber,
        });
      }
    }

    if (parsed.length > 0) {
      return parsed;
    }
  }

  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !/^[━─—\-_=]{3,}$/.test(line));

  return lines
    .map((line) => {
      const cleaned = line
        .replace(
          /^(?:scene\s*\d+\s*[:.\-–—]\s*|\d+\s*[.):\-–—]\s*|[-•*]\s+)/i,
          ""
        )
        .trim();
      return {
        prompt: cleaned,
        useReferenceCharacter: true,
      };
    })
    .filter((item) => item.prompt.length > 0);
}

export function getSceneFileExtension(mimeType?: string): string {
  if (!mimeType) return "png";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  if (mimeType.includes("webp")) return "webp";
  return "png";
}

export function getSceneFilename(
  sceneNumber: number,
  mimeType?: string
): string {
  const ext = getSceneFileExtension(mimeType);
  return `${sceneNumber}.${ext}`;
}

export function compilePreviewPrompt(params: {
  sceneNumber: number;
  prompt: string;
  instructions: string;
  negativeRules: string;
  characterProfile?: string;
  characterNotes?: string;
  hasReferenceImage: boolean;
}): string {
  const parts: string[] = [];

  if (params.instructions.trim()) {
    parts.push(`DIRECTOR'S BRIEF & WORKFLOW RULES:\n${params.instructions.trim()}`);
  }

  if (params.hasReferenceImage) {
    const lines = [
      "COMMON MASTER STICKMAN CHARACTER REFERENCE DIRECTORY (AUTO-LINKED):",
      "[Auto-loaded directly from Master Stickman Character Reference Directory] Always draw the character's exact visual identity, stickman proportions, line weight, face, hair, outfit, accessories, and overall art style from this common reference directory.",
    ];
    if (params.characterProfile?.trim()) {
      lines.push(`\nLOCKED DIRECTORY PROFILE:\n${params.characterProfile.trim()}`);
    }
    if (params.characterNotes?.trim()) {
      lines.push(`\nDIRECTORY CHARACTER NOTES:\n${params.characterNotes.trim()}`);
    }
    parts.push(lines.join("\n"));
  }

  if (params.negativeRules.trim()) {
    parts.push(
      `STRICT VISUAL CONSTRAINTS (DO NOT INCLUDE):\n${params.negativeRules.trim()}`
    );
  }

  parts.push(
    `SCENE ${params.sceneNumber} IMAGE PROMPT:\n${params.prompt.trim() || "(Enter a scene prompt to preview...)"}`
  );

  return parts.join("\n\n");
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(",");
  const mimeMatch = header.match(/data:(.*?);base64/);
  const mime = mimeMatch ? mimeMatch[1] : "image/png";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

export function triggerBrowserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadSingleScene(
  scene: SceneItem,
  sceneNumber: number
): string {
  if (!scene.imageDataUrl) {
    throw new Error(`Scene ${sceneNumber} does not have a generated image yet.`);
  }
  const filename = getSceneFilename(sceneNumber, scene.mimeType);
  const blob = dataUrlToBlob(scene.imageDataUrl);
  triggerBrowserDownload(blob, filename);
  return filename;
}

export async function downloadEntriesAsZip(
  entries: ExportableImageEntry[],
  customFilename?: string
): Promise<{ filename: string; count: number }> {
  const sorted = [...entries]
    .filter((e) => Boolean(e.imageDataUrl))
    .sort((a, b) => a.sceneNumber - b.sceneNumber);

  if (sorted.length === 0) {
    throw new Error("No generated images are available to package yet.");
  }

  const zip = new JSZip();
  for (const entry of sorted) {
    const filename = getSceneFilename(entry.sceneNumber, entry.mimeType);
    const base64Data = entry.imageDataUrl.split(",")[1];
    zip.file(filename, base64Data, { base64: true });
  }

  const firstNum = sorted[0].sceneNumber;
  const lastNum = sorted[sorted.length - 1].sceneNumber;
  const zipFilename =
    customFilename ||
    (firstNum === lastNum
      ? `FrameForge-${firstNum}.zip`
      : `FrameForge-${firstNum}-${lastNum}.zip`);

  const blob = await zip.generateAsync({ type: "blob" });
  triggerBrowserDownload(blob, zipFilename);

  return { filename: zipFilename, count: sorted.length };
}
