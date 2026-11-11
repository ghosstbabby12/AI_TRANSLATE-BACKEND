import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";
import type { PasswordHasher } from "../../application/ports/services.js";

// scrypt ships with Node: slow, salted hashing without native dependencies.
// Stored format: scrypt$N$r$p$<salt base64>$<hash base64>
const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;

function derive(password: string, salt: Buffer, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, KEY_LENGTH, options, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

async function hash(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, { N, r: R, p: P });
  return ["scrypt", N, R, P, salt.toString("base64"), key.toString("base64")].join("$");
}

async function verify(password: string, stored: string): Promise<boolean> {
  const [algorithm, n, r, p, salt, key] = stored.split("$");
  if (algorithm !== "scrypt" || !salt || !key) return false;
  const expected = Buffer.from(key, "base64");
  const actual = await derive(password, Buffer.from(salt, "base64"), { N: +n!, r: +r!, p: +p! });
  // Constant-time comparison: does not leak how many bytes match
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export const scryptPasswords: PasswordHasher = {
  hash,
  verify,
  dummyHash: await hash(randomBytes(16).toString("hex")),
};
