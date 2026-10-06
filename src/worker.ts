import { pool } from "./db/pool.js";
import { iniciarWorkers } from "./workers.js";

// Proceso worker independiente (despliegue con worker separado / docker compose).
const cerrarWorkers = await iniciarWorkers();

// Cierre ordenado: termina los jobs en curso antes de salir (Render/ECS envían SIGTERM).
async function cerrar() {
  console.log("Cerrando worker...");
  await cerrarWorkers();
  await pool.end();
  process.exit(0);
}
process.on("SIGTERM", cerrar);
process.on("SIGINT", cerrar);
