import type { SegmentStatus } from "../domain/segment.js";
import type { SourceType, TaskStatus, VideoStatus } from "../domain/video.js";

/**
 * The database and the public API keep their original Spanish values
 * ("pendiente", "listo"…). The code works with English values; these
 * dictionaries translate in both directions at the edges of the system.
 */
function codec<T extends string>(map: Record<T, string>) {
  const reverse = Object.fromEntries(Object.entries(map).map(([k, v]) => [v, k])) as Record<string, T>;
  return {
    encode: (value: T) => map[value],
    decode: (code: string) => {
      const value = reverse[code];
      if (!value) throw new Error(`Unknown code: ${code}`);
      return value;
    },
    encodeNullable: (value: T | null) => (value === null ? null : map[value]),
    decodeNullable: (code: string | null): T | null => (code === null ? null : reverse[code]!),
  };
}

export const videoStatusCode = codec<VideoStatus>({
  pending: "pendiente",
  processing: "procesando",
  completed: "completo",
  failed: "error",
});

export const segmentStatusCode = codec<SegmentStatus>({
  pending: "pendiente",
  processing: "procesando",
  ready: "listo",
  failed: "error",
});

export const taskStatusCode = codec<TaskStatus>({
  processing: "procesando",
  ready: "listo",
  failed: "error",
});

export const sourceTypeCode = codec<SourceType>({ file: "archivo", url: "url" });
