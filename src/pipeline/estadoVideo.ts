import { progresoVideo } from "../repositories/segmentos.repo.js";
import { actualizarEstadoVideo } from "../repositories/videos.repo.js";

/**
 * Deriva el estado general del video a partir de sus segmentos. Se llama al
 * terminar el recorrido principal y después de cada reintento; es idempotente,
 * así que no importa si dos workers lo ejecutan a la vez.
 *
 *  - quedan segmentos pendientes/procesando -> procesando
 *  - todos terminados y al menos uno listo   -> completo (los fallidos se
 *    informan en el progreso y se pueden reintentar a mano)
 *  - todos terminados y ninguno listo        -> error
 */
export async function recalcularEstadoVideo(videoId: string): Promise<void> {
  const p = await progresoVideo(videoId);
  if (p.total === 0) return;

  if (p.pendientes + p.procesando > 0) {
    await actualizarEstadoVideo(videoId, "procesando");
  } else if (p.listos > 0) {
    await actualizarEstadoVideo(videoId, "completo");
  } else {
    await actualizarEstadoVideo(videoId, "error", "Ningún segmento se pudo procesar");
  }
}
