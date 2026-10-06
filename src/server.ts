import { crearApp } from "./api/app.js";
import { config } from "./config.js";
import { pool } from "./db/pool.js";
import { iniciarWorkers } from "./workers.js";

const server = crearApp().listen(config.PORT, () => {
  console.log(`API escuchando en http://localhost:${config.PORT}`);
});

// Plan gratuito de Render (sin background workers): la API también procesa.
const cerrarWorkers = config.WORKER_EN_API ? await iniciarWorkers() : null;

process.on("SIGTERM", () => {
  server.close(async () => {
    await cerrarWorkers?.();
    await pool.end();
    process.exit(0);
  });
});
