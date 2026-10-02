import { clasificarError } from "../ai/errores.js";
import { transcribir } from "../ai/transcripcion.js";
import { traducir } from "../ai/traduccion.js";
import { config } from "../config.js";
import { encolarReintentoSegmento } from "../queue/colas.js";
import {
  guardarTranscripcion,
  marcarSegmentoListo,
  obtenerSegmentoAnterior,
  reclamarSegmento,
  registrarFalloSegmento,
} from "../repositories/segmentos.repo.js";
import { registrarIdiomaOrigen } from "../repositories/videos.repo.js";
import { descargarBuffer } from "../storage/s3.js";

export type ResultadoSegmento = "listo" | "reintento" | "error" | "omitido";

/**
 * Pasos (c), (d) y (e) para UN segmento. Transiciones de estado:
 *
 *   pendiente --reclamar--> procesando --ok--> listo
 *                               |
 *                               +--fallo recuperable, quedan intentos--> pendiente (+ job con backoff)
 *                               +--fallo no recuperable o sin intentos--> error
 *
 * Nunca lanza: un fallo aquí no detiene el resto del video.
 */
export async function procesarSegmento(segmentoId: string, idiomaDestino: string): Promise<ResultadoSegmento> {
  const seg = await reclamarSegmento(segmentoId);
  if (!seg) return "omitido"; // ya lo tomó otro worker o ya terminó

  try {
    const anterior = await obtenerSegmentoAnterior(seg.video_id, seg.indice);

    // (c) Transcripción. Si un intento previo ya transcribió y falló en la
    // traducción, se reutiliza el texto y no se paga el STT dos veces.
    let original = seg.texto_original;
    if (original === null) {
      const audio = await descargarBuffer(seg.audio_key);
      const r = await transcribir(audio, anterior?.texto_original);
      original = r.texto;
      await guardarTranscripcion(seg.id, original);
      if (r.idioma) await registrarIdiomaOrigen(seg.video_id, r.idioma);
    }

    // (d) Traducción con el segmento anterior como contexto. Silencio o
    // música sin habla -> texto vacío, y no se llama al LLM.
    const traducido = original
      ? await traducir({
          texto: original,
          idiomaDestino,
          anterior: anterior && { original: anterior.texto_original, traducido: anterior.texto_traducido },
        })
      : "";

    // (e) Se guarda de inmediato: desde aquí ya aparece en /estado y /subtitulos.
    await marcarSegmentoListo(seg.id, traducido);
    return "listo";
  } catch (err) {
    const { mensaje, recuperable } = clasificarError(err);
    const actualizado = await registrarFalloSegmento(seg.id, mensaje, config.MAX_INTENTOS_SEGMENTO, recuperable);
    console.warn(
      `Segmento ${seg.indice} del video ${seg.video_id} falló (intento ${actualizado.intentos}): ${mensaje}`,
    );
    if (actualizado.estado === "pendiente") {
      await encolarReintentoSegmento(seg.id, actualizado.intentos);
      return "reintento";
    }
    return "error";
  }
}
