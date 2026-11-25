import { NARRATION_PUNCTUATION_OPTIONS } from "../data/narrationVoices";
import type {
  NarrationPunctuationMode,
  NarrationSegment,
} from "../types/narration";

const MAX_WORDS_PER_TTS_CHUNK = 175;
const DEFAULT_SAMPLE_RATE = 24000;
const DEFAULT_CHANNELS = 1;
const DEFAULT_BITS_PER_SAMPLE = 16;

const SPAN_STYLE_MAP: Record<
  string,
  { label: string; styleOverride: string }
> = {
  whisper: {
    label: "Whisper",
    styleOverride:
      "hushed, quiet, intimate close-mic whisper with soft breathy suspense",
  },
  loud: {
    label: "Loud",
    styleOverride:
      "loud, forceful, projected voice with intense urgency and high vocal volume",
  },
  bold: {
    label: "Bold",
    styleOverride:
      "bold, commanding, heavily emphasized delivery with authoritative punch",
  },
  slow: {
    label: "Slow",
    styleOverride:
      "very slow, weighty, deliberate cadence letting every word land heavily",
  },
  urgent: {
    label: "Urgent",
    styleOverride:
      "urgent, rapid, tense and breathless delivery conveying immediate crisis",
  },
};

function splitLongTextIntoChunks(text: string, maxWords: number): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return [trimmed];

  // Split along sentence endings cleanly
  const sentences = trimmed.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) ?? [
    trimmed,
  ];
  const chunks: string[] = [];
  let current = "";
  let currentWordCount = 0;

  for (const rawSentence of sentences) {
    const sentence = rawSentence.trim();
    if (!sentence) continue;
    const sentenceWords = sentence.split(/\s+/).filter(Boolean).length;

    if (current && currentWordCount + sentenceWords > maxWords) {
      chunks.push(current.trim());
      current = sentence;
      currentWordCount = sentenceWords;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
      currentWordCount += sentenceWords;
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks;
}

/**
 * Parses a script (including inline Flow-style emotion spans like [whisper]...[/whisper],
 * [loud]...[/loud], [bold]...[/bold], [slow]...[/slow], [urgent]...[/urgent] and explicit
 * [pause 1s] markers) into ordered TTS synthesis segments and exact silence segments.
 */
export function parseScriptIntoNarrationSegments(
  scriptText: string,
  punctuationMode: NarrationPunctuationMode
): NarrationSegment[] {
  const trimmed = scriptText.trim();
  if (!trimmed) return [];

  const paragraphPauseSeconds =
    NARRATION_PUNCTUATION_OPTIONS.find((p) => p.id === punctuationMode)
      ?.paragraphPauseSeconds ?? 0.45;

  const paragraphs = trimmed
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const segments: NarrationSegment[] = [];
  let segCounter = 0;

  const pushSpeechChunks = (
    text: string,
    styleOverride?: string,
    cueLabel?: string
  ) => {
    const chunks = splitLongTextIntoChunks(text, MAX_WORDS_PER_TTS_CHUNK);
    for (const chunk of chunks) {
      if (!chunk.trim()) continue;
      segments.push({
        id: `nseg-${segCounter}-${crypto.randomUUID().slice(0, 8)}`,
        index: segCounter,
        type: "speech",
        text: chunk.trim(),
        styleOverride,
        cueLabel,
        status: "idle",
      });
      segCounter += 1;
    }
  };

  const pushPause = (seconds: number, cueLabel?: string) => {
    const clamped = Math.max(0.1, Math.min(5, seconds));
    segments.push({
      id: `nseg-${segCounter}-${crypto.randomUUID().slice(0, 8)}`,
      index: segCounter,
      type: "pause",
      text: "",
      pauseSeconds: clamped,
      cueLabel: cueLabel || `Pause ${clamped}s`,
      status: "completed",
      durationSeconds: clamped,
    });
    segCounter += 1;
  };

  // Match either [pause 1.5s] or [whisper]...[/whisper] (case-insensitive)
  const tokenRegex =
    /\[pause\s+([0-9]+(?:\.[0-9]+)?)\s*s?\]|\[(whisper|loud|bold|slow|urgent)\]([\s\S]*?)\[\/\2\]/gi;

  paragraphs.forEach((paragraph, pIdx) => {
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    tokenRegex.lastIndex = 0;

    while ((match = tokenRegex.exec(paragraph)) !== null) {
      const before = paragraph.slice(lastIndex, match.index).trim();
      if (before) {
        pushSpeechChunks(before);
      }

      if (match[1]) {
        const secs = parseFloat(match[1]);
        if (Number.isFinite(secs) && secs > 0) {
          pushPause(secs, `Pause ${secs}s`);
        }
      } else if (match[2] && match[3]) {
        const tag = match[2].toLowerCase();
        const inner = match[3].trim();
        const meta = SPAN_STYLE_MAP[tag];
        if (inner && meta) {
          pushSpeechChunks(inner, meta.styleOverride, meta.label);
        }
      }

      lastIndex = tokenRegex.lastIndex;
    }

    const tail = paragraph.slice(lastIndex).trim();
    if (tail) {
      pushSpeechChunks(tail);
    }

    // Add natural inter-paragraph breathing silence between paragraphs
    if (pIdx < paragraphs.length - 1 && paragraphPauseSeconds > 0) {
      pushPause(paragraphPauseSeconds, "Paragraph beat");
    }
  });

  return segments;
}

export function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

interface ParsedWav {
  sampleRate: number;
  numChannels: number;
  bitsPerSample: number;
  pcmData: Uint8Array;
  durationSeconds: number;
}

/**
 * Robust RIFF/WAVE parser that extracts exact fmt parameters and raw PCM data bytes.
 */
export function parseWavBytes(bytes: Uint8Array): ParsedWav {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // Check RIFF header
  if (
    bytes.byteLength < 44 ||
    bytes[0] !== 0x52 ||
    bytes[1] !== 0x49 ||
    bytes[2] !== 0x46 ||
    bytes[3] !== 0x46
  ) {
    // Treat as raw 24kHz mono 16-bit PCM fallback
    const duration =
      bytes.byteLength /
      (DEFAULT_SAMPLE_RATE * DEFAULT_CHANNELS * (DEFAULT_BITS_PER_SAMPLE / 8));
    return {
      sampleRate: DEFAULT_SAMPLE_RATE,
      numChannels: DEFAULT_CHANNELS,
      bitsPerSample: DEFAULT_BITS_PER_SAMPLE,
      pcmData: bytes,
      durationSeconds: duration,
    };
  }

  let sampleRate = DEFAULT_SAMPLE_RATE;
  let numChannels = DEFAULT_CHANNELS;
  let bitsPerSample = DEFAULT_BITS_PER_SAMPLE;
  let dataStart = 44;
  let dataLength = bytes.byteLength - 44;

  let offset = 12;
  while (offset + 8 <= bytes.byteLength) {
    const chunkId = String.fromCharCode(
      bytes[offset],
      bytes[offset + 1],
      bytes[offset + 2],
      bytes[offset + 3]
    );
    const chunkSize = view.getUint32(offset + 4, true);

    if (chunkId === "fmt " && offset + 24 <= bytes.byteLength) {
      numChannels = view.getUint16(offset + 10, true) || DEFAULT_CHANNELS;
      sampleRate = view.getUint32(offset + 12, true) || DEFAULT_SAMPLE_RATE;
      bitsPerSample =
        view.getUint16(offset + 22, true) || DEFAULT_BITS_PER_SAMPLE;
    } else if (chunkId === "data") {
      dataStart = offset + 8;
      dataLength = Math.min(chunkSize, bytes.byteLength - dataStart);
      break;
    }

    offset += 8 + chunkSize + (chunkSize % 2);
  }

  const pcmData = bytes.slice(dataStart, dataStart + dataLength);
  const bytesPerSecond = sampleRate * numChannels * (bitsPerSample / 8);
  const durationSeconds =
    bytesPerSecond > 0 ? pcmData.byteLength / bytesPerSecond : 0;

  return {
    sampleRate,
    numChannels,
    bitsPerSample,
    pcmData,
    durationSeconds,
  };
}

export function createSilencePcmBytes(
  seconds: number,
  sampleRate = DEFAULT_SAMPLE_RATE,
  numChannels = DEFAULT_CHANNELS,
  bitsPerSample = DEFAULT_BITS_PER_SAMPLE
): Uint8Array {
  const bytesPerSample = bitsPerSample / 8;
  const frameCount = Math.max(0, Math.round(seconds * sampleRate));
  return new Uint8Array(frameCount * numChannels * bytesPerSample);
}

/**
 * Combines all completed speech WAV chunks and pause silence segments into one
 * seamless standards-compliant RIFF/WAVE Blob.
 */
export function stitchNarrationSegmentsToWav(
  segments: NarrationSegment[]
): { blob: Blob; durationSeconds: number } | null {
  const pcmParts: Uint8Array[] = [];
  let sampleRate = DEFAULT_SAMPLE_RATE;
  let numChannels = DEFAULT_CHANNELS;
  let bitsPerSample = DEFAULT_BITS_PER_SAMPLE;
  let hasAnySpeech = false;

  for (const seg of segments) {
    if (seg.type === "speech" && seg.wavBase64) {
      const parsed = parseWavBytes(base64ToUint8Array(seg.wavBase64));
      if (!hasAnySpeech) {
        sampleRate = parsed.sampleRate;
        numChannels = parsed.numChannels;
        bitsPerSample = parsed.bitsPerSample;
        hasAnySpeech = true;
      }
      pcmParts.push(parsed.pcmData);
    } else if (seg.type === "pause" && seg.pauseSeconds && hasAnySpeech) {
      pcmParts.push(
        createSilencePcmBytes(
          seg.pauseSeconds,
          sampleRate,
          numChannels,
          bitsPerSample
        )
      );
    }
  }

  if (!hasAnySpeech || pcmParts.length === 0) return null;

  const totalPcmBytes = pcmParts.reduce((sum, p) => sum + p.byteLength, 0);
  const wavBuffer = new ArrayBuffer(44 + totalPcmBytes);
  const view = new DataView(wavBuffer);
  const outBytes = new Uint8Array(wavBuffer);

  const writeAscii = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + totalPcmBytes, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true); // PCM fmt chunk size
  view.setUint16(20, 1, true); // AudioFormat 1 = PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeAscii(36, "data");
  view.setUint32(40, totalPcmBytes, true);

  let writeOffset = 44;
  for (const part of pcmParts) {
    outBytes.set(part, writeOffset);
    writeOffset += part.byteLength;
  }

  const durationSeconds = byteRate > 0 ? totalPcmBytes / byteRate : 0;
  return {
    blob: new Blob([wavBuffer], { type: "audio/wav" }),
    durationSeconds,
  };
}

export function formatAudioDuration(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
