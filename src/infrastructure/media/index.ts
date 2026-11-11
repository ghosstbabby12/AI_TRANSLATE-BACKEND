import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { MediaToolkit } from "../../application/ports/media.js";
import type { Workspace } from "../../application/ports/services.js";
import { hasAudioTrack, splitAudio } from "./audioSplitter.js";
import { burnSubtitles, extractThumbnail, makeAvatar } from "./imageAndVideo.js";
import { createMp3Encoder, speedUpPcm } from "./pcmAudio.js";

/** Audio and video tools, all backed by ffmpeg/ffprobe. */
export const ffmpegToolkit: MediaToolkit = {
  hasAudioTrack,
  splitAudio,
  burnSubtitles,
  extractThumbnail,
  makeAvatar,
  speedUpPcm,
  createMp3Encoder,
};

export const localWorkspace: Workspace = {
  async withTempDir(prefix, work) {
    const dir = await mkdtemp(path.join(tmpdir(), prefix));
    try {
      return await work(dir);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
  writeText: (file, text) => writeFile(file, text, "utf8"),
};
