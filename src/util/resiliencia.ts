/** Error para cuando una dependencia (base de datos, Redis) no responde: la API devuelve 503. */
export class ServicioNoDisponible extends Error {
  constructor(message = "El servicio no está disponible en este momento. Intenta de nuevo en unos segundos.") {
    super(message);
    this.name = "ServicioNoDisponible";
  }
}

/** Rechaza si la promesa no termina en `ms` (la operación original sigue, pero nadie la espera). */
export function conTiempoLimite<T>(promesa: Promise<T>, ms: number, mensaje?: string): Promise<T> {
  let temporizador: ReturnType<typeof setTimeout>;
  const limite = new Promise<never>((_, rechazar) => {
    temporizador = setTimeout(() => rechazar(new ServicioNoDisponible(mensaje)), ms);
  });
  return Promise.race([promesa, limite]).finally(() => clearTimeout(temporizador));
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Repite `tarea` con backoff (2 s, 4 s, 8 s… hasta 60 s) hasta que funcione.
 * Para tareas de arranque que no deben tumbar el proceso si una dependencia
 * todavía no está lista (base de datos despertando, Redis reiniciándose…).
 */
export async function reintentarHastaLograr<T>(
  nombre: string,
  tarea: () => Promise<T>,
  alFallar?: (err: unknown) => void,
): Promise<T> {
  for (let intento = 1; ; intento++) {
    try {
      const resultado = await tarea();
      if (intento > 1) console.log(`[arranque] ${nombre}: listo tras ${intento} intentos`);
      return resultado;
    } catch (err) {
      alFallar?.(err);
      const espera = Math.min(2_000 * 2 ** (intento - 1), 60_000);
      console.error(`[arranque] ${nombre} falló (intento ${intento}), reintento en ${espera / 1000}s: ${describirError(err)}`);
      await esperar(espera);
    }
  }
}

/** Errores de red / conexión de pg, ioredis y Node: indican dependencia caída, no un bug. */
export function esErrorDeConexion(err: unknown): boolean {
  if (err instanceof ServicioNoDisponible) return true;
  const e = err as { code?: string; message?: string } | null;
  const codigos = ["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN", "EPIPE", "57P01", "57P03", "53300"];
  if (e?.code && codigos.includes(e.code)) return true;
  return /timeout|terminated|Connection is closed|Stream isn't writeable|getaddrinfo/i.test(e?.message ?? "");
}

/** Descripción corta y sin datos sensibles (no incluye URLs ni contraseñas). */
export function describirError(err: unknown): string {
  const e = err as { code?: string; message?: string } | null;
  const texto = (e?.message ?? String(err)).replace(/\b\w+:\/\/\S+/g, "<url>");
  return e?.code ? `${e.code}: ${texto}` : texto;
}

/** Evita llenar los logs cuando una dependencia cae: un aviso por minuto como mucho. */
export function logLimitado(etiqueta: string) {
  let ultimo = 0;
  return (err: unknown) => {
    const ahora = Date.now();
    if (ahora - ultimo < 60_000) return;
    ultimo = ahora;
    console.error(`[${etiqueta}] ${describirError(err)}`);
  };
}
