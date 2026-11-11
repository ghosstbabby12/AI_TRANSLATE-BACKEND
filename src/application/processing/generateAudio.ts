import path from "node:path";
import { PermanentError } from "../../domain/errors.js";
import type { Segment } from "../../domain/segment.js";
import { MESSAGES } from "../messages.js";
import type { Deps } from "../ports/index.js";
import { storageKeys } from "../shared/storageKeys.js";
import { AudioTrackWriter } from "./audioTrack.js";

const PROGRESS_SAVE_INTERVAL_MS = 3_000;
// Synthesis is almost all the work; building and uploading the MP3 is the rest.
const SYNTHESIS_SHARE = 95;

/**
 * Creates the MP3 of the translation narrated by a synthetic voice, aligned
 * with the video so it can be played over it like a dub.
 */
export function makeGenerateAudio({ videos, segments, storage, speech, media, workspace }: Deps) {
  function progressSaver(videoId: string) {
    let lastSave = 0;
    return (percent: number) => {
      if (Date.now() - lastSave < PROGRESS_SAVE_INTERVAL_MS) return;
      lastSave = Date.now();
      videos.setAudioProgress(videoId, percent).catch(() => {}); // informational only
    };
  }

  async function concatPhrases(paths: string[], sampleRate: number): Promise<Buffer> {
    const parts: Buffer[] = [];
    for (const file of paths) {
      const pcm = await speech.readWav(file);
      if (pcm.sampleRate !== sampleRate) throw new Error("Phrases have different sample rates");
      parts.push(pcm.samples);
    }
    return Buffer.concat(parts);
  }

  async function buildTrack(segmentList: Segment[], phrases: string[][], duration: number | null, output: string) {
    const firstPhrase = phrases.flat()[0];
    if (!firstPhrase) throw new PermanentError(MESSAGES.processing.nothingToNarrate);
    const sampleRate = (await speech.readWav(firstPhrase)).sampleRate;
    const encoder = media.createMp3Encoder(sampleRate, output);
    const track = new AudioTrackWriter(encoder, sampleRate, (samples, factor) => media.speedUpPcm(samples, sampleRate, factor));
    try {
      for (const [i, segment] of segmentList.entries()) {
        if (phrases[i]!.length === 0) continue;
        const samples = await concatPhrases(phrases[i]!, sampleRate);
        await track.add({ startSeconds: segment.startSeconds, endSeconds: segment.endSeconds, samples });
      }
      if (duration) await track.padTo(duration);
    } finally {
      await encoder.close();
    }
  }

  return async (videoId: string): Promise<void> => {
    const video = await videos.findById(videoId);
    if (!video) return; // deleted while waiting in the queue
    // Already finished or cancelled: a job repeated by the queue does not redo it.
    if (video.audio.status !== "processing") return;
    if (!speech.isVoiceAvailable(video.targetLanguage)) {
      throw new PermanentError(MESSAGES.processing.noVoiceFor(video.targetLanguage));
    }
    const narrated = (await segments.listReady(videoId)).filter((s) => s.translatedText?.trim());
    if (narrated.length === 0) throw new PermanentError(MESSAGES.processing.noTranslationYet);

    const saveProgress = progressSaver(videoId);
    await workspace.withTempDir(`audio-${videoId}-`, async (dir) => {
      const texts = narrated.map((s) => s.translatedText!);
      const phrases = await speech.synthesize(texts, video.targetLanguage, dir, (f) => saveProgress(f * SYNTHESIS_SHARE));

      const output = path.join(dir, "traduccion.mp3");
      await buildTrack(narrated, phrases, video.durationSeconds, output);
      await videos.setAudioProgress(videoId, 97);

      const key = storageKeys.translationAudio(videoId);
      await storage.upload(key, output, "audio/mpeg");
      await videos.setAudio(videoId, { status: "ready", key });
    });
  };
}
