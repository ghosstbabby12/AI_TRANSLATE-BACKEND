import { errorMessage, isRetryable } from "../../domain/errors.js";
import type { Deps } from "../ports/index.js";

export type SegmentResult = "ready" | "retrying" | "failed" | "skipped";

/**
 * Transcribes and translates ONE segment. Status transitions:
 *
 *   pending --claim--> processing --ok--> ready
 *                          ├─ temporary failure, attempts left --> pending (+ retry job with backoff)
 *                          └─ permanent failure or no attempts --> failed
 *
 * Never throws: one failing segment does not stop the rest of the video.
 */
export function makeProcessSegment({ segments, videos, storage, transcriber, translator, jobs, settings }: Deps) {
  return async (segmentId: string, targetLanguage: string): Promise<SegmentResult> => {
    const segment = await segments.claim(segmentId);
    if (!segment) return "skipped"; // another worker took it, or it is already done

    try {
      const previous = await segments.findPrevious(segment.videoId, segment.index);

      // A previous attempt may have transcribed and then failed to translate:
      // the transcript is reused so speech-to-text is not paid twice.
      let original = segment.originalText;
      if (original === null) {
        const audio = await storage.downloadBuffer(segment.audioKey);
        const result = await transcriber.transcribe(audio, previous?.originalText);
        original = result.text;
        await segments.saveTranscript(segment.id, original);
        if (result.language) await videos.setSourceLanguage(segment.videoId, result.language);
      }

      // Silence or music without speech gives empty text: no need to call the AI.
      const translated = original
        ? await translator.translate({
            text: original,
            targetLanguage,
            previous: previous && { original: previous.originalText, translated: previous.translatedText },
          })
        : "";

      // Saved right away: from now on it shows up in the status and the subtitles.
      await segments.markReady(segment.id, translated);
      return "ready";
    } catch (err) {
      const message = errorMessage(err);
      const updated = await segments.recordFailure(segment.id, message, settings.maxSegmentAttempts, isRetryable(err));
      if (!updated) return "skipped"; // the video was deleted meanwhile
      console.warn(`Segment ${segment.index} of video ${segment.videoId} failed (attempt ${updated.attempts}): ${message}`);
      if (updated.status !== "pending") return "failed";
      await jobs.enqueueSegmentRetry(segment.id, updated.attempts);
      return "retrying";
    }
  };
}
