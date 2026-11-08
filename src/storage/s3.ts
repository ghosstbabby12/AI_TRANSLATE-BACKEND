import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "../config.js";

// Las credenciales las toma el SDK de AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
// (o del rol IAM si corre en AWS). S3_ENDPOINT permite usar R2 o SeaweedFS.
const s3 = new S3Client({
  region: config.S3_REGION,
  endpoint: config.S3_ENDPOINT,
  forcePathStyle: config.S3_FORCE_PATH_STYLE,
});

// Cliente solo para firmar URLs que abrirá el navegador (la firma incluye el host).
const s3Publico = config.S3_PUBLIC_ENDPOINT
  ? new S3Client({ region: config.S3_REGION, endpoint: config.S3_PUBLIC_ENDPOINT, forcePathStyle: config.S3_FORCE_PATH_STYLE })
  : s3;

export const claves = {
  videoOriginal: (videoId: string, ext: string) => `videos/${videoId}/original${ext}`,
  videoSubtitulado: (videoId: string) => `videos/${videoId}/subtitulado.mp4`,
  audioSegmento: (videoId: string, indice: number) =>
    `videos/${videoId}/segmentos/${String(indice).padStart(5, "0")}.mp3`,
};

/** Subida multipart en streaming: no carga el video entero en memoria. */
export async function subirArchivo(key: string, rutaLocal: string, contentType: string): Promise<void> {
  await new Upload({
    client: s3,
    params: { Bucket: config.S3_BUCKET, Key: key, Body: createReadStream(rutaLocal), ContentType: contentType },
  }).done();
}

export async function descargarArchivo(key: string, rutaLocal: string): Promise<void> {
  const res = await s3.send(new GetObjectCommand({ Bucket: config.S3_BUCKET, Key: key }));
  await pipeline(res.Body as Readable, createWriteStream(rutaLocal));
}

export async function descargarBuffer(key: string): Promise<Buffer> {
  const res = await s3.send(new GetObjectCommand({ Bucket: config.S3_BUCKET, Key: key }));
  return Buffer.from(await res.Body!.transformToByteArray());
}

/**
 * URL temporal para que el navegador lea el archivo directo de S3/R2.
 * Con `nombreDescarga`, el navegador lo descarga con ese nombre en vez de abrirlo.
 */
export async function urlFirmada(key: string, segundos = 3600, nombreDescarga?: string): Promise<string> {
  const comando = new GetObjectCommand({
    Bucket: config.S3_BUCKET,
    Key: key,
    ResponseContentDisposition: nombreDescarga ? `attachment; filename="${nombreDescarga}"` : undefined,
  });
  return getSignedUrl(s3Publico, comando, { expiresIn: segundos });
}

export async function borrarObjeto(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: config.S3_BUCKET, Key: key }));
}

/** Borra todo lo que cuelga de un prefijo (p. ej. "videos/<id>/"), de a 1000. */
export async function borrarPrefijo(prefijo: string): Promise<number> {
  let borrados = 0;
  let token: string | undefined;
  do {
    const lista = await s3.send(
      new ListObjectsV2Command({ Bucket: config.S3_BUCKET, Prefix: prefijo, ContinuationToken: token }),
    );
    const claves = (lista.Contents ?? []).flatMap((o) => (o.Key ? [{ Key: o.Key }] : []));
    if (claves.length > 0) {
      await s3.send(new DeleteObjectsCommand({ Bucket: config.S3_BUCKET, Delete: { Objects: claves, Quiet: true } }));
      borrados += claves.length;
    }
    token = lista.IsTruncated ? lista.NextContinuationToken : undefined;
  } while (token);
  return borrados;
}
