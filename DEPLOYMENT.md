# Deployment Guide (Free + Easy)

## Recommended Option

- Frontend: Vercel (free)
- Backend + AI Layer: single Hugging Face Space (Docker)
- Database: MongoDB Atlas M0 free tier

The backend and AI layer ship in one container (see the root [Dockerfile](Dockerfile)
and [start.sh](start.sh)). The backend talks to the AI layer in-process at
`http://127.0.0.1:8000`, so there is no separate AI service to manage.

Render is no longer used. For the full step-by-step, see
[HF_VERCEL_DEPLOYMENT.md](HF_VERCEL_DEPLOYMENT.md). For a self-hosted Docker
Compose setup, see [OPEN_SOURCE_DEPLOYMENT.md](OPEN_SOURCE_DEPLOYMENT.md).

## Security First (Must Do Before Deploy)

1. Rotate all previously exposed API keys immediately.
2. Never store real keys in `.env.example` or source files.
3. Keep real values only in deployment environment variables.
4. Use strict CORS with your real frontend URL (`CLIENT_ORIGIN`).

## Environment Variables

Hugging Face Space (backend + AI):

- `MONGO_URI` = your Atlas URI
- `CLIENT_ORIGIN` = your Vercel frontend URL
- `AI_POLL_INTERVAL_MS` = `1500`
- `GROQ_API_KEY`
- `HF_TOKEN` and/or `HF_API_KEY`
- `GROQ_MODEL` = `openai/gpt-oss-120b`
- `HF_PROVIDER` = `nscale`
- `HF_IMAGE_MODEL` = `stabilityai/stable-diffusion-xl-base-1.0`
- `IMAGE_SOURCE` = `pexels`
- `PEXELS_API_KEY` (if stock image source enabled)
- Leave `AI_LAYER_URL` unset (defaults to `http://127.0.0.1:8000`).

Frontend (Vercel):

- `VITE_BACKEND_URL` = your Hugging Face Space URL

## Validate Health

- Backend: `/health`
- AI Layer (proxied via backend): `/health/ai`
- Frontend loads and can create books

## Post-Deployment Checklist

- Verify Create Book flow (English and Hindi)
- Verify page generation and page navigation
- Verify audio generation endpoint
- Verify feedback endpoints:
  - `POST /api/feedback/upgrade-request`
  - `POST /api/feedback/suggestion`
- Verify no secrets appear in logs
