import { jwtVerify, SignJWT } from "jose";
import { config } from "../config.js";

const clave = new TextEncoder().encode(config.JWT_SECRET);
const EMISOR = "traductor-video";

export async function firmarToken(usuarioId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(usuarioId)
    .setIssuer(EMISOR)
    .setIssuedAt()
    .setExpirationTime(config.JWT_EXPIRA)
    .sign(clave);
}

/** Devuelve el id del usuario, o null si el token es inválido o expiró. */
export async function verificarToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, clave, { issuer: EMISOR, algorithms: ["HS256"] });
    return payload.sub ?? null;
  } catch {
    return null;
  }
}
