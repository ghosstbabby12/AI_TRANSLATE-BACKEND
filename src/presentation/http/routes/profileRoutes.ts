import { rm } from "node:fs/promises";
import { Router, type Request } from "express";
import type { UseCases } from "../../../application/index.js";
import { MESSAGES } from "../../../application/messages.js";
import type { User } from "../../../domain/user.js";
import { currentUserId } from "../middleware/requireUser.js";
import { presentUser } from "../presenters/userPresenter.js";
import { passwordSchema, profileSchema } from "../schemas.js";
import { photoUpload } from "../uploads.js";

export function profileRoutes({ session, profile }: UseCases) {
  const router = Router();
  const me = (req: Request) => session.currentUser(currentUserId(req));
  const show = async (user: User) => presentUser(await profile.view(user));

  /** GET /perfil */
  router.get("/", async (req, res) => {
    res.json(await show(await me(req)));
  });

  /** PATCH /perfil — name, email, phone and interface language. */
  router.patch("/", async (req, res) => {
    const user = await me(req);
    const body = profileSchema.parse(req.body);
    const changes = { name: body.nombre, email: body.email, phone: body.telefono, interfaceLanguage: body.idioma_interfaz };
    res.json(await show(await profile.update(user, changes, body.contrasena_actual)));
  });

  /** POST /perfil/contrasena — requires the current one. */
  router.post("/contrasena", async (req, res) => {
    const user = await me(req);
    const { actual, nueva } = passwordSchema.parse(req.body);
    await profile.changePassword(user, actual, nueva);
    res.status(204).end();
  });

  /** POST /perfil/foto — multipart, field "foto". */
  router.post("/foto", photoUpload.single("foto"), async (req, res) => {
    try {
      const user = await me(req);
      if (!req.file) return void res.status(400).json({ error: MESSAGES.profile.imageRequired });
      res.json(await show(await profile.setPhoto(user, req.file.path)));
    } finally {
      if (req.file) await rm(req.file.path, { force: true });
    }
  });

  /** DELETE /perfil/foto */
  router.delete("/foto", async (req, res) => {
    res.json(await show(await profile.removePhoto(await me(req))));
  });

  return router;
}
