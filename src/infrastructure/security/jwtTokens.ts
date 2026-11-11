import { jwtVerify, SignJWT } from "jose";
import type { TokenService } from "../../application/ports/services.js";
import { config } from "../../config/index.js";

const secret = new TextEncoder().encode(config.jwt.secret);
// Changing the issuer would sign every user out.
const ISSUER = "traductor-video";

export const jwtTokens: TokenService = {
  sign: (userId) =>
    new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(userId)
      .setIssuer(ISSUER)
      .setIssuedAt()
      .setExpirationTime(config.jwt.expiresIn)
      .sign(secret),

  async verify(token) {
    try {
      const { payload } = await jwtVerify(token, secret, { issuer: ISSUER, algorithms: ["HS256"] });
      return payload.sub ?? null;
    } catch {
      return null;
    }
  },
};
