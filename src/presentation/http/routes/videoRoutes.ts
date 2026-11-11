import { rm } from "node:fs/promises";
import { Router, type Request } from "express";
import type { UseCases } from "../../../application/index.js";
import { MESSAGES } from "../../../application/messages.js";
import { NotFoundError } from "../../../domain/errors.js";
import { currentUserId } from "../middleware/requireUser.js";
import { presentDetail, presentListItem, presentStatus, presentVideo } from "../presenters/videoPresenter.js";
import { createVideoSchema, renameSchema, videoIdSchema } from "../schemas.js";
import { originalFileName, videoUpload } from "../uploads.js";

/** The user's video from the URL, or 404. */
export function ownedVideoLoader({ videos }: UseCases) {
  return (req: Request) => {
    const params = videoIdSchema.safeParse(req.params);
    if (!params.success) throw new NotFoundError(MESSAGES.videos.notFound);
    return videos.findOwned(params.data.id, currentUserId(req));
  };
}

/** Creating, listing, reading, renaming and deleting videos. */
export function videoRoutes(useCases: UseCases) {
  const { videos } = useCases;
  const router = Router();
  const ownedVideo = ownedVideoLoader(useCases);

  /** POST /videos — multipart (video=<file>) or JSON ({ url }), plus idioma_destino. */
  router.post("/", videoUpload.single("video"), async (req, res) => {
    const file = req.file;
    try {
      const body = createVideoSchema.parse(req.body);
      const video = await videos.create({
        userId: currentUserId(req),
        targetLanguage: body.idioma_destino,
        name: body.nombre,
        url: body.url,
        file: file && { path: file.path, originalName: originalFileName(file.originalname), mimeType: file.mimetype },
      });
      res.status(201).json(presentVideo(video));
    } finally {
      if (file) await rm(file.path, { force: true });
    }
  });

  /** GET /videos — the user's history, newest first. */
  router.get("/", async (req, res) => {
    res.json((await videos.list(currentUserId(req))).map(presentListItem));
  });

  /** GET /videos/:id — detail plus temporary URLs for the player and downloads. */
  router.get("/:id", async (req, res) => {
    res.json(presentDetail(await videos.detail(await ownedVideo(req))));
  });

  /** PATCH /videos/:id — renames it (and its other translations). */
  router.patch("/:id", async (req, res) => {
    const video = await ownedVideo(req);
    const { nombre } = renameSchema.parse(req.body);
    res.json({ nombre, actualizados: await videos.rename(video, nombre) });
  });

  /** DELETE /videos/:id — storage is cleaned up after answering. */
  router.delete("/:id", async (req, res) => {
    await videos.remove(await ownedVideo(req));
    res.status(204).end();
  });

  /** GET /videos/:id/estado — polled by the app; includes the segments already translated. */
  router.get("/:id/estado", async (req, res) => {
    res.json(presentStatus(await videos.status(await ownedVideo(req))));
  });

  return router;
}
