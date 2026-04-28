# Interactive Book

Interactive Book is a full-stack AI storytelling platform for age-aware and neurotype-aware learning books.

It is proudly a 100% vibe coded website.

## What This Project Includes

- Frontend: React + Vite + TypeScript
- Backend: Express + Socket.IO + Mongoose
- AI Layer: FastAPI + async worker queues + LangChain/LangGraph
- Persistence: MongoDB
- Live updates: WebSockets
- Audio: language-aware TTS routing
- Feedback capture: Upgrade requests and suggestion box submissions

## Core Capabilities

- Create books with:
  - Topic
  - Description
  - Age group: 5-10, 10-15, 15-20, 20+
  - Neurotype: ADHD, Dyslexia, Autism, None
  - Language: English or Hindi
- Generate book pages asynchronously with progress updates.
- Generate and render section imagery.
- Generate and stream page audio.
- Navigate pages with background generation support.
- Capture product feedback from sticky UI actions:
  - Request Upgrade
  - Suggestion Box

## Architecture

See full architecture and sequence diagrams in [ARCHITECTURE_DIAGRAM.md](ARCHITECTURE_DIAGRAM.md).

Best free and easy deployment for this architecture:

- Render (Frontend Static + Backend Web Service + AI Layer Web Service)
- MongoDB Atlas M0 (free tier)

Step-by-step deployment guide: [DEPLOYMENT.md](DEPLOYMENT.md)

High-level flow:

1. Frontend calls backend APIs.
2. Backend persists tasks/pages/books and submits jobs to AI layer.
3. AI layer processes text/image jobs and returns status.
4. Backend monitors jobs, updates MongoDB, and emits socket events.
5. Frontend receives live progress and re-renders page state.

## Repository Structure

- [frontend](frontend): React app
- [backend](backend): Express API and WebSocket server
- [ai_layer](ai_layer): FastAPI orchestration and AI workers
- [Assets](Assets): sample/static assets
- [ARCHITECTURE_DIAGRAM.md](ARCHITECTURE_DIAGRAM.md): Mermaid system and flow diagrams

## Local Development

Prerequisites:

- Node.js 20+
- Python 3.11+
- MongoDB 6+

### 1. Start MongoDB

Use a local MongoDB instance or a managed URI.

### 2. Configure AI Layer

```bash
cd ai_layer
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Start AI layer:

```bash
./start_ai_layer.sh
```

### 3. Configure Backend

```bash
cd ../backend
cp .env.example .env
npm install
npm run dev
```

### 4. Configure Frontend

```bash
cd ../frontend
cp .env.example .env
npm install
npm run dev
```

Open http://localhost:5173.

## Environment Variables

### Backend (.env)

- PORT
- MONGO_URI
- CLIENT_ORIGIN
- AI_LAYER_URL
- AI_POLL_INTERVAL_MS

### Frontend (.env)

- VITE_BACKEND_URL

### AI Layer (.env)

- GROQ_API_KEY
- GROQ_MODEL
- HF_TOKEN or HF_API_KEY
- HF_PROVIDER
- HF_IMAGE_MODEL
- IMAGE_SOURCE
- Optional image-source API keys (for stock fallback providers)

## Production Readiness Guide

Use this checklist when deploying to production.

### Security

- Move all secrets to a secret manager.
- Do not keep real API keys in tracked example files.
- Restrict CORS to real frontend domains only.
- Add authentication/authorization for user endpoints.
- Add rate limiting for:
  - book creation
  - next-page generation
  - audio generation
  - feedback submissions

### Reliability

- Run backend and AI layer as separate services.
- Add process supervision and auto-restart.
- Configure health checks:
  - backend: /health
  - AI layer: /health
- Persist logs centrally.
- Add retries/circuit breakers for AI provider outages.

### Performance and Scale

- Scale backend horizontally behind a load balancer.
- Use WebSocket scaling adapter when running multi-instance backend.
- Scale AI layer workers independently from backend.
- Add queue limits and backpressure policies.
- Add CDN caching for static frontend assets.

### Data and Operations

- Use MongoDB replica set in production.
- Enable automatic backups and retention.
- Add observability:
  - request latency
  - job duration
  - queue depth
  - provider error rates
- Define alerting for service health and error spikes.

## API Summary

### Backend APIs

- GET /health
- GET /health/ai
- GET /api/books
- POST /api/books
- GET /api/books/:bookId
- POST /api/books/:bookId/next
- GET /api/books/:bookId/pages/:pageNumber/audio
- GET /api/books/:bookId/pages
- GET /api/books/:bookId/progress
- DELETE /api/books/:bookId
- POST /api/feedback/upgrade-request
- POST /api/feedback/suggestion

### AI Layer APIs

- GET /health
- POST /jobs/create-book
- POST /jobs/next-page
- GET /jobs/:job_id
- POST /tts

## Build and Verification

Frontend:

```bash
cd frontend
npm run build
```

Backend syntax check:

```bash
node --check backend/src/index.js
```

AI layer syntax check:

```bash
python3 -m py_compile ai_layer/components/page_generator_ai.py
```

PDF export:

```bash
cd backend
npm run export:pdf -- --book-id <mongo-book-id>
```

You can also export seeded sample books with `--sample-slug <slug>` and optionally set `--out <path>` for a custom file location.

PowerPoint export:

```bash
cd backend
npm run export:ppt -- --sample-slug non-duality-for-10-15
```

The PPT exporter mirrors the book page layout with alternating image and text panels so the saved deck stays close to the reading view.

## Notes

- Some image workflows intentionally use stock sources depending on configuration.
- AI output quality can vary by provider availability, model behavior, and prompt constraints.
- For enterprise-grade production, add auth, tenancy boundaries, and usage metering.
- If any API key was ever committed, rotate/revoke it immediately before deployment.
