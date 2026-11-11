import { Router, type Response } from "express";
import type { UseCases } from "../../../application/index.js";
import type { TextDocument } from "../../../application/videos/documents.js";
import { presentSubtitles } from "../presenters/videoPresenter.js";
import { formatSchema, translateSchema } from "../schemas.js";
import { ownedVideoLoader } from "./videoRoutes.js";

function sendDocument(res: Response, doc: TextDocument, download: boolean) {
  res.type(doc.contentType).set("Cache-Control", "no-store");
  if (download) res.attachment(doc.fileName);
  res.send(doc.content);
}

/** Subtitles, other languages, and the on-demand extras (export, summary, audio, retry). */
export function videoTaskRoutes(useCases: UseCases) {
  const { videos, documents, tasks } = useCases;
  const router = Router();
  const ownedVideo = ownedVideoLoader(useCases);

  /** GET /videos/:id/subtitulos?formato=srt|vtt|txt|json&descargar=1 — whatever is ready so far. */
  router.get("/:id/subtitulos", async (req, res) => {
    const video = await ownedVideo(req);
    const { formato, descargar } = formatSchema.parse(req.query);
    if (formato === "json") return void res.json(presentSubtitles(video, await documents.readySegments(video)));
    sendDocument(res, await documents.subtitles(video, formato), descargar === "1");
  });

  /** POST /videos/:id/traducir — another language, reusing the transcript. */
  router.post("/:id/traducir", async (req, res) => {
    const video = await ownedVideo(req);
    const { idioma_destino } = translateSchema.parse(req.body);
    const result = await videos.translate(video, idioma_destino);
    res.status(result.existing ? 200 : 201).json({ id: result.id, existente: result.existing });
  });

  /** POST /videos/:id/exportar — MP4 with burned subtitles (background). */
  router.post("/:id/exportar", async (req, res) => {
    await tasks.requestExport(await ownedVideo(req));
    res.status(202).json({ export_estado: "procesando" });
  });

  /** POST /videos/:id/resumen — AI summary (background). */
  router.post("/:id/resumen", async (req, res) => {
    await tasks.requestSummary(await ownedVideo(req));
    res.status(202).json({ resumen_estado: "procesando" });
  });

  /** GET /videos/:id/resumen?descargar=1 — the summary as plain text. */
  router.get("/:id/resumen", async (req, res) => {
    const video = await ownedVideo(req);
    const { descargar } = formatSchema.parse(req.query);
    sendDocument(res, documents.summary(video), descargar === "1");
  });

  /** POST /videos/:id/audio — narrated translation (background). */
  router.post("/:id/audio", async (req, res) => {
    await tasks.requestAudio(await ownedVideo(req));
    res.status(202).json({ audio_estado: "procesando" });
  });

  /** POST /videos/:id/reintentar — retries the failed segments (or the whole video). */
  router.post("/:id/reintentar", async (req, res) => {
    const result = await videos.retry(await ownedVideo(req));
    res.json(result.wholeVideo ? { reencolados: 0, video: true } : { reencolados: result.requeued });
  });

  return router;
}
