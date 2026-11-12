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

function isAllowedOrigin(origin) {
  if (getAllowedOrigins().has(origin)) return true;

  try {
    const url = new URL(origin);
    return url.protocol === "http:"
      && (url.hostname === "127.0.0.1" || url.hostname === "localhost")
      && Number(url.port) > 0;
  } catch {
    return false;
  }
}

function jsonResponse(status, data, origin) {
  const headers = { "Content-Type": "application/json; charset=utf-8" };
  if (origin && isAllowedOrigin(origin)) {
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
  if (!origin || !isAllowedOrigin(origin)) {
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

  const expectedAccessCode = process.env.TRANSCRIPTION_ACCESS_CODE;
  if (!expectedAccessCode) {
    return jsonResponse(503, {
      error: "Cloud transcription is not configured yet. Add TRANSCRIPTION_ACCESS_CODE in Netlify site environment variables, then redeploy.",
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
  const provider = formData.get("provider") || "groq";
  if (!(audioFile instanceof File) || audioFile.size === 0) {
    return jsonResponse(400, { error: "The audio chunk is missing or empty." }, origin);
  }
  if (audioFile.size > MAX_AUDIO_BYTES) {
    return jsonResponse(413, { error: "The audio chunk exceeds Netlify's upload limit. Reduce the chunk duration and try again." }, origin);
  }
  if (language !== "af" && language !== "en" && language !== "auto") {
    return jsonResponse(400, { error: "Choose Afrikaans, English, or Auto-Detect." }, origin);
  }
  if (provider !== "groq" && provider !== "deepgram") {
    return jsonResponse(400, { error: "Choose Groq or Deepgram as the transcription provider." }, origin);
  }

  const apiKey = provider === "deepgram" ? process.env.DEEPGRAM_API_KEY : process.env.GROQ_API_KEY;
  if (!apiKey) {
    const keyName = provider === "deepgram" ? "DEEPGRAM_API_KEY" : "GROQ_API_KEY";
    return jsonResponse(503, {
      error: `Cloud transcription is not configured yet. Add ${keyName} and TRANSCRIPTION_ACCESS_CODE in Netlify site environment variables, then redeploy.`,
    }, origin);
  }

  if (provider === "deepgram") {
    const query = new URLSearchParams({
      model: "nova-3",
      diarize_model: "latest",
      utterances: "true",
      punctuate: "true",
      smart_format: "true",
      language: language === "auto" ? "multi" : language,
    });

    let deepgramResponse;
    try {
      deepgramResponse = await fetch(`https://api.deepgram.com/v1/listen?${query}`, {
        method: "POST",
        headers: {
          Authorization: `Token ${apiKey}`,
          "Content-Type": "audio/wav",
        },
        body: new Blob([await audioFile.arrayBuffer()], { type: "audio/wav" }),
        signal: AbortSignal.timeout(50_000),
      });
    } catch (error) {
      console.error("Deepgram transcription request failed:", error);
      return jsonResponse(502, { error: "Could not reach Deepgram. Check the connection and try the chunk again." }, origin);
    }

    const responseText = await deepgramResponse.text();
    let result;
    try {
      result = JSON.parse(responseText);
    } catch {
      console.error("Deepgram returned a non-JSON transcription response:", deepgramResponse.status);
      return jsonResponse(502, { error: "Deepgram returned an unreadable response. Try the chunk again." }, origin);
    }

    if (!deepgramResponse.ok) {
      const providerMessage = result.err_msg || result.error?.message || result.message;
      console.error("Deepgram transcription API returned an error:", deepgramResponse.status, providerMessage || "No details");
      const message = deepgramResponse.status === 429
        ? "Deepgram's rate limit was reached. Wait a minute, then retry the remaining audio."
        : providerMessage || `Deepgram transcription failed (${deepgramResponse.status}).`;
      return jsonResponse(deepgramResponse.status, { error: message }, origin);
    }

    const utterances = Array.isArray(result.results?.utterances) ? result.results.utterances : [];
    const alternative = result.results?.channels?.[0]?.alternatives?.[0];
    const words = utterances.flatMap((utterance) => Array.isArray(utterance.words) ? utterance.words : []);
    const sourceWords = words.length
      ? words
      : Array.isArray(alternative?.words) ? alternative.words : [];

    return jsonResponse(200, {
      text: typeof alternative?.transcript === "string" ? alternative.transcript : "",
      words: sourceWords.map((word) => ({
        start: Number(word.start),
        end: Number(word.end),
        speakerId: Number.isInteger(word.speaker) ? word.speaker : null,
        text: typeof word.punctuated_word === "string" ? word.punctuated_word : word.word,
      })).filter((word) => Number.isFinite(word.start)
        && Number.isFinite(word.end)
        && typeof word.text === "string"
        && word.text.trim()),
    }, origin);
  }

  const groqForm = new FormData();
  groqForm.set("file", new Blob([await audioFile.arrayBuffer()], { type: "audio/wav" }), "audio-chunk.wav");
  groqForm.set("model", "whisper-large-v3");
  groqForm.set("response_format", "verbose_json");
  groqForm.set("timestamp_granularities[]", "segment");
  groqForm.set("temperature", "0");
  if (language !== "auto") groqForm.set("language", language);
  if (language === "af") {
    groqForm.set("prompt", "Dankie, ek verstaan. Ja, akkoord, ons gaan dit nou doen. Nie so nie, maar soos ons gesê het.");
  }

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

  const promptEcho = "Dankie, ek verstaan. Ja, akkoord, ons gaan dit nou doen";
  const looksHallucinated = (segment) => {
    const text = typeof segment.text === "string" ? segment.text : "";
    if (!text.trim()) return true;

    const noSpeechProbability = Number(segment.no_speech_prob);
    const averageLogProbability = Number(segment.avg_logprob);
    const compressionRatio = Number(segment.compression_ratio);
    const likelySilence = noSpeechProbability > 0.6 && averageLogProbability < -1;
    const repeatedLoop = compressionRatio > 2.4;
    const likelyPromptEcho = text.toLowerCase().includes(promptEcho.toLowerCase())
      && noSpeechProbability > 0.3
      && averageLogProbability < -0.5;
    return likelySilence || repeatedLoop || likelyPromptEcho;
  };

  const segments = Array.isArray(result.segments)
    ? result.segments.filter((segment) => !looksHallucinated(segment)).map((segment) => ({
      start: Number(segment.start) || 0,
      end: Number(segment.end) || 0,
      text: typeof segment.text === "string" ? segment.text : "",
    }))
    : [];

  return jsonResponse(200, {
    text: segments.map((segment) => segment.text).join(" "),
    segments,
  }, origin);
}
