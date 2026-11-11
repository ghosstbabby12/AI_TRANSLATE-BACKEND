import type { Segment } from "../segment.js";
import type { Cue } from "./cues.js";

/** "00:01:02,345" (SRT) or "00:01:02.345" (VTT). */
function clockTime(seconds: number, separator: "," | "."): string {
  const ms = Math.round(seconds * 1000);
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)}${separator}${pad(ms % 1000, 3)}`;
}

/** Short timestamp for people: "mm:ss" or "h:mm:ss". */
export function formatTimestamp(seconds: number): string {
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const mm = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function toSrt(cues: Cue[]): string {
  return cues.map((c, i) => `${i + 1}\n${clockTime(c.start, ",")} --> ${clockTime(c.end, ",")}\n${c.text}\n`).join("\n");
}

/** WebVTT is the format the browser's <track> element understands. */
export function toVtt(cues: Cue[]): string {
  const body = cues.map((c) => `${clockTime(c.start, ".")} --> ${clockTime(c.end, ".")}\n${c.text}\n`).join("\n");
  return `WEBVTT\n\n${body}`;
}

export interface DocumentHeader {
  title: string;
  languages: string;
}

/** Readable transcript: one paragraph per segment with its timestamp. */
export function transcriptToText(segments: Segment[], header: DocumentHeader): string {
  const paragraphs = segments
    .filter((s) => s.translatedText?.trim())
    .map((s) => `[${formatTimestamp(s.startSeconds)}] ${s.translatedText!.trim()}`);
  return `${header.title}\n${header.languages}\n\n${paragraphs.join("\n\n")}\n`;
}

/** The stored summary uses "## Heading"; in plain text the headings are underlined. */
export function summaryToText(summary: string, header: DocumentHeader): string {
  const body = summary
    .trim()
    .split("\n")
    .map((line) => {
      const heading = /^#{1,6}\s+(.+)$/.exec(line.trim())?.[1];
      return heading ? `${heading.toUpperCase()}\n${"─".repeat(Math.min(heading.length, 60))}` : line;
    })
    .join("\n");
  return `${header.title}\n${header.languages}\n\n${body}\n`;
}
