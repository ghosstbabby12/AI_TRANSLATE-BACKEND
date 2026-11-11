import type { Segment } from "../segment.js";

/** One subtitle line on screen. */
export interface Cue {
  start: number;
  end: number;
  text: string;
}

// About two lines of 42 characters, the usual subtitle standard
const MAX_CUE_CHARS = 84;

/**
 * A 20-second segment holds too much text for one subtitle. The translated
 * text is split into short pieces and the segment's time is shared between
 * them in proportion to their length.
 */
export function buildCues(segments: Segment[]): Cue[] {
  const cues: Cue[] = [];
  for (const segment of segments) {
    const text = segment.translatedText?.trim();
    if (!text) continue;
    const pieces = splitCueText(text, MAX_CUE_CHARS);
    const totalChars = pieces.reduce((sum, piece) => sum + piece.length, 0);
    const duration = segment.endSeconds - segment.startSeconds;
    let time = segment.startSeconds;
    for (const piece of pieces) {
      const length = (duration * piece.length) / totalChars;
      cues.push({ start: time, end: time + length, text: piece });
      time += length;
    }
  }
  return cues;
}

/** Groups whole sentences up to `max` characters; long sentences are split by words. */
function splitCueText(text: string, max: number): string[] {
  const sentences = text.match(/[^.!?。！？]+[.!?。！？]*\s*/g) ?? [text];
  const pieces: string[] = [];
  let current = "";
  const join = (a: string, b: string) => `${a} ${b}`.trim();

  for (const sentence of sentences.map((s) => s.trim()).filter(Boolean)) {
    if (join(current, sentence).length <= max) {
      current = join(current, sentence);
      continue;
    }
    if (current) pieces.push(current);
    current = "";
    if (sentence.length <= max) {
      current = sentence;
      continue;
    }
    for (const word of sentence.split(/\s+/)) {
      if (current && join(current, word).length > max) {
        pieces.push(current);
        current = word;
      } else {
        current = join(current, word);
      }
    }
  }
  if (current) pieces.push(current);
  return pieces;
}
