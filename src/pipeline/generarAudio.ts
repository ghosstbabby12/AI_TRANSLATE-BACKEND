import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { UnrecoverableError } from "bullmq";
import { acelerarPcm, codificadorMp3 } from "../media/ffmpeg.js";
import { leerWav, sintetizar, vozDisponible } from "../media/voz.js";
import { listarSegmentosListos } from "../repositories/segmentos.repo.js";
import { actualizarAudio, actualizarProgresoAudio, obtenerVideo } from "../repositories/videos.repo.js";
import { claves, subirArchivo } from "../storage/s3.js";

// Una traducción suele ser más larga que el original: si la frase no cabe en
// su tramo se acelera, pero no más de esto (más rápido ya no se entiende).
const ACELERACION_MAXIMA = 1.35;
/** Error que se guarda si el proceso se cortó varias veces a mitad (la app lo muestra traducido). */
export const ERROR_AUDIO_INTERRUMPIDO =
  "El servidor se quedó sin memoria o se reinició mientras generaba el audio. Prueba con un video más corto.";

// Cada cuánto se guarda el avance en la base, como mucho
const INTERVALO_PROGRESO_MS = 3_000;

/**
 * Genera el MP3 con la traducción narrada por una voz sintética. Cada segmento
 * empieza en su marca de tiempo (o justo al terminar el anterior, si este se
 * alargó), así la pista dura lo mismo que el video y se puede escuchar encima
 * de él como un doblaje.
 */
export async function generarAudio(videoId: string): Promise<void> {
  const video = await obtenerVideo(videoId);
  if (!video) return; // se eliminó mientras esperaba en la cola
  // Ya terminó (o se canceló): un job repetido por BullMQ tras perder el lock no lo rehace
  if (video.audio_estado !== "procesando") return;
  if (!vozDisponible(video.idioma_destino)) {
    throw new UnrecoverableError(`No hay voz sintética para el idioma ${video.idioma_destino}`);
  }

  const segmentos = (await listarSegmentosListos(videoId)).filter((s) => s.texto_traducido?.trim());
  if (segmentos.length === 0) throw new UnrecoverableError("El video todavía no tiene traducción");

  // Sintetizar es casi todo el trabajo (hasta 95 %); armar y subir el MP3, el resto
  let ultimoGuardado = 0;
  const avanzar = (porcentaje: number) => {
    if (Date.now() - ultimoGuardado < INTERVALO_PROGRESO_MS) return;
    ultimoGuardado = Date.now();
    actualizarProgresoAudio(videoId, porcentaje).catch(() => {}); // solo informativo
  };

  const dir = await mkdtemp(path.join(tmpdir(), `audio-${videoId}-`));
  try {
    const frases = await sintetizar(
      segmentos.map((s) => s.texto_traducido!),
      video.idioma_destino,
      dir,
      (fraccion) => avanzar(fraccion * 95),
    );
    const primera = frases.flat()[0];
    if (!primera) throw new UnrecoverableError("La traducción no tiene texto para narrar");

    const salida = path.join(dir, "traduccion.mp3");
    const sr = (await leerWav(primera)).frecuencia;
    const mp3 = codificadorMp3(sr, salida);
    const silencio = Buffer.alloc(sr * 2); // 1 s de silencio (16 bits por muestra)
    const escribirSilencio = async (muestras: number) => {
      for (let restantes = muestras; restantes > 0; restantes -= sr) {
        await mp3.escribir(silencio.subarray(0, Math.min(restantes, sr) * 2));
      }
    };

    let cursor = 0; // en muestras
    try {
      for (const [i, seg] of segmentos.entries()) {
        if (frases[i]!.length === 0) continue;
        // El segmento se sintetizó en varias frases cortas: se juntan
        const partes: Buffer[] = [];
        for (const ruta of frases[i]!) {
          const pcm = await leerWav(ruta);
          if (pcm.frecuencia !== sr) throw new Error("Las frases tienen frecuencias de muestreo distintas");
          partes.push(pcm.datos);
        }

        const inicio = Math.max(Math.round(seg.tiempo_inicio * sr), cursor);
        const disponible = Math.round(seg.tiempo_fin * sr) - inicio;
        let datos: Buffer = Buffer.concat(partes);
        const largo = datos.length / 2;
        if (disponible > sr * 0.3 && largo > disponible * 1.03) {
          datos = await acelerarPcm(datos, sr, Math.min(largo / disponible, ACELERACION_MAXIMA));
        }

        await escribirSilencio(inicio - cursor);
        await mp3.escribir(datos);
        cursor = inicio + datos.length / 2;
      }
      // Hasta el final del video, para que la pista y el video duren lo mismo
      if (video.duracion_seg) await escribirSilencio(Math.round(video.duracion_seg * sr) - cursor);
    } finally {
      await mp3.cerrar();
    }

    await actualizarProgresoAudio(videoId, 97);
    const key = claves.audioTraduccion(videoId);
    await subirArchivo(key, salida, "audio/mpeg");
    await actualizarAudio(videoId, { estado: "listo", key });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
