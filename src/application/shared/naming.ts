import path from "node:path";
import type { Video } from "../../domain/video.js";

/** Safe file name for downloads: "<name><suffix>.<language>.<extension>". */
export function downloadFileName(video: Pick<Video, "name" | "targetLanguage">, extension: string, suffix = ""): string {
  const base = path.parse(video.name).name.replace(/[^\w.-]+/g, "_").slice(0, 80) || "video";
  return `${base}${suffix}.${video.targetLanguage}.${extension}`;
}

/** "ES → EN", used as a header in the downloadable texts. */
export const languagePair = (video: Pick<Video, "sourceLanguage" | "targetLanguage">) =>
  `${(video.sourceLanguage ?? "?").toUpperCase()} → ${video.targetLanguage.toUpperCase()}`;
