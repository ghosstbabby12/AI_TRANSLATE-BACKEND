import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "../config.js";

// Las credenciales las toma el SDK de AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
// (o del rol IAM si corre en AWS). S3_ENDPOINT permite usar R2 o MinIO.
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

/** URL temporal para que el reproductor del frontend lea el video directo de S3. */
export async function urlFirmada(key: string, segundos = 3600): Promise<string> {
  return getSignedUrl(s3Publico, new GetObjectCommand({ Bucket: config.S3_BUCKET, Key: key }), {
    expiresIn: segundos,
  });
}
