import type { Segment } from "../../domain/segment.js";
import type { InterfaceLanguage, User } from "../../domain/user.js";
import type { Video } from "../../domain/video.js";
import { segmentStatusCode, sourceTypeCode, taskStatusCode, videoStatusCode } from "../../shared/legacyCodes.js";

/** Table rows exactly as PostgreSQL returns them (Spanish column names). */
export interface VideoRow {
  id: string;
  usuario_id: string;
  nombre: string;
  origen_tipo: string;
  origen_url: string | null;
  storage_key: string | null;
  idioma_destino: string;
  idioma_origen: string | null;
  estado: string;
  total_segmentos: number | null;
  duracion_seg: number | null;
  error: string | null;
  miniatura_key: string | null;
  export_estado: string | null;
  export_key: string | null;
  export_error: string | null;
  resumen_estado: string | null;
  resumen_texto: string | null;
  resumen_error: string | null;
  resumen_en: Date | null;
  audio_estado: string | null;
  audio_key: string | null;
  audio_error: string | null;
  audio_progreso: number | null;
  audio_intentos: number;
  creado_en: Date;
  actualizado_en: Date;
}

export interface SegmentRow {
  id: string;
  video_id: string;
  indice: number;
  tiempo_inicio: number;
  tiempo_fin: number;
  audio_key: string;
  texto_original: string | null;
  texto_traducido: string | null;
  estado: string;
  intentos: number;
  ultimo_error: string | null;
  actualizado_en: Date;
}

export interface UserRow {
  id: string;
  nombre: string;
  email: string;
  password_hash: string;
  telefono: string | null;
  foto_key: string | null;
  idioma_interfaz: string;
  creado_en: Date;
  actualizado_en: Date;
}

export const toVideo = (r: VideoRow): Video => ({
  id: r.id,
  userId: r.usuario_id,
  name: r.nombre,
  sourceType: sourceTypeCode.decode(r.origen_tipo),
  sourceUrl: r.origen_url,
  fileKey: r.storage_key,
  targetLanguage: r.idioma_destino,
  sourceLanguage: r.idioma_origen,
  status: videoStatusCode.decode(r.estado),
  totalSegments: r.total_segmentos,
  durationSeconds: r.duracion_seg,
  error: r.error,
  thumbnailKey: r.miniatura_key,
  export: { status: taskStatusCode.decodeNullable(r.export_estado), key: r.export_key, error: r.export_error },
  summary: {
    status: taskStatusCode.decodeNullable(r.resumen_estado),
    text: r.resumen_texto,
    error: r.resumen_error,
    createdAt: r.resumen_en,
  },
  audio: {
    status: taskStatusCode.decodeNullable(r.audio_estado),
    key: r.audio_key,
    error: r.audio_error,
    progress: r.audio_progreso,
    attempts: r.audio_intentos,
  },
  createdAt: r.creado_en,
  updatedAt: r.actualizado_en,
});

export const toSegment = (r: SegmentRow): Segment => ({
  id: r.id,
  videoId: r.video_id,
  index: r.indice,
  startSeconds: r.tiempo_inicio,
  endSeconds: r.tiempo_fin,
  audioKey: r.audio_key,
  originalText: r.texto_original,
  translatedText: r.texto_traducido,
  status: segmentStatusCode.decode(r.estado),
  attempts: r.intentos,
  lastError: r.ultimo_error,
  updatedAt: r.actualizado_en,
});

export const toUser = (r: UserRow): User => ({
  id: r.id,
  name: r.nombre,
  email: r.email,
  passwordHash: r.password_hash,
  phone: r.telefono,
  photoKey: r.foto_key,
  interfaceLanguage: r.idioma_interfaz as InterfaceLanguage,
  createdAt: r.creado_en,
  updatedAt: r.actualizado_en,
});
