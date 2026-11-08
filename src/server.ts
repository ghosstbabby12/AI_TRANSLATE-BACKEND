import { crearApp } from "./api/app.js";
import { prepararBaseDeDatos } from "./arranque.js";
import { config } from "./config.js";
import { pool } from "./db/pool.js";
import { describirError } from "./util/resiliencia.js";
import { iniciarWorkers } from "./workers.js";

// Un error inesperado en una promesa no debe tumbar todo el servidor.
process.on("unhandledRejection", (err) => console.error(`[proceso] promesa rechazada sin capturar: ${describirError(err)}`));

// 1. Primero se abre el puerto: /salud responde aunque la base o Redis estén caídos.
const server = crearApp().listen(config.PORT, () => {
  console.log(`API escuchando en http://localhost:${config.PORT}`);
});

// 2. Migraciones en segundo plano, con reintentos hasta que la base responda.
// 3. Plan gratuito de Render (sin background workers): la API también procesa,
//    una vez que la base está lista.
let cerrarWorkers: (() => Promise<void>) | null = null;
void prepararBaseDeDatos().then(async () => {
  if (config.WORKER_EN_API) cerrarWorkers = await iniciarWorkers();
});

process.on("SIGTERM", () => {
  server.close(async () => {
    await cerrarWorkers?.();
    await pool.end();
    process.exit(0);
  });
});
