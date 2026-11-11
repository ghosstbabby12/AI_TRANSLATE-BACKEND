import { ConflictError } from "../../domain/errors.js";
import { isVideoBusy, type Video } from "../../domain/video.js";
import { MESSAGES } from "../messages.js";
import type { Deps } from "../ports/index.js";
import { enqueueOrDefer } from "../shared/enqueue.js";

/**
 * The user asks for an extra result of a translated video. Each one runs in
 * the background: it is marked "processing" here and a worker finishes it;
 * the app polls the video until the status is "ready".
 */
export function makeTaskRequests({ videos, segments, jobs, speech }: Deps) {
  const hasReadySegments = async (video: Video) => (await segments.listReady(video.id)).length > 0;

  /** MP4 with the translated subtitles burned into the picture. */
  async function requestExport(video: Video): Promise<void> {
    if (!video.fileKey) throw new ConflictError(MESSAGES.export.originalMissing);
    if (!(await hasReadySegments(video))) throw new ConflictError(MESSAGES.export.noSubtitles);
    if (video.export.status === "processing") return;
    await videos.setExport(video.id, { status: "processing" });
    await enqueueOrDefer(() => jobs.enqueueExport(video.id), `export ${video.id}`);
  }

  /** AI summary of the transcript, in the translation's language. */
  async function requestSummary(video: Video): Promise<void> {
    if (isVideoBusy(video)) throw new ConflictError(MESSAGES.summary.waitForTranslation);
    if (!(await hasReadySegments(video))) throw new ConflictError(MESSAGES.summary.noTranscript);
    if (video.summary.status === "processing") return;
    await videos.setSummary(video.id, { status: "processing" });
    await enqueueOrDefer(() => jobs.enqueueSummary(video.id), `summary ${video.id}`);
  }

  /** The translation narrated by a synthetic voice, aligned with the video. */
  async function requestAudio(video: Video): Promise<void> {
    if (!speech.isVoiceAvailable(video.targetLanguage)) throw new ConflictError(MESSAGES.audio.noVoice);
    if (isVideoBusy(video)) throw new ConflictError(MESSAGES.audio.waitForTranslation);
    if (!(await hasReadySegments(video))) throw new ConflictError(MESSAGES.audio.noTranslation);
    if (video.audio.status === "processing") return;
    await videos.setAudio(video.id, { status: "processing", key: video.audio.key });
    await enqueueOrDefer(() => jobs.enqueueAudio(video.id), `audio ${video.id}`);
  }

  return { requestExport, requestSummary, requestAudio };
}
