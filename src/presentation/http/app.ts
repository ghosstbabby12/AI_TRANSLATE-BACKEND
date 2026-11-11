import express from "express";
import type { UseCases } from "../../application/index.js";
import type { TokenService } from "../../application/ports/services.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { cors, requestTimeout, requireDatabase } from "./middleware/guards.js";
import { requireUser } from "./middleware/requireUser.js";
import { authRoutes } from "./routes/authRoutes.js";
import { healthRoutes } from "./routes/healthRoutes.js";
import { profileRoutes } from "./routes/profileRoutes.js";
import { videoRoutes } from "./routes/videoRoutes.js";
import { videoTaskRoutes } from "./routes/videoTaskRoutes.js";

export function createApp(useCases: UseCases, tokens: TokenService) {
  const app = express();
  const signedIn = requireUser(tokens);
  // Behind Render's proxy: req.ip must be the client's real IP (used by the login limit).
  app.set("trust proxy", 1);

  app.use(cors);
  app.use(express.json({ limit: "100kb" }));
  app.use(requestTimeout);

  app.use(healthRoutes());
  app.use("/auth", requireDatabase, authRoutes(useCases, signedIn));
  app.use("/perfil", requireDatabase, signedIn, profileRoutes(useCases));
  app.use("/videos", requireDatabase, signedIn, videoRoutes(useCases), videoTaskRoutes(useCases));

  app.use(errorHandler);
  return app;
}
