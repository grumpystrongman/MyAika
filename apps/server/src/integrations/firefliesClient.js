const FIREFLIES_URL = "https://api.fireflies.ai/graphql";

function getApiKey() {
  return process.env.FIREFLIES_API_KEY || "";
}

async function firefliesRequest(query, variables = {}) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("fireflies_api_key_missing");
  const response = await fetch(FIREFLIES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({ query, variables })
  });
  const text = await response.text();
  if (!response.ok) {
    const err = new Error(text || "fireflies_request_failed");
    err.status = response.status;
    if (response.status === 429) {
      err.code = "fireflies_rate_limited";
      const retryAfter = response.headers.get("retry-after");
      if (retryAfter) {
        const retrySeconds = Number(retryAfter);
        if (!Number.isNaN(retrySeconds)) {
          err.retryAt = Date.now() + retrySeconds * 1000;
        } else {
          const retryDate = new Date(retryAfter);
          if (!Number.isNaN(retryDate.getTime())) err.retryAt = retryDate.getTime();
        }
      }
      if (!err.retryAt && text) {
        const match = text.match(/retry after\\s+([^\\n]+)$/i);
        if (match?.[1]) {
          const retryDate = new Date(match[1].trim());
          if (!Number.isNaN(retryDate.getTime())) err.retryAt = retryDate.getTime();
        }
      }
    }
    throw err;
  }
  const payload = text ? JSON.parse(text) : {};
  if (payload?.errors?.length) {
    throw new Error(payload.errors.map(err => err.message).join("; ") || "fireflies_graphql_error");
  }
  return payload;
}

export async function listTranscripts({ cursor = 0, limit = 25 } = {}) {
  const query = `query Transcripts($limit: Int, $skip: Int) {
    transcripts(limit: $limit, skip: $skip) {
      id
      title
      date
      dateString
      transcript_url
      participants
    }
  }`;
  const payload = await firefliesRequest(query, { limit, skip: cursor });
  const transcripts = payload?.data?.transcripts || [];
  const nextCursor = transcripts.length < limit ? null : cursor + transcripts.length;
  return { transcripts, nextCursor };
}

export async function getTranscript(transcriptId) {
  const query = `query Transcript($transcriptId: String!) {
    transcript(id: $transcriptId) {
      id
      title
      date
      dateString
      transcript_url
      duration
      participants
      meeting_attendees {
        name
        email
        displayName
      }
      sentences {
        index
        speaker_name
        text
        start_time
        end_time
      }
    }
  }`;
  const payload = await firefliesRequest(query, { transcriptId });
  return payload?.data?.transcript || null;
}
