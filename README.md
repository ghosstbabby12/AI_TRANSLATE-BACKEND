# Traductor de Video con IA — Backend

API (Express + TypeScript) y worker que extraen el audio de un video, lo dividen en
segmentos, los transcriben (Whisper) y los traducen (Claude), guardando cada segmento
apenas está listo.

Frontend: [AI_Translate-frontend](https://github.com/ghosstbabby12/AI_Translate-frontend)

## Desarrollo local

```bash
cp .env.example .env        # IA_MODO=simulada funciona sin claves
docker compose up --build   # API en :3000 + worker + Postgres + Redis + S3 local (SeaweedFS)
```

## Despliegue

`render.yaml` describe la infraestructura en Render (plan gratuito): la API con el worker
integrado (`WORKER_EN_API=true`), Postgres, Key Value y el frontend (desde su propio repo).
Los videos se guardan en Cloudflare R2. Las claves se configuran en el panel de Render.
