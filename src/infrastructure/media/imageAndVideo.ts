import { config } from "../../config/index.js";
import { runProcess } from "./runProcess.js";

const { ffmpeg } = config.binaries;
const QUIET = ["-hide_banner", "-loglevel", "error", "-y"];

// Same look as the web player: white text on a translucent dark box.
const SUBTITLE_STYLE = [
  "FontName=DejaVu Sans",
  "FontSize=18",
  "PrimaryColour=&H00FFFFFF",
  "BackColour=&H80000000",
  "BorderStyle=3",
  "Outline=1",
  "Shadow=0",
  "MarginV=28",
].join(",");

/**
 * MP4 with the subtitles burned into the picture, readable in any player.
 * Re-encoding is required, so it is capped at 720p with a fast preset.
 */
export async function burnSubtitles(videoPath: string, srtPath: string, outputPath: string): Promise<void> {
  await runProcess(ffmpeg, [
    ...QUIET,
    "-i", videoPath,
    // Max width 1280 and even dimensions (libx264 requires them)
    "-vf", `scale='trunc(min(1280,iw)/2)*2':-2,subtitles=filename=${srtPath}:force_style='${SUBTITLE_STYLE}'`,
    "-c:v", "libx264", "-preset", "superfast", "-crf", "26",
    "-c:a", "aac", "-b:a", "128k",
    // Playback can start before the whole file is downloaded
    "-movflags", "+faststart",
    outputPath,
  ]);
}

/** A 640 px wide JPEG frame. With -ss before -i, ffmpeg seeks and only reads what it needs (works with URLs). */
export async function extractThumbnail(input: string, outputPath: string, atSecond: number): Promise<void> {
  await runProcess(ffmpeg, [...QUIET, "-ss", atSecond.toFixed(2), "-i", input, "-frames:v", "1", "-vf", "scale=640:-2", "-q:v", "4", outputPath]);
}

/** Centered square crop at 256×256 JPEG, removing metadata such as GPS location. */
export async function makeAvatar(input: string, outputPath: string): Promise<void> {
  await runProcess(ffmpeg, [
    ...QUIET,
    "-i", input,
    "-vf", "crop='min(iw,ih)':'min(iw,ih)',scale=256:256",
    "-frames:v", "1", "-map_metadata", "-1", "-q:v", "3",
    outputPath,
  ]);
}
