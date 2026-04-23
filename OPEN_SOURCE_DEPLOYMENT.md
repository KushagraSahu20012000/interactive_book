# Fully Open-Source Deployment (No Render)

This setup runs everything yourself using Docker Compose:

- Frontend (Nginx + built Vite app)
- Backend (Node + Express)
- AI Layer (FastAPI)
- MongoDB (local container)

## 1. Prerequisites

1. Install Docker Desktop.
2. Ensure Docker is running.
3. Keep API keys ready: `GROQ_API_KEY` and image provider keys if used.

## 2. Start the Stack

From the project root:

```bash
docker compose -f docker-compose.opensource.yml up -d --build
```

## 3. Open the App

- Frontend: `http://localhost:8080`
- Backend health: `http://localhost:4000/health`
- AI health: `http://localhost:8000/health`

## 4. Optional: Use Atlas Instead of Local Mongo

Set `MONGO_URI` before starting compose.

Example:

```bash
export MONGO_URI='mongodb+srv://<user>:<password>@<cluster>/<db>?retryWrites=true&w=majority&appName=bright-minds'
docker compose -f docker-compose.opensource.yml up -d --build
```

If your password contains special characters, URL-encode it.

## 5. Stop the Stack

```bash
docker compose -f docker-compose.opensource.yml down
```

To remove Mongo data too:

```bash
docker compose -f docker-compose.opensource.yml down -v
```
