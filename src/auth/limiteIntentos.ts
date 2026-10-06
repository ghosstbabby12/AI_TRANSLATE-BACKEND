import { crearConexionRedis } from "../queue/colas.js";

// Frena ataques de fuerza bruta: como mucho MAX intentos fallidos por
// IP + email en VENTANA_S segundos. En Redis para que valga con varias
// instancias de la API.
const MAX = 10;
const VENTANA_S = 15 * 60;

const redis = crearConexionRedis();
const clave = (ip: string, email: string) => `login-fallido:${ip}:${email}`;

export async function bloqueado(ip: string, email: string): Promise<boolean> {
  return Number(await redis.get(clave(ip, email))) >= MAX;
}

export async function registrarFallo(ip: string, email: string): Promise<void> {
  const k = clave(ip, email);
  const n = await redis.incr(k);
  if (n === 1) await redis.expire(k, VENTANA_S);
}

export async function limpiarFallos(ip: string, email: string): Promise<void> {
  await redis.del(clave(ip, email));
}
