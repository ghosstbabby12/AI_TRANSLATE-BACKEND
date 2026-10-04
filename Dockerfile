# Una sola imagen para la API y el worker; cambia solo el comando de arranque.
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-slim
# La pone Docker: arm64 en Mac con chip Apple, amd64 en la mayoría de nubes
ARG TARGETARCH
# ffmpeg/ffprobe para el audio, yt-dlp (binario autónomo de la arquitectura correcta) para los links
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates curl \
 && case "$TARGETARCH" in arm64) YTDLP=yt-dlp_linux_aarch64 ;; *) YTDLP=yt-dlp_linux ;; esac \
 && curl -fsSL -o /usr/local/bin/yt-dlp "https://github.com/yt-dlp/yt-dlp/releases/latest/download/$YTDLP" \
 && chmod +x /usr/local/bin/yt-dlp \
 && apt-get purge -y curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY migrations ./migrations

USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
