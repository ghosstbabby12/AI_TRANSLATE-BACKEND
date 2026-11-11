import { PermanentError } from "../../domain/errors.js";
import { formatTimestamp } from "../../domain/subtitles/formats.js";
import { MESSAGES } from "../messages.js";
import type { Deps } from "../ports/index.js";

/** Summarizes the translated transcript (in the target language) and saves it. */
export function makeSummarizeVideo({ videos, segments, summarizer }: Deps) {
  return async (videoId: string): Promise<void> => {
    const video = await videos.findById(videoId);
    if (!video) return; // deleted while waiting in the queue

    const ready = await segments.listReady(videoId);
    if (ready.length === 0) throw new PermanentError(MESSAGES.processing.noTranscriptYet);

    const text = await summarizer.summarize({
      title: video.name,
      language: video.targetLanguage,
      fragments: ready.map((s) => ({ time: formatTimestamp(s.startSeconds), text: s.translatedText ?? "" })),
    });
    await videos.setSummary(videoId, { status: "ready", text });
  };
}
