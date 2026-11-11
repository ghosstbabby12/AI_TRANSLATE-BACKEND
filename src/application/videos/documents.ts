import { NotFoundError } from "../../domain/errors.js";
import { buildCues } from "../../domain/subtitles/cues.js";
import { summaryToText, toSrt, toVtt, transcriptToText } from "../../domain/subtitles/formats.js";
import type { Video } from "../../domain/video.js";
import { MESSAGES } from "../messages.js";
import type { Deps } from "../ports/index.js";
import { downloadFileName, languagePair } from "../shared/naming.js";

export type TextFormat = "srt" | "vtt" | "txt";

export interface TextDocument {
  content: string;
  contentType: string;
  fileName: string;
}

const CONTENT_TYPES: Record<TextFormat, string> = {
  srt: "application/x-subrip",
  vtt: "text/vtt",
  txt: "text/plain",
};

/** Downloadable texts: subtitles, transcript and summary. They work even halfway through processing. */
export function makeDocuments({ segments }: Deps) {
  const readySegments = (video: Video) => segments.listReady(video.id);

  async function subtitles(video: Video, format: TextFormat): Promise<TextDocument> {
    const ready = await readySegments(video);
    const header = { title: video.name, languages: languagePair(video) };
    const content =
      format === "srt" ? toSrt(buildCues(ready)) : format === "vtt" ? toVtt(buildCues(ready)) : transcriptToText(ready, header);
    return { content, contentType: CONTENT_TYPES[format], fileName: downloadFileName(video, format) };
  }

  function summary(video: Video): TextDocument {
    if (!video.summary.text) throw new NotFoundError(MESSAGES.summary.notFound);
    const header = { title: video.name, languages: languagePair(video) };
    return {
      content: summaryToText(video.summary.text, header),
      contentType: "text/plain",
      fileName: downloadFileName(video, "txt", "-resumen"),
    };
  }

  return { readySegments, subtitles, summary };
}
