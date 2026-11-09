import { UnrecoverableError } from "bullmq";
import { clasificarError } from "../ai/errores.js";
import { resumir } from "../ai/resumen.js";
import { listarSegmentosListos } from "../repositories/segmentos.repo.js";
import { actualizarResumen, obtenerVideo } from "../repositories/videos.repo.js";
import { marcaTiempo } from "../subtitulos/formatos.js";

/**
 * Resume la transcripción traducida del video (en su idioma de destino) y
 * guarda el resultado en la base de datos. Los errores de IA que no se
 * arreglan reintentando (p. ej. un rechazo) terminan el job sin más intentos.
 */
export async function resumirVideo(videoId: string): Promise<void> {
  const video = await obtenerVideo(videoId);
  if (!video) return; // se eliminó mientras esperaba en la cola

  const segmentos = await listarSegmentosListos(videoId);
  if (segmentos.length === 0) throw new UnrecoverableError("El video todavía no tiene transcripción");

  let texto: string;
  try {
    texto = await resumir({
      titulo: video.nombre,
      idioma: video.idioma_destino,
      fragmentos: segmentos.map((s) => ({ tiempo: marcaTiempo(s.tiempo_inicio), texto: s.texto_traducido ?? "" })),
    });
  } catch (err) {
    const { mensaje, recuperable } = clasificarError(err);
    throw recuperable ? new Error(mensaje) : new UnrecoverableError(mensaje);
  }
  await actualizarResumen(videoId, { estado: "listo", texto });
}
