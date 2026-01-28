import { getProvider, setProvider } from "./store.js";

const FIREFLIES_URL = "https://api.fireflies.ai/graphql";

function getApiKey() {
  return process.env.FIREFLIES_API_KEY || "";
}

export async function fetchFirefliesTranscripts(limit = 5) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("fireflies_api_key_missing");
  const query = `query Transcripts($limit: Int) { transcripts(limit: $limit) { id title date duration } }`;
  const r = await fetch(FIREFLIES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({ query, variables: { limit } })
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(text || "fireflies_query_failed");
  }
  return await r.json();
}

export function markFirefliesConnected() {
  const apiKey = getApiKey();
  if (!apiKey) return null;
  return setProvider("fireflies", { connected: true, connectedAt: new Date().toISOString() });
}

export async function fetchFirefliesTranscript(transcriptId) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("fireflies_api_key_missing");
  const query = `query Transcript($transcriptId: String!) { transcript(id: $transcriptId) { id title dateString duration transcript_url summary { short_summary short_overview overview gist bullet_gist action_items topics_discussed } } }`;
  const r = await fetch(FIREFLIES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({ query, variables: { transcriptId } })
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(text || "fireflies_transcript_failed");
  }
  return await r.json();
}

export async function uploadFirefliesAudio({ url, title, webhook, language }) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("fireflies_api_key_missing");
  if (!/^https:\/\//i.test(url || "")) {
    throw new Error("fireflies_url_must_be_https");
  }
  const query = `mutation UploadAudio($input: AudioUploadInput!) { uploadAudio(input: $input) { id status } }`;
  const variables = {
    input: {
      url,
      title,
      webhook,
      custom_language: language
    }
  };
  const r = await fetch(FIREFLIES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({ query, variables })
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(text || "fireflies_upload_failed");
  }
  return await r.json();
}
