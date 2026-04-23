const AI_LAYER_URL = process.env.AI_LAYER_URL || "http://localhost:8000";

async function request(path, init = {}) {
  const response = await fetch(`${AI_LAYER_URL}${path}`, {
    headers: {
      "Content-Type": "application/json"
    },
    ...init
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AI layer error ${response.status}: ${text}`);
  }

  return response.json();
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
