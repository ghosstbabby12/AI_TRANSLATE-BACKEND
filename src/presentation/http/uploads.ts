import { tmpdir } from "node:os";
import multer from "multer";
import { config } from "../../config/index.js";

const MB = 1024 * 1024;

export const videoUpload = multer({
  dest: tmpdir(),
  limits: { fileSize: config.maxUploadMb * MB, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, /^(video|audio)\//.test(file.mimetype)),
});

export const photoUpload = multer({
  dest: tmpdir(),
  limits: { fileSize: 5 * MB, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype.startsWith("image/")),
});

/**
 * multer decodes file names as Latin-1, so non-ASCII characters arrive broken
 * (macOS, for instance, puts a narrow space U+202F before "p.m." in screen
 * recordings). If it was not valid UTF-8, the name is kept as it came.
 */
export function originalFileName(name: string): string {
  const utf8 = Buffer.from(name, "latin1").toString("utf8");
  return utf8.includes("�") ? name : utf8;
}
