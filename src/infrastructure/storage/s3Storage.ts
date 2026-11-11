import { createReadStream, createWriteStream } from "node:fs";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { FileStorage } from "../../application/ports/services.js";
import { config } from "../../config/index.js";

// Credentials come from AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY. S3_ENDPOINT allows R2 or SeaweedFS.
const { bucket, region, endpoint, publicEndpoint, forcePathStyle } = config.s3;
const client = new S3Client({ region, endpoint, forcePathStyle });
// URLs opened by the browser are signed with the public host (the signature includes it).
const publicClient = publicEndpoint ? new S3Client({ region, endpoint: publicEndpoint, forcePathStyle }) : client;

const getObject = (key: string, downloadName?: string) =>
  new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    ResponseContentDisposition: downloadName ? `attachment; filename="${downloadName}"` : undefined,
  });

export const s3Storage: FileStorage = {
  /** Streaming multipart upload: the video is never fully loaded in memory. */
  async upload(key, localPath, contentType) {
    const params = { Bucket: bucket, Key: key, Body: createReadStream(localPath), ContentType: contentType };
    await new Upload({ client, params }).done();
  },

  async download(key, localPath) {
    const res = await client.send(getObject(key));
    await pipeline(res.Body as Readable, createWriteStream(localPath));
  },

  async downloadBuffer(key) {
    const res = await client.send(getObject(key));
    return Buffer.from(await res.Body!.transformToByteArray());
  },

  signedUrl: (key, seconds = 3600, downloadName) => getSignedUrl(publicClient, getObject(key, downloadName), { expiresIn: seconds }),

  internalUrl: (key, seconds = 600) => getSignedUrl(client, getObject(key), { expiresIn: seconds }),

  async delete(key) {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  },

  /** Deletes everything under a prefix (e.g. "videos/<id>/"), 1000 at a time. */
  async deletePrefix(prefix) {
    let deleted = 0;
    let token: string | undefined;
    do {
      const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
      const objects = (page.Contents ?? []).flatMap((o) => (o.Key ? [{ Key: o.Key }] : []));
      if (objects.length > 0) {
        await client.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objects, Quiet: true } }));
        deleted += objects.length;
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return deleted;
  },
};
