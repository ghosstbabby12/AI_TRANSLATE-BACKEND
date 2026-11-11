import "dotenv/config";
import { z } from "zod";
import { envSchema, type Env } from "./envSchema.js";

function load(): Env {
  const result = envSchema.safeParse(process.env);
  if (result.success) return result.data;
  console.error("Invalid configuration:", z.prettifyError(result.error));
  process.exit(1);
}

const env = load();

/** Application settings with readable names, built from the environment. */
export const config = {
  port: env.PORT,
  corsOrigin: env.CORS_ORIGIN,
  maxUploadMb: env.MAX_UPLOAD_MB,
  jwt: { secret: env.JWT_SECRET, expiresIn: env.JWT_EXPIRA },
  databaseUrl: env.DATABASE_URL,
  redisUrl: env.REDIS_URL,
  s3: {
    bucket: env.S3_BUCKET,
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    publicEndpoint: env.S3_PUBLIC_ENDPOINT,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
  },
  ai: {
    simulated: env.IA_MODO === "simulada",
    simulatedFailureRate: env.IA_SIMULADA_FALLOS,
    sttProvider: env.STT_PROVEEDOR,
    textProvider: env.TRADUCCION_PROVEEDOR,
    openai: { apiKey: env.OPENAI_API_KEY, sttModel: env.STT_MODEL },
    groq: {
      apiKey: env.GROQ_API_KEY,
      baseUrl: env.GROQ_BASE_URL,
      sttModel: env.GROQ_STT_MODEL,
      textModel: env.GROQ_MODELO_TRADUCCION,
    },
    claude: { apiKey: env.ANTHROPIC_API_KEY, model: env.CLAUDE_MODEL, effort: env.CLAUDE_EFFORT },
  },
  segments: {
    seconds: env.SEGMENTO_SEGUNDOS,
    maxAttempts: env.MAX_INTENTOS_SEGMENTO,
    maxChars: env.MAX_CHARS_SEGMENTO,
    maxContextChars: env.MAX_CHARS_CONTEXTO,
  },
  maxSummaryChars: env.MAX_CHARS_RESUMEN,
  workers: {
    runInsideApi: env.WORKER_EN_API,
    videoConcurrency: env.WORKER_CONCURRENCIA_VIDEOS,
    retryConcurrency: env.WORKER_CONCURRENCIA_REINTENTOS,
  },
  binaries: { ffmpeg: env.FFMPEG_PATH, ffprobe: env.FFPROBE_PATH, ytDlp: env.YTDLP_PATH, piper: env.PIPER_PATH },
  voicesDir: env.VOCES_DIR,
};

if (config.ai.simulated) {
  console.warn("IA_MODO=simulada: transcription and translation return sample text, not real AI.");
} else {
  console.log(`Real AI: transcription with ${config.ai.sttProvider}, translation with ${config.ai.textProvider}`);
}
