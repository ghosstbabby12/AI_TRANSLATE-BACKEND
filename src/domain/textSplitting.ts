/**
 * Splits text into sentences of at most `maxLength` characters: first at
 * sentence punctuation, then at a comma, then at a space, and as a last
 * resort (languages without spaces, like Chinese) wherever the limit falls.
 */
export function splitIntoPhrases(text: string, maxLength: number): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const phrases: string[] = [];
  for (const sentence of clean.split(/(?<=[.!?…。！？;；])\s*/)) {
    let rest = sentence.trim();
    while (rest.length > maxLength) {
      const cut = findCut(rest.slice(0, maxLength), maxLength);
      phrases.push(rest.slice(0, cut + 1).trim());
      rest = rest.slice(cut + 1).trim();
    }
    if (rest) phrases.push(rest);
  }
  return phrases;
}

function findCut(window: string, maxLength: number): number {
  const minimum = maxLength / 3;
  const comma = Math.max(window.lastIndexOf(", "), window.lastIndexOf("，"), window.lastIndexOf("、"));
  if (comma >= minimum) return comma;
  const space = window.lastIndexOf(" ");
  return space >= minimum ? space : maxLength - 1;
}

/** Trims text to `max` characters without cutting words, from the start or from the end. */
export function truncateWords(text: string, max: number, keep: "start" | "end"): string {
  if (text.length <= max) return text;
  if (keep === "end") {
    const tail = text.slice(-max);
    return "…" + tail.slice(tail.indexOf(" ") + 1);
  }
  const head = text.slice(0, max);
  return head.slice(0, head.lastIndexOf(" ")) + "…";
}
