const AI_LAYER_URL = process.env.AI_LAYER_URL || "http://localhost:8000";
export const AI_LIMIT_EXCEEDED_FALLBACK_TEXT = "Free Tier Expired. Request Upgrade!";

function createAiError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function isAiLimitExceeded(status, text) {
  const lowered = String(text || "").toLowerCase();
  return (
    status === 429 ||
    lowered.includes("rate limit") ||
    lowered.includes("rate_limit_exceeded") ||
    lowered.includes("tokens per day") ||
    lowered.includes("free tier")
  );
}

async function request(path, init = {}) {
  const response = await fetch(`${AI_LAYER_URL}${path}`, {
    headers: {
      "Content-Type": "application/json"
    },
    ...init
  });

  if (!response.ok) {
    const text = await response.text();
    if (isAiLimitExceeded(response.status, text)) {
      throw createAiError(AI_LIMIT_EXCEEDED_FALLBACK_TEXT, 429);
    }
    throw createAiError(`AI layer error ${response.status}: ${text}`, response.status);
  }

  return response.json();
}

export async function synthesizeSpeech(payload) {
  const response = await fetch(`${AI_LAYER_URL}/tts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();
    if (isAiLimitExceeded(response.status, text)) {
      throw createAiError(AI_LIMIT_EXCEEDED_FALLBACK_TEXT, 429);
    }
    throw createAiError(`AI layer error ${response.status}: ${text}`, response.status);
  }

  const arrayBuffer = await response.arrayBuffer();
  if (!arrayBuffer.byteLength) {
    throw createAiError("TTS upstream returned empty audio", 502);
  }

  return {
    audioBuffer: Buffer.from(arrayBuffer),
    contentType: response.headers.get("content-type") || "audio/wav"
  };
}

export async function submitCreateBookJob(payload) {
  return request("/jobs/create-book", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function submitNextPageJob(payload) {
  return request("/jobs/next-page", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function getAiJobStatus(jobId) {
  return request(`/jobs/${jobId}`);
}
