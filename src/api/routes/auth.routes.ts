import { Router } from "express";
import { z } from "zod";
import { HASH_FICTICIO, hashContrasena, verificarContrasena } from "../../auth/contrasenas.js";
import { bloqueado, limpiarFallos, registrarFallo } from "../../auth/limiteIntentos.js";
import { firmarToken } from "../../auth/tokens.js";
import {
  aPublico,
  crearUsuario,
  obtenerUsuario,
  obtenerUsuarioPorEmail,
  reclamarVideosAnonimos,
} from "../../repositories/usuarios.repo.js";
import { requiereUsuario } from "../middleware/usuario.js";

const email = z.email("Email inválido").trim().toLowerCase().max(254);
// Id anónimo que el navegador usaba antes del login, para no perder su historial
const anonimo = z.uuid().optional();

const esquemaRegistro = z.object({
  nombre: z.string().trim().min(1, "Escribe tu nombre").max(100),
  email,
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres").max(200),
  usuario_anonimo: anonimo,
});

const esquemaLogin = z.object({
  email,
  password: z.string().min(1).max(200),
  usuario_anonimo: anonimo,
});

export const authRouter = Router();

/** POST /auth/registro — crea la cuenta y deja la sesión iniciada. */
authRouter.post("/registro", async (req, res) => {
  const datos = esquemaRegistro.parse(req.body);
  const usuario = await crearUsuario({
    nombre: datos.nombre,
    email: datos.email,
    passwordHash: await hashContrasena(datos.password),
  });
  if (!usuario) {
    res.status(409).json({ error: "Ya existe una cuenta con ese email" });
    return;
  }
  if (datos.usuario_anonimo) await reclamarVideosAnonimos(datos.usuario_anonimo, usuario.id);
  res.status(201).json({ token: await firmarToken(usuario.id), usuario: aPublico(usuario) });
});

/** POST /auth/login */
authRouter.post("/login", async (req, res) => {
  const datos = esquemaLogin.parse(req.body);
  const ip = req.ip ?? "desconocida";

  if (await bloqueado(ip, datos.email)) {
    res.status(429).json({ error: "Demasiados intentos fallidos. Espera 15 minutos." });
    return;
  }

  const usuario = await obtenerUsuarioPorEmail(datos.email);
  // Se verifica contra un hash ficticio si el email no existe, para que la
  // respuesta tarde lo mismo y no revele qué emails están registrados.
  const valido = await verificarContrasena(datos.password, usuario?.password_hash ?? HASH_FICTICIO);
  if (!usuario || !valido) {
    await registrarFallo(ip, datos.email);
    res.status(401).json({ error: "Email o contraseña incorrectos" });
    return;
  }

  await limpiarFallos(ip, datos.email);
  if (datos.usuario_anonimo) await reclamarVideosAnonimos(datos.usuario_anonimo, usuario.id);
  res.json({ token: await firmarToken(usuario.id), usuario: aPublico(usuario) });
});

/** GET /auth/yo — datos del usuario de la sesión (valida el token guardado). */
authRouter.get("/yo", requiereUsuario, async (req, res) => {
  const usuario = await obtenerUsuario(req.usuarioId!);
  if (!usuario) {
    res.status(401).json({ error: "Sesión inválida" });
    return;
  }
  res.json(aPublico(usuario));
});
