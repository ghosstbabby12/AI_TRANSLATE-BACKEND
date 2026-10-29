import "dotenv/config";
import { z } from "zod";

// Todas las claves y parámetros vienen de variables de entorno; nada se
// hardcodea. Si falta algo obligatorio, el proceso falla al arrancar.
const esquema = z.object({
  PORT: z.coerce.number().default(3000),
  CORS_ORIGIN: z.string().default("*"),
  MAX_UPLOAD_MB: z.coerce.number().default(500),

  // Firma los tokens de sesión. Debe ser larga y aleatoria, y distinta por entorno.
  JWT_SECRET: z.string().min(32, "Debe tener al menos 32 caracteres"),
  JWT_EXPIRA: z.string().default("7d"),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  S3_BUCKET: z.string().min(1),
  S3_REGION: z.string().default("us-east-1"),
  S3_ENDPOINT: z.string().optional().transform((v) => v || undefined),
  // Host que ve el navegador al reproducir (p. ej. http://localhost:8333 con SeaweedFS
  // en Docker, donde S3_ENDPOINT es http://s3:8333). Vacío = S3_ENDPOINT.
  S3_PUBLIC_ENDPOINT: z.string().optional().transform((v) => v || undefined),
  S3_FORCE_PATH_STYLE: z
    .string()
    .optional()
    .transform((v) => v === "true"),

  // "simulada" reemplaza STT y LLM por texto de prueba: sirve para probar todo
  // el sistema sin claves ni costo. Las claves solo se exigen en modo "real".
  IA_MODO: z.enum(["real", "simulada"]).default("real"),
  // Fracción de llamadas simuladas que fallan, para ver los reintentos en acción
  IA_SIMULADA_FALLOS: z.coerce.number().min(0).max(1).default(0.1),

  // Proveedor de cada paso. Groq tiene plan gratuito (con límites) y ofrece
  // Whisper y modelos abiertos con la misma API que OpenAI.
  STT_PROVEEDOR: z.enum(["openai", "groq"]).default("openai"),
  TRADUCCION_PROVEEDOR: z.enum(["claude", "groq"]).default("claude"),

  OPENAI_API_KEY: z.string().optional(),
  STT_MODEL: z.string().default("whisper-1"),

  GROQ_API_KEY: z.string().optional(),
  GROQ_BASE_URL: z.string().default("https://api.groq.com/openai/v1"),
  GROQ_STT_MODEL: z.string().default("whisper-large-v3-turbo"),
  // Groq retira modelos a menudo: ver https://console.groq.com/docs/models
  GROQ_MODELO_TRADUCCION: z.string().default("openai/gpt-oss-120b"),

  ANTHROPIC_API_KEY: z.string().optional(),
  CLAUDE_MODEL: z.string().default("claude-opus-5-5"),
  CLAUDE_EFFORT: z.enum(["low", "medium", "high", "xhigh", "max"]).default("low"),

  SEGMENTO_SEGUNDOS: z.coerce.number().min(5).max(60).default(20),
  MAX_INTENTOS_SEGMENTO: z.coerce.number().min(1).default(4),
  MAX_CHARS_SEGMENTO: z.coerce.number().default(2000),
  MAX_CHARS_CONTEXTO: z.coerce.number().default(600),
  // true = la API también consume las colas (plan gratuito de Render, sin workers)
  WORKER_EN_API: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  WORKER_CONCURRENCIA_VIDEOS: z.coerce.number().default(2),
  WORKER_CONCURRENCIA_REINTENTOS: z.coerce.number().default(4),

  FFMPEG_PATH: z.string().default("ffmpeg"),
  FFPROBE_PATH: z.string().default("ffprobe"),
  YTDLP_PATH: z.string().default("yt-dlp"),
}).superRefine((c, ctx) => {
  if (c.IA_MODO !== "real") return;
  // Solo se exigen las claves de los proveedores elegidos.
  const requeridas = new Set<"OPENAI_API_KEY" | "ANTHROPIC_API_KEY" | "GROQ_API_KEY">([
    c.STT_PROVEEDOR === "groq" ? "GROQ_API_KEY" : "OPENAI_API_KEY",
    c.TRADUCCION_PROVEEDOR === "groq" ? "GROQ_API_KEY" : "ANTHROPIC_API_KEY",
  ]);
  for (const clave of requeridas) {
    if (!c[clave]) {
      ctx.addIssue({
        code: "custom",
        path: [clave],
        message: `Obligatoria con IA_MODO=real, STT_PROVEEDOR=${c.STT_PROVEEDOR} y TRADUCCION_PROVEEDOR=${c.TRADUCCION_PROVEEDOR}`,
      });
    }
  }
});

const resultado = esquema.safeParse(process.env);
if (!resultado.success) {
  console.error("Configuración inválida:", z.prettifyError(resultado.error));
  process.exit(1);
}

export const config = resultado.data;

if (config.IA_MODO === "simulada") {
  console.warn("IA_MODO=simulada: la transcripción y la traducción son texto de prueba, no IA real.");
} else {
  console.log(`IA real: transcripción con ${config.STT_PROVEEDOR}, traducción con ${config.TRADUCCION_PROVEEDOR}`);
}
