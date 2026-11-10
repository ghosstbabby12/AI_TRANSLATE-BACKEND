export type EstadoVideo = "pendiente" | "procesando" | "completo" | "error";
export type EstadoSegmento = "pendiente" | "procesando" | "listo" | "error";
export type OrigenTipo = "archivo" | "url";
export type EstadoExportacion = "procesando" | "listo" | "error";

export interface Video {
  id: string;
  usuario_id: string;
  nombre: string;
  origen_tipo: OrigenTipo;
  origen_url: string | null;
  storage_key: string | null;
  idioma_destino: string;
  idioma_origen: string | null;
  estado: EstadoVideo;
  total_segmentos: number | null;
  duracion_seg: number | null;
  error: string | null;
  export_estado: EstadoExportacion | null;
  export_key: string | null;
  export_error: string | null;
  miniatura_key: string | null;
  resumen_estado: EstadoExportacion | null;
  resumen_texto: string | null;
  resumen_error: string | null;
  resumen_en: Date | null;
  audio_estado: EstadoExportacion | null;
  audio_key: string | null;
  audio_error: string | null;
  creado_en: Date;
  actualizado_en: Date;
}

export interface Segmento {
  id: string;
  video_id: string;
  indice: number;
  tiempo_inicio: number;
  tiempo_fin: number;
  audio_key: string;
  texto_original: string | null;
  texto_traducido: string | null;
  estado: EstadoSegmento;
  intentos: number;
  ultimo_error: string | null;
  actualizado_en: Date;
}

export interface ProgresoVideo {
  total: number;
  listos: number;
  pendientes: number;
  procesando: number;
  errores: number;
}

// Payloads de los jobs de BullMQ
export interface JobProcesarVideo {
  videoId: string;
}

export interface JobReintentarSegmento {
  segmentoId: string;
}

export interface JobExportarVideo {
  videoId: string;
}

export interface JobResumirVideo {
  videoId: string;
}

export interface JobAudioVideo {
  videoId: string;
}
