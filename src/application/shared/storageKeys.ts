/** Where each file lives in object storage. The paths are stored in the database: do not change them. */
const folderOf = (fileKey: string) => fileKey.slice(0, fileKey.lastIndexOf("/") + 1);

export const storageKeys = {
  originalVideo: (videoId: string, extension: string) => `videos/${videoId}/original${extension}`,
  subtitledVideo: (videoId: string) => `videos/${videoId}/subtitulado.mp4`,
  translationAudio: (videoId: string) => `videos/${videoId}/audio-traduccion.mp3`,
  /** Next to the original, so every translation of the file shares it. */
  thumbnail: (fileKey: string) => `${folderOf(fileKey)}miniatura.jpg`,
  segmentAudio: (videoId: string, index: number) => `videos/${videoId}/segmentos/${String(index).padStart(5, "0")}.mp3`,
  /** Timestamped name: a new photo gets a new URL, so the browser never shows a cached old one. */
  profilePhoto: (userId: string) => `usuarios/${userId}/foto-${Date.now()}.jpg`,
  folderOf,
};
