# Deployment Guide (Free + Easy)

## Recommended Option

Best free/easy deployment for this architecture:

- Frontend: Render Static Site (free)
- Backend: Render Web Service (free)
- AI Layer: Render Web Service (free)
- Database: MongoDB Atlas M0 free tier

Why this is the best fit:

- Simple setup with one platform for all app services
- Works well with Node + Python mixed architecture
- Native environment variable management (no secrets in repo)
- Easy logs and health checks for debugging

## Security First (Must Do Before Deploy)

1. Rotate all previously exposed API keys immediately.
2. Never store real keys in `.env.example` or source files.
3. Keep real values only in deployment environment variables.
4. Use strict CORS with your real frontend URL.

## Files Added for Deployment

- `render.yaml`: one-click style Render blueprint for frontend, backend, AI layer
- `.gitignore`: prevents accidental secret commits (`.env`, `.env.*`)

## Deploy Steps

### 1. Prepare MongoDB Atlas

1. Create an Atlas project and free M0 cluster.
2. Create DB user and password.
3. Add network access rules.
4. Copy connection string for `MONGO_URI`.

### 2. Push Code to GitHub

1. Create a repository in your GitHub account.
2. Push this project.
3. Confirm no real secrets are committed.

### 3. Create Render Blueprint

1. In Render dashboard, choose Blueprint deployment.
2. Select your GitHub repo.
3. Render detects `render.yaml` and creates 3 services.

### 4. Configure Environment Variables in Render

Backend:

- `MONGO_URI` = your Atlas URI
- `AI_LAYER_URL` = AI service URL from Render
- `CLIENT_ORIGIN` = frontend URL from Render

AI Layer:

- `GROQ_API_KEY`
- `HF_TOKEN` and/or `HF_API_KEY`
- `PEXELS_API_KEY` (if stock image source enabled)

Frontend:

- `VITE_BACKEND_URL` = backend URL from Render

### 5. Validate Health

- Backend: `/health`
- AI Layer: `/health`
- Frontend loads and can create books

## Post-Deployment Checklist

- Verify Create Book flow (English and Hindi)
- Verify page generation and page navigation
- Verify audio generation endpoint
- Verify feedback endpoints:
  - `POST /api/feedback/upgrade-request`
  - `POST /api/feedback/suggestion`
- Verify no secrets appear in logs

## Important Note

I cannot directly deploy to your GitHub/Render account from this environment without your authenticated credentials/session. This repo is now prepared for secure deployment, and the steps above are ready to run.
