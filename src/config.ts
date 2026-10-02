import "dotenv/config";
import { z } from "zod";

// Todas las claves y parámetros vienen de variables de entorno; nada se
// hardcodea. Si falta algo obligatorio, el proceso falla al arrancar.
const esquema = z.object({
  PORT: z.coerce.number().default(3000),
  CORS_ORIGIN: z.string().default("*"),
  MAX_UPLOAD_MB: z.coerce.number().default(500),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  S3_BUCKET: z.string().min(1),
  S3_REGION: z.string().default("us-east-1"),
  S3_ENDPOINT: z.string().optional().transform((v) => v || undefined),
  S3_FORCE_PATH_STYLE: z
    .string()
    .optional()
    .transform((v) => v === "true"),

  OPENAI_API_KEY: z.string().min(1),
  STT_MODEL: z.string().default("whisper-1"),

  ANTHROPIC_API_KEY: z.string().min(1),
  CLAUDE_MODEL: z.string().default("claude-opus-5-5"),
  CLAUDE_EFFORT: z.enum(["low", "medium", "high", "xhigh", "max"]).default("low"),

  SEGMENTO_SEGUNDOS: z.coerce.number().min(5).max(60).default(20),
  MAX_INTENTOS_SEGMENTO: z.coerce.number().min(1).default(4),
  MAX_CHARS_SEGMENTO: z.coerce.number().default(2000),
  MAX_CHARS_CONTEXTO: z.coerce.number().default(600),
  WORKER_CONCURRENCIA_VIDEOS: z.coerce.number().default(2),
  WORKER_CONCURRENCIA_REINTENTOS: z.coerce.number().default(4),

  FFMPEG_PATH: z.string().default("ffmpeg"),
  FFPROBE_PATH: z.string().default("ffprobe"),
  YTDLP_PATH: z.string().default("yt-dlp"),
});

const resultado = esquema.safeParse(process.env);
if (!resultado.success) {
  console.error("Configuración inválida:", z.prettifyError(resultado.error));
  process.exit(1);
}

export const config = resultado.data;
