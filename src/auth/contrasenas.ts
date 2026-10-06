import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

// scrypt viene con Node: hash lento y con sal, sin dependencias nativas (bcrypt
// necesita compilarse para cada arquitectura). Formato guardado:
//   scrypt$N$r$p$<sal base64>$<hash base64>
const N = 16384;
const R = 8;
const P = 1;
const LARGO = 64;

function derivar(password: string, sal: Buffer, opciones: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, sal, LARGO, opciones, (err, clave) => (err ? reject(err) : resolve(clave))),
  );
}

export async function hashContrasena(password: string): Promise<string> {
  const sal = randomBytes(16);
  const hash = await derivar(password, sal, { N, r: R, p: P });
  return ["scrypt", N, R, P, sal.toString("base64"), hash.toString("base64")].join("$");
}

export async function verificarContrasena(password: string, guardado: string): Promise<boolean> {
  const [algoritmo, n, r, p, sal, hash] = guardado.split("$");
  if (algoritmo !== "scrypt" || !sal || !hash) return false;
  const esperado = Buffer.from(hash, "base64");
  const calculado = await derivar(password, Buffer.from(sal, "base64"), { N: +n, r: +r, p: +p });
  // Comparación en tiempo constante: no filtra cuántos bytes coinciden
  return calculado.length === esperado.length && timingSafeEqual(calculado, esperado);
}

/** Hash ficticio para que un email inexistente tarde lo mismo que uno real. */
export const HASH_FICTICIO = await hashContrasena(randomBytes(16).toString("hex"));
