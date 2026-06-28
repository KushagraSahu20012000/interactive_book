# Combined Hugging Face Space image: Node.js backend + Python AI layer.
# Build context is the repository root.
FROM node:20-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# System Python + venv for the AI layer.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv python3-pip \
    && rm -rf /var/lib/apt/lists/*

ENV VENV_PATH=/opt/venv
RUN python3 -m venv "$VENV_PATH"
ENV PATH="$VENV_PATH/bin:$PATH"

WORKDIR /app

# Install backend dependencies first for better layer caching.
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev

# Install AI layer dependencies into the venv.
COPY ai_layer/requirements.txt ./ai_layer/requirements.txt
RUN "$VENV_PATH/bin/pip" install --no-cache-dir -r ai_layer/requirements.txt

# Application source.
COPY backend ./backend
COPY ai_layer ./ai_layer
COPY Assets ./Assets
COPY start.sh ./start.sh
RUN chmod +x ./start.sh

ENV NODE_ENV=production
# Public HF port for the backend API; AI layer stays internal on AI_PORT.
ENV PORT=7860
ENV AI_PORT=8000
ENV AI_LAYER_URL=http://127.0.0.1:8000

EXPOSE 7860

CMD ["bash", "/app/start.sh"]
