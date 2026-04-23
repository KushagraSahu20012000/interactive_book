# Vercel + Hugging Face Deployment (Laptop Off, App Still Running)

This deployment keeps the app online without your system running.

- Frontend: Vercel (free)
- Backend API: Hugging Face Space (Docker)
- AI Layer: Hugging Face Space (Docker)
- Database: MongoDB Atlas

## 1. Deploy AI Layer to Hugging Face Space

1. Create a new Space.
2. Select SDK: Docker.
3. Upload these files from [ai_layer](ai_layer):
   - [ai_layer/Dockerfile.hf](ai_layer/Dockerfile.hf) as `Dockerfile`
   - all AI layer source files (`app.py`, `components`, `requirements.txt`, `start_ai_layer.sh`, etc.)
4. Set Space Variables/Secrets:
   - `GROQ_API_KEY`
   - `HF_TOKEN` or `HF_API_KEY`
   - `PEXELS_API_KEY` (optional)
   - `GROQ_MODEL=openai/gpt-oss-120b`
   - `HF_PROVIDER=nscale`
   - `HF_IMAGE_MODEL=stabilityai/stable-diffusion-xl-base-1.0`
   - `IMAGE_SOURCE=pexels`
5. Wait for build to finish.
6. Confirm health endpoint: `https://<your-ai-space>.hf.space/health`

## 2. Deploy Backend to Hugging Face Space

1. Create another new Space.
2. Select SDK: Docker.
3. Upload these files from [backend](backend):
   - [backend/Dockerfile.hf](backend/Dockerfile.hf) as `Dockerfile`
   - all backend source files (`src`, `package.json`, `package-lock.json`)
4. Set Space Variables/Secrets:
   - `MONGO_URI=mongodb+srv://<user>:<password>@<cluster>/<db>?retryWrites=true&w=majority&appName=bright-minds`
   - `AI_LAYER_URL=https://<your-ai-space>.hf.space`
   - `CLIENT_ORIGIN=https://<your-vercel-project>.vercel.app`
   - `AI_POLL_INTERVAL_MS=1500`
5. Wait for build to finish.
6. Confirm health endpoint: `https://<your-backend-space>.hf.space/health`

## 3. Deploy Frontend to Vercel

1. Import your repository in Vercel.
2. Set Root Directory to `interactive_book/frontend`.
3. Vercel picks [frontend/vercel.json](frontend/vercel.json) automatically.
4. Set environment variable:
   - `VITE_BACKEND_URL=https://<your-backend-space>.hf.space`
5. Deploy.

## 4. Post-Deploy Validation

1. Open your Vercel URL.
2. Create one book and generate next page.
3. Check backend logs if requests fail.
4. Verify Hindi + audio generation.

## 5. Notes

1. Free tiers may sleep on inactivity and wake on first request.
2. This setup remains online independently of your laptop.
3. If MongoDB password has special characters, URL-encode it in `MONGO_URI`.
