import { z } from "zod";

const flag = z.string().optional().transform((v) => v === "true");
const optionalText = z.string().optional().transform((v) => v || undefined);

/** Environment variables. Their names are part of the deployment and stay unchanged. */
export const envSchema = z
  .object({
    PORT: z.coerce.number().default(3000),
    CORS_ORIGIN: z.string().default("*"),
    MAX_UPLOAD_MB: z.coerce.number().default(500),

    JWT_SECRET: z.string().min(32, "Debe tener al menos 32 caracteres"),
    JWT_EXPIRA: z.string().default("7d"),

    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1),

    S3_BUCKET: z.string().min(1),
    S3_REGION: z.string().default("us-east-1"),
    S3_ENDPOINT: optionalText,
    S3_PUBLIC_ENDPOINT: optionalText,
    S3_FORCE_PATH_STYLE: flag,

    IA_MODO: z.enum(["real", "simulada"]).default("real"),
    IA_SIMULADA_FALLOS: z.coerce.number().min(0).max(1).default(0.1),
    STT_PROVEEDOR: z.enum(["openai", "groq"]).default("openai"),
    TRADUCCION_PROVEEDOR: z.enum(["claude", "groq"]).default("claude"),

    OPENAI_API_KEY: z.string().optional(),
    STT_MODEL: z.string().default("whisper-1"),
    GROQ_API_KEY: z.string().optional(),
    GROQ_BASE_URL: z.string().default("https://api.groq.com/openai/v1"),
    GROQ_STT_MODEL: z.string().default("whisper-large-v3-turbo"),
    GROQ_MODELO_TRADUCCION: z.string().default("openai/gpt-oss-120b"),
    ANTHROPIC_API_KEY: z.string().optional(),
    CLAUDE_MODEL: z.string().default("claude-opus-5-5"),
    CLAUDE_EFFORT: z.enum(["low", "medium", "high", "xhigh", "max"]).default("low"),

    SEGMENTO_SEGUNDOS: z.coerce.number().min(5).max(60).default(20),
    MAX_INTENTOS_SEGMENTO: z.coerce.number().min(1).default(4),
    MAX_CHARS_SEGMENTO: z.coerce.number().default(2000),
    MAX_CHARS_CONTEXTO: z.coerce.number().default(600),
    MAX_CHARS_RESUMEN: z.coerce.number().min(2000).default(16000),

    WORKER_EN_API: flag,
    WORKER_CONCURRENCIA_VIDEOS: z.coerce.number().default(2),
    WORKER_CONCURRENCIA_REINTENTOS: z.coerce.number().default(4),

    FFMPEG_PATH: z.string().default("ffmpeg"),
    FFPROBE_PATH: z.string().default("ffprobe"),
    YTDLP_PATH: z.string().default("yt-dlp"),
    PIPER_PATH: z.string().default("/opt/piper/piper"),
    VOCES_DIR: z.string().default("/tmp/voces-piper"),
  })
  .superRefine((env, ctx) => {
    if (env.IA_MODO !== "real") return;
    // Only the keys of the chosen providers are required.
    const required = new Set<"OPENAI_API_KEY" | "ANTHROPIC_API_KEY" | "GROQ_API_KEY">([
      env.STT_PROVEEDOR === "groq" ? "GROQ_API_KEY" : "OPENAI_API_KEY",
      env.TRADUCCION_PROVEEDOR === "groq" ? "GROQ_API_KEY" : "ANTHROPIC_API_KEY",
    ]);
    for (const key of required) {
      if (env[key]) continue;
      ctx.addIssue({
        code: "custom",
        path: [key],
        message: `Obligatoria con IA_MODO=real, STT_PROVEEDOR=${env.STT_PROVEEDOR} y TRADUCCION_PROVEEDOR=${env.TRADUCCION_PROVEEDOR}`,
      });
    }
  });

export type Env = z.infer<typeof envSchema>;
