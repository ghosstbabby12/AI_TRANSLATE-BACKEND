import { readdir } from "node:fs/promises";
import path from "node:path";
import type { VideoDownloader } from "../../application/ports/media.js";
import { config } from "../../config/index.js";
import { runProcess } from "./runProcess.js";

/** Downloads public videos with yt-dlp. Only http(s) URLs reach here (validated by the API). */
export const ytDlpDownloader: VideoDownloader = {
  async download(url, outputDir) {
    await runProcess(config.binaries.ytDlp, [
      "--no-playlist",
      // YouTube requires running JavaScript; the image's Node is used
      "--js-runtimes", "node",
      "--no-progress",
      "--max-filesize", `${config.maxUploadMb}M`,
      "-f", "b[ext=mp4]/bv*+ba/b",
      "--merge-output-format", "mp4",
      "-o", path.join(outputDir, "original.%(ext)s"),
      // "--" stops a URL starting with "-" from being read as an option
      "--",
      url,
    ]);
    const file = (await readdir(outputDir)).find((f) => f.startsWith("original."));
    if (!file) throw new Error("yt-dlp no produjo ningún archivo");
    return path.join(outputDir, file);
  },
};
