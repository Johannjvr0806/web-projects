import { createHash, timingSafeEqual } from "node:crypto";

const MAX_AUDIO_BYTES = 3 * 1024 * 1024;
const DEFAULT_ALLOWED_ORIGINS = [
  "https://johannjvr0806.github.io",
  "https://johann-dev-workspace.netlify.app",
];

function getAllowedOrigins() {
  const configuredOrigins = process.env.ALLOWED_ORIGINS
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return new Set(configuredOrigins?.length ? configuredOrigins : DEFAULT_ALLOWED_ORIGINS);
}

function jsonResponse(status, data, origin) {
  const headers = { "Content-Type": "application/json; charset=utf-8" };
  if (origin && getAllowedOrigins().has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type";
    headers.Vary = "Origin";
  }

  return new Response(JSON.stringify(data), { status, headers });
}

function matchesAccessCode(received, expected) {
  const receivedHash = createHash("sha256").update(received).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(receivedHash, expectedHash);
}

export default async function transcribe(request) {
  const origin = request.headers.get("origin");
  if (!origin || !getAllowedOrigins().has(origin)) {
    return jsonResponse(403, { error: "This website is not allowed to use the transcription service." }, origin);
  }

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
        "Access-Control-Max-Age": "86400",
        Vary: "Origin",
      },
    });
  }

  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Use POST to request a transcription." }, origin);
  }

  const apiKey = process.env.GROQ_API_KEY;
  const expectedAccessCode = process.env.TRANSCRIPTION_ACCESS_CODE;
  if (!apiKey || !expectedAccessCode) {
    return jsonResponse(503, {
      error: "Cloud transcription is not configured yet. Add GROQ_API_KEY and TRANSCRIPTION_ACCESS_CODE in Netlify site environment variables, then redeploy.",
    }, origin);
  }

  const authorization = request.headers.get("authorization") || "";
  const accessCode = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!accessCode || !matchesAccessCode(accessCode, expectedAccessCode)) {
    return jsonResponse(401, { error: "The Netlify transcription access code is incorrect." }, origin);
  }

  if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data")) {
    return jsonResponse(415, { error: "Send an audio chunk using multipart form data." }, origin);
  }

  let formData;
  try {
    formData = await request.formData();
  } catch (error) {
    console.error("Could not read the audio upload:", error);
    return jsonResponse(400, { error: "Could not read the audio chunk. Try again with a smaller file." }, origin);
  }

  const audioFile = formData.get("file");
  const language = formData.get("language");
  if (!(audioFile instanceof File) || audioFile.size === 0) {
    return jsonResponse(400, { error: "The audio chunk is missing or empty." }, origin);
  }
  if (audioFile.size > MAX_AUDIO_BYTES) {
    return jsonResponse(413, { error: "The audio chunk exceeds Netlify's upload limit. Reduce the chunk duration and try again." }, origin);
  }
  if (language !== "af" && language !== "en" && language !== "auto") {
    return jsonResponse(400, { error: "Choose Afrikaans, English, or Auto-Detect." }, origin);
  }

  const groqForm = new FormData();
  groqForm.set("file", new Blob([await audioFile.arrayBuffer()], { type: "audio/wav" }), "audio-chunk.wav");
  groqForm.set("model", "whisper-large-v3-turbo");
  groqForm.set("response_format", "verbose_json");
  groqForm.set("timestamp_granularities[]", "segment");
  groqForm.set("temperature", "0");
  if (language !== "auto") groqForm.set("language", language);

  let groqResponse;
  try {
    groqResponse = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: groqForm,
      signal: AbortSignal.timeout(50_000),
    });
  } catch (error) {
    console.error("Groq transcription request failed:", error);
    return jsonResponse(502, { error: "Could not reach Groq. Check the connection and try the chunk again." }, origin);
  }

  const responseText = await groqResponse.text();
  let result;
  try {
    result = JSON.parse(responseText);
  } catch {
    console.error("Groq returned a non-JSON transcription response:", groqResponse.status);
    return jsonResponse(502, { error: "Groq returned an unreadable response. Try the chunk again." }, origin);
  }

  if (!groqResponse.ok) {
    const providerMessage = result.error?.message;
    console.error("Groq transcription API returned an error:", groqResponse.status, providerMessage || "No details");
    const message = groqResponse.status === 429
      ? "Groq's rate limit was reached. Wait a minute, then retry the remaining audio."
      : providerMessage || `Groq transcription failed (${groqResponse.status}).`;
    return jsonResponse(groqResponse.status, { error: message }, origin);
  }

  const segments = Array.isArray(result.segments)
    ? result.segments.map((segment) => ({
      start: Number(segment.start) || 0,
      end: Number(segment.end) || 0,
      text: typeof segment.text === "string" ? segment.text : "",
    }))
    : [];

  return jsonResponse(200, {
    text: typeof result.text === "string" ? result.text : "",
    segments,
  }, origin);
}
