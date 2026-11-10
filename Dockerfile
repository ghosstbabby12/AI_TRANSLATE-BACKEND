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
# ffmpeg/ffprobe para el audio, fuente para incrustar subtítulos, yt-dlp (binario autónomo de la arquitectura correcta) para los links,
# y Piper (voz sintética libre que corre en la CPU) para el audio de la traducción. Las voces se descargan al primer uso.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates curl fonts-dejavu-core \
 && case "$TARGETARCH" in arm64) YTDLP=yt-dlp_linux_aarch64; PIPER=piper_linux_aarch64.tar.gz ;; *) YTDLP=yt-dlp_linux; PIPER=piper_linux_x86_64.tar.gz ;; esac \
 && curl -fsSL -o /usr/local/bin/yt-dlp "https://github.com/yt-dlp/yt-dlp/releases/latest/download/$YTDLP" \
 && chmod +x /usr/local/bin/yt-dlp \
 && curl -fsSL "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/$PIPER" | tar -xz -C /opt \
 && apt-get purge -y curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY migrations ./migrations

USER node
EXPOSE 3000
# Por defecto arranca la API, que abre el puerto de inmediato y aplica las
# migraciones en segundo plano (con reintentos si la base no responde).
# El worker (docker compose) sobrescribe el comando con `node dist/worker.js`.
CMD ["node", "dist/server.js"]
