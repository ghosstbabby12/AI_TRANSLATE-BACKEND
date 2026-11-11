import { Router, type RequestHandler } from "express";
import type { UseCases } from "../../../application/index.js";
import { currentUserId } from "../middleware/requireUser.js";
import { presentSession, presentUser } from "../presenters/userPresenter.js";
import { loginSchema, registerSchema } from "../schemas.js";

export function authRoutes({ session, profile }: UseCases, requireUser: RequestHandler) {
  const router = Router();

  /** POST /auth/registro — creates the account and signs in. */
  router.post("/registro", async (req, res) => {
    const body = registerSchema.parse(req.body);
    const result = await session.register({
      name: body.nombre,
      email: body.email,
      password: body.password,
      anonymousId: body.usuario_anonimo,
    });
    res.status(201).json(presentSession(result, await profile.view(result.user)));
  });

  /** POST /auth/login */
  router.post("/login", async (req, res) => {
    const body = loginSchema.parse(req.body);
    const credentials = { email: body.email, password: body.password, anonymousId: body.usuario_anonimo };
    const result = await session.login(credentials, req.ip ?? "desconocida");
    res.json(presentSession(result, await profile.view(result.user)));
  });

  /** GET /auth/yo — the signed-in user (checks the saved token). */
  router.get("/yo", requireUser, async (req, res) => {
    const user = await session.currentUser(currentUserId(req));
    res.json(presentUser(await profile.view(user)));
  });

  return router;
}
