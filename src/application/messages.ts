/**
 * Texts the user can read (API errors and task errors saved in the database).
 * They stay in Spanish: the frontend shows them and translates them to English.
 */
export const MESSAGES = {
  auth: {
    emailTaken: "Ya existe una cuenta con ese email",
    tooManyAttempts: "Demasiados intentos fallidos. Espera 15 minutos.",
    wrongCredentials: "Email o contraseña incorrectos",
    invalidSession: "Sesión inválida",
    loginRequired: "Inicia sesión para continuar",
  },
  profile: {
    confirmPasswordForEmail: "Para cambiar el email, confirma tu contraseña actual.",
    wrongCurrentPassword: "La contraseña actual no es correcta",
    imageRequired: "Sube una imagen (JPG, PNG o WebP de hasta 5 MB)",
    unreadableImage: "No se pudo leer la imagen. Prueba con un JPG o PNG.",
  },
  videos: {
    notFound: "Video no encontrado",
    fileOrUrl: "Envía un archivo de video o una url (solo uno de los dos)",
    notReadyToTranslate: "Espera a que el video termine de prepararse para traducirlo a otro idioma.",
    stillPreparing: "El video todavía se está preparando",
    queueUnavailable: "La cola de trabajos no está disponible en este momento. Intenta de nuevo en unos segundos.",
  },
  export: {
    originalMissing: "El video original todavía no está disponible.",
    noSubtitles: "Todavía no hay subtítulos traducidos para incrustar.",
  },
  summary: {
    waitForTranslation: "Espera a que termine la traducción para resumirla.",
    noTranscript: "Todavía no hay transcripción para resumir.",
    notFound: "Este video todavía no tiene resumen.",
  },
  audio: {
    noVoice: "Todavía no hay voz sintética para este idioma.",
    waitForTranslation: "Espera a que termine la traducción para generar el audio.",
    noTranslation: "Todavía no hay traducción para narrar.",
    /** The frontend recognizes this text to show a specific explanation. */
    interrupted: "El servidor se quedó sin memoria o se reinició mientras generaba el audio. Prueba con un video más corto.",
  },
  processing: {
    videoMissing: (id: string) => `Video ${id} no existe`,
    noAudioTrack: "El video no tiene pista de audio",
    noAudioExtracted: "No se obtuvo audio del video",
    originalUnavailable: "El video original no está disponible",
    noSubtitlesYet: "El video todavía no tiene subtítulos",
    noTranscriptYet: "El video todavía no tiene transcripción",
    noTranslationYet: "El video todavía no tiene traducción",
    nothingToNarrate: "La traducción no tiene texto para narrar",
    noVoiceFor: (language: string) => `No hay voz sintética para el idioma ${language}`,
  },
};
