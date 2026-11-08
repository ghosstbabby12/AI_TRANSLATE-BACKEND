import { crearConexionRedisRapida } from "../queue/colas.js";
import { conTiempoLimite, describirError } from "../util/resiliencia.js";

// Frena ataques de fuerza bruta: como mucho MAX intentos fallidos por
// IP + email en VENTANA_S segundos. En Redis para que valga con varias
// instancias de la API.
const MAX = 10;
const VENTANA_S = 15 * 60;

const redis = crearConexionRedisRapida();
const clave = (ip: string, email: string) => `login-fallido:${ip}:${email}`;

/**
 * Si Redis no responde, el límite se omite ("falla abierto"): es mejor
 * permitir el login sin contador por un rato que impedirle entrar a todos.
 */
async function seguro<T>(operacion: () => Promise<T>, siFalla: T): Promise<T> {
  try {
    return await conTiempoLimite(operacion(), 2_000);
  } catch (err) {
    console.warn(`[login] límite de intentos omitido, Redis no responde: ${describirError(err)}`);
    return siFalla;
  }
}

export function bloqueado(ip: string, email: string): Promise<boolean> {
  return seguro(async () => Number(await redis.get(clave(ip, email))) >= MAX, false);
}

export function registrarFallo(ip: string, email: string): Promise<void> {
  return seguro(async () => {
    const k = clave(ip, email);
    const n = await redis.incr(k);
    if (n === 1) await redis.expire(k, VENTANA_S);
  }, undefined);
}

export function limpiarFallos(ip: string, email: string): Promise<void> {
  return seguro(async () => {
    await redis.del(clave(ip, email));
  }, undefined);
}
