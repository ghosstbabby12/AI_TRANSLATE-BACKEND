import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Router, type Request, type Response } from "express";
import multer from "multer";
import { z } from "zod";
import { hashContrasena, verificarContrasena } from "../../auth/contrasenas.js";
import { procesarFotoPerfil } from "../../media/ffmpeg.js";
import {
  actualizarContrasena,
  actualizarFoto,
  actualizarPerfil,
  aPublico,
  obtenerUsuario,
  type Usuario,
} from "../../repositories/usuarios.repo.js";
import { borrarObjeto, claves, subirArchivo } from "../../storage/s3.js";
import { describirError } from "../../util/resiliencia.js";

export const perfilRouter = Router();

const subirFoto = multer({
  dest: tmpdir(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype.startsWith("image/")),
});

// "" o null en el teléfono = quitarlo. Se aceptan +, espacios, guiones y paréntesis.
const telefono = z
  .union([z.string().trim(), z.null()])
  .transform((t) => (t ? t : null))
  .refine((t) => t === null || /^\+?[\d\s\-()]{7,20}$/.test(t), "Teléfono inválido (7 a 20 dígitos, puede empezar con +)");

const esquemaPerfil = z.object({
  nombre: z.string().trim().min(1, "Escribe tu nombre").max(100).optional(),
  email: z.email("Email inválido").trim().toLowerCase().max(254).optional(),
  telefono: telefono.optional(),
  idioma_interfaz: z.enum(["es", "en"]).optional(),
  // Obligatoria solo para cambiar el email
  contrasena_actual: z.string().max(200).optional(),
});

const esquemaContrasena = z.object({
  actual: z.string().min(1, "Escribe tu contraseña actual").max(200),
  nueva: z.string().min(8, "La contraseña nueva debe tener al menos 8 caracteres").max(200),
});

/** El usuario de la sesión, o responde 401 si la cuenta ya no existe. */
async function usuarioActual(req: Request, res: Response): Promise<Usuario | null> {
  const usuario = await obtenerUsuario(req.usuarioId!);
  if (!usuario) res.status(401).json({ error: "Sesión inválida" });
  return usuario;
}

/** GET /perfil */
perfilRouter.get("/", async (req, res) => {
  const usuario = await usuarioActual(req, res);
  if (usuario) res.json(await aPublico(usuario));
});

/**
 * PATCH /perfil — nombre, email, teléfono e idioma de la interfaz.
 * Cambiar el email exige la contraseña actual: es el dato con el que se
 * inicia sesión, así que una sesión robada no debe poder cambiarlo sola.
 */
perfilRouter.patch("/", async (req, res) => {
  const usuario = await usuarioActual(req, res);
  if (!usuario) return;
  const { contrasena_actual, ...cambios } = esquemaPerfil.parse(req.body);

  if (cambios.email && cambios.email !== usuario.email) {
    if (!contrasena_actual || !(await verificarContrasena(contrasena_actual, usuario.password_hash))) {
      res.status(403).json({ error: "Para cambiar el email, confirma tu contraseña actual." });
      return;
    }
  }

  const actualizado = await actualizarPerfil(usuario.id, cambios);
  if (!actualizado) {
    res.status(409).json({ error: "Ya existe una cuenta con ese email" });
    return;
  }
  res.json(await aPublico(actualizado));
});

/** POST /perfil/contrasena — exige la actual. */
perfilRouter.post("/contrasena", async (req, res) => {
  const usuario = await usuarioActual(req, res);
  if (!usuario) return;
  const { actual, nueva } = esquemaContrasena.parse(req.body);
  if (!(await verificarContrasena(actual, usuario.password_hash))) {
    res.status(403).json({ error: "La contraseña actual no es correcta" });
    return;
  }
  await actualizarContrasena(usuario.id, await hashContrasena(nueva));
  res.status(204).end();
});

/** POST /perfil/foto — multipart, campo "foto". Se recorta a 256×256 y se guarda en S3. */
perfilRouter.post("/foto", subirFoto.single("foto"), async (req, res) => {
  const archivo = req.file;
  const dir = await mkdtemp(path.join(tmpdir(), "foto-"));
  try {
    const usuario = await usuarioActual(req, res);
    if (!usuario) return;
    if (!archivo) {
      res.status(400).json({ error: "Sube una imagen (JPG, PNG o WebP de hasta 5 MB)" });
      return;
    }

    const salida = path.join(dir, "foto.jpg");
    try {
      await procesarFotoPerfil(archivo.path, salida);
    } catch {
      res.status(400).json({ error: "No se pudo leer la imagen. Prueba con un JPG o PNG." });
      return;
    }
    const key = claves.fotoPerfil(usuario.id);
    await subirArchivo(key, salida, "image/jpeg");
    const anterior = await actualizarFoto(usuario.id, key);
    if (anterior) borrarObjeto(anterior).catch((e) => console.warn(`[perfil] foto anterior sin borrar: ${describirError(e)}`));

    res.json(await aPublico((await obtenerUsuario(usuario.id))!));
  } finally {
    if (archivo) await rm(archivo.path, { force: true });
    await rm(dir, { recursive: true, force: true });
  }
});

/** DELETE /perfil/foto */
perfilRouter.delete("/foto", async (req, res) => {
  const usuario = await usuarioActual(req, res);
  if (!usuario) return;
  const anterior = await actualizarFoto(usuario.id, null);
  if (anterior) borrarObjeto(anterior).catch((e) => console.warn(`[perfil] foto sin borrar: ${describirError(e)}`));
  res.json(await aPublico((await obtenerUsuario(usuario.id))!));
});
