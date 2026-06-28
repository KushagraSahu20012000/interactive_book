# Vercel + Hugging Face Deployment (Laptop Off, App Still Running)

This deployment keeps the app online without your system running.

- Frontend: Vercel (free)
- Backend API + AI Layer: single Hugging Face Space (Docker)
- Database: MongoDB Atlas

The backend and AI layer run together in one container. The backend reaches the
AI layer internally at `http://127.0.0.1:8000`, so there is no separate AI Space.

## 1. Deploy Backend + AI to Hugging Face Space

This is automated by the `Deploy HF Backend Space` GitHub Action
([.github/workflows/deploy-hf-backend-space.yml](.github/workflows/deploy-hf-backend-space.yml)),
which pushes `backend/`, `ai_layer/`, `Assets/`, the root [Dockerfile](Dockerfile),
and [start.sh](start.sh) to the Space.

To set it up:

1. Create a new Space (SDK: Docker) named `bright-minds-backend`.
2. In your GitHub repo, set the `HF_TOKEN` secret (a write token for the Space owner).
3. Set Space Variables/Secrets:
   - `MONGO_URI=mongodb+srv://<user>:<password>@<cluster>/<db>?retryWrites=true&w=majority&appName=bright-minds`
   - `CLIENT_ORIGIN=https://<your-vercel-project>.vercel.app`
   - `AI_POLL_INTERVAL_MS=1500`
   - `GROQ_API_KEY`
   - `HF_TOKEN` or `HF_API_KEY`
   - `PEXELS_API_KEY` (optional)
   - `GROQ_MODEL=openai/gpt-oss-120b`
   - `HF_PROVIDER=nscale`
   - `HF_IMAGE_MODEL=stabilityai/stable-diffusion-xl-base-1.0`
   - `IMAGE_SOURCE=pexels`
   - Leave `AI_LAYER_URL` unset; the image defaults it to `http://127.0.0.1:8000`.
4. Push to `main` (or run the workflow manually) to deploy.
5. Wait for the build to finish.
6. Confirm health endpoints:
   - `https://<your-backend-space>.hf.space/health`
   - `https://<your-backend-space>.hf.space/health/ai`

## 2. Deploy Frontend to Vercel

1. Import your repository in Vercel.
2. Keep Root Directory as `./`.
3. Vercel will use [vercel.json](vercel.json) and deploy only the frontend service from [frontend](frontend).
4. If Vercel shows a backend service in the dashboard, remove it. Backend must stay on the Hugging Face Space.
5. Set environment variable:
   - `VITE_BACKEND_URL=https://<your-backend-space>.hf.space`
6. Deploy.

## 3. Post-Deploy Validation

1. Open your Vercel URL.
2. Create one book and generate next page.
3. Check backend logs if requests fail.
4. Verify Hindi + audio generation.

## 4. Notes

1. Free tiers may sleep on inactivity and wake on first request.
2. This setup remains online independently of your laptop.
3. If MongoDB password has special characters, URL-encode it in `MONGO_URI`.
