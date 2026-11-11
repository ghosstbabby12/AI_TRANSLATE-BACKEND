import type { VideoDetail, VideoStatusView } from "../../../application/videos/queries.js";
import type { Segment } from "../../../domain/segment.js";
import type { Video, VideoTranslation } from "../../../domain/video.js";
import { segmentStatusCode, sourceTypeCode, taskStatusCode, videoStatusCode } from "../../../shared/legacyCodes.js";

/** A video in the public API format (Spanish field names, kept for compatibility). */
export function presentVideo(v: Video) {
  return {
    id: v.id,
    usuario_id: v.userId,
    nombre: v.name,
    origen_tipo: sourceTypeCode.encode(v.sourceType),
    origen_url: v.sourceUrl,
    storage_key: v.fileKey,
    idioma_destino: v.targetLanguage,
    idioma_origen: v.sourceLanguage,
    estado: videoStatusCode.encode(v.status),
    total_segmentos: v.totalSegments,
    duracion_seg: v.durationSeconds,
    error: v.error,
    miniatura_key: v.thumbnailKey,
    export_estado: taskStatusCode.encodeNullable(v.export.status),
    export_key: v.export.key,
    export_error: v.export.error,
    resumen_estado: taskStatusCode.encodeNullable(v.summary.status),
    resumen_texto: v.summary.text,
    resumen_error: v.summary.error,
    resumen_en: v.summary.createdAt,
    audio_estado: taskStatusCode.encodeNullable(v.audio.status),
    audio_key: v.audio.key,
    audio_error: v.audio.error,
    audio_progreso: v.audio.progress,
    audio_intentos: v.audio.attempts,
    creado_en: v.createdAt,
    actualizado_en: v.updatedAt,
  };
}

const presentTranslation = (t: VideoTranslation) => ({
  id: t.id,
  idioma_destino: t.targetLanguage,
  estado: videoStatusCode.encode(t.status),
});

export const presentListItem = ({ video, thumbnailUrl }: { video: Video & { readySegments: number }; thumbnailUrl: string | null }) => ({
  ...presentVideo(video),
  segmentos_listos: video.readySegments,
  url_miniatura: thumbnailUrl,
});

export const presentDetail = (d: VideoDetail) => ({
  ...presentVideo(d.video),
  traducciones: d.translations.map(presentTranslation),
  url_reproduccion: d.playbackUrl,
  url_miniatura: d.thumbnailUrl,
  url_exportacion: d.exportUrl,
  voz_disponible: d.voiceAvailable,
  url_audio: d.audioUrl,
  url_audio_descarga: d.audioDownloadUrl,
});

export const presentStatus = ({ video, progress, segments }: VideoStatusView) => ({
  id: video.id,
  estado: videoStatusCode.encode(video.status),
  error: video.error,
  idioma_origen: video.sourceLanguage,
  idioma_destino: video.targetLanguage,
  progreso: {
    total: progress.total,
    listos: progress.ready,
    pendientes: progress.pending,
    procesando: progress.processing,
    errores: progress.failed,
    porcentaje: progress.percent,
  },
  segmentos: segments.map((s) => ({
    indice: s.index,
    tiempo_inicio: s.startSeconds,
    tiempo_fin: s.endSeconds,
    estado: segmentStatusCode.encode(s.status),
    texto_traducido: s.status === "ready" ? s.translatedText : null,
    error: s.status === "failed" ? s.lastError : null,
  })),
});

export const presentSubtitles = (video: Video, segments: Segment[]) => ({
  id: video.id,
  estado: videoStatusCode.encode(video.status),
  idioma: video.targetLanguage,
  segmentos: segments.map((s) => ({
    indice: s.index,
    inicio: s.startSeconds,
    fin: s.endSeconds,
    original: s.originalText,
    traducido: s.translatedText,
  })),
});
