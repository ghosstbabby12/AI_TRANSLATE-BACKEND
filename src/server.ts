import { crearApp } from "./api/app.js";
import { config } from "./config.js";
import { pool } from "./db/pool.js";

const server = crearApp().listen(config.PORT, () => {
  console.log(`API escuchando en http://localhost:${config.PORT}`);
});

process.on("SIGTERM", () => {
  server.close(() => void pool.end().then(() => process.exit(0)));
});
