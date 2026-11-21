import { createHash, timingSafeEqual } from "node:crypto";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const GEMINI_MODEL = "gemini-3.8-flash";
const GROQ_AFRIKAANS_PROMPT = "Die likwidateur het die boedel van die maatskappy ondersoek en gelde terugvorder weens onbehoorlike vervreemding en roekelose bestuur. Hulle kan aanspreeklik gehou word.";
const DEFAULT_ALLOWED_ORIGINS = [
  "https://johannjvr0806.github.io",
  "https://johann-dev-workspace.netlify.app",
];

function getAllowedOrigins(env) {
  const configuredOrigins = env.ALLOWED_ORIGINS
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return new Set(configuredOrigins?.length ? configuredOrigins : DEFAULT_ALLOWED_ORIGINS);
}

function isAllowedOrigin(origin, env) {
  if (getAllowedOrigins(env).has(origin)) return true;

  try {
    const url = new URL(origin);
    return url.protocol === "http:"
      && (url.hostname === "127.0.0.1" || url.hostname === "localhost")
      && Number(url.port) > 0;
  } catch {
    return false;
  }
}

function jsonResponse(status, data, origin, env) {
  const headers = { "Content-Type": "application/json; charset=utf-8" };
  if (origin && isAllowedOrigin(origin, env)) {
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

async function handleGeminiPolish(request, env, origin) {
  if (!env.GEMINI_API_KEY) {
    return jsonResponse(503, {
      error: "Gemini cleanup is not configured yet. Add GEMINI_API_KEY as a Worker secret.",
    }, origin, env);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: "Invalid JSON payload for Gemini cleanup." }, origin, env);
  }

  const language = body?.language === "af" || body?.language === "en" || body?.language === "auto"
    ? body.language
    : "auto";
  const keyterms = typeof body?.keyterms === "string" ? body.keyterms.trim().slice(0, 1500) : "";
  const replacements = typeof body?.replacements === "string" ? body.replacements.trim().slice(0, 3000) : "";
  const rawSegments = Array.isArray(body?.segments) ? body.segments : [];

  if (!rawSegments.length || rawSegments.length > 120) {
    return jsonResponse(400, {
      error: "Send between 1 and 120 transcript segments for Gemini cleanup.",
    }, origin, env);
  }

  const normalizedSegments = rawSegments.map((seg, i) => ({
    index: Number.isInteger(seg?.index) ? seg.index : i,
    speaker: typeof seg?.speaker === "string" ? seg.speaker.slice(0, 80) : "",
    text: typeof seg?.text === "string" ? seg.text.trim().slice(0, 2500) : "",
  })).filter((seg) => seg.text.length > 0);

  if (!normalizedSegments.length) {
    return jsonResponse(400, { error: "No non-empty segment text to polish." }, origin, env);
  }

  const systemInstruction = [
    "You are a precision transcript editor for South African legal, insolvency, and business recordings.",
    "You receive numbered transcript segments and must return cleaned text for each segment.",
    "STRICT RULES:",
    "1. Never add facts, invent words, summarize, or omit spoken meaning.",
    "2. Fix garbled names, companies, legal/insolvency terms, and ASR mishearings using the provided Known Names/Terms and Spelling Replacements.",
    "3. Whenever text is in Afrikaans (or Dutch drift occurs), enforce South African Afrikaans (af-ZA) spelling and vocabulary instead of Dutch (for example: 'nie' instead of Dutch 'niet', \"'n\" instead of Dutch 'een', 'vragmotors' instead of 'vrachtwagens', 'boedel', 'likwidateur', 'insolvensie', 'skuldeisers').",
    "4. When a speaker clearly speaks English or uses established English terms/quotes, preserve natural English rather than forcing translation.",
    "5. Keep the exact same 'index' for every segment so timestamps remain aligned.",
  ].join("\n");

  const userPrompt = [
    `Language mode: ${language === "af" ? "Afrikaans (af-ZA)" : language === "en" ? "English" : "Bilingual / Auto (af-ZA & English)"}.`,
    keyterms ? `Known names, companies, and legal terms:\n${keyterms}` : "",
    replacements ? `Known ASR mishearings -> corrections:\n${replacements}` : "",
    "Segments JSON:",
    JSON.stringify(normalizedSegments),
  ].filter(Boolean).join("\n\n");

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;

  let geminiResponse;
  try {
    geminiResponse = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemInstruction }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: userPrompt }],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              segments: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    index: { type: "INTEGER" },
                    text: { type: "STRING" },
                  },
                  required: ["index", "text"],
                },
              },
            },
            required: ["segments"],
          },
        },
      }),
      signal: AbortSignal.timeout(45_000),
    });
  } catch (error) {
    console.error("Gemini cleanup request failed:", error);
    return jsonResponse(502, {
      error: "Could not reach Gemini for transcript cleanup.",
    }, origin, env);
  }

  const responseText = await geminiResponse.text();
  let parsed;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    console.error("Gemini returned non-JSON HTTP response:", geminiResponse.status);
    return jsonResponse(502, {
      error: "Gemini returned an unreadable response during cleanup.",
    }, origin, env);
  }

  if (!geminiResponse.ok) {
    const providerMessage = parsed?.error?.message;
    console.error("Gemini API error:", geminiResponse.status, providerMessage || "No details");
    const message = geminiResponse.status === 429
      ? "Gemini rate limit reached. Wait a moment before retrying cleanup."
      : providerMessage || `Gemini cleanup failed (${geminiResponse.status}).`;
    return jsonResponse(geminiResponse.status, { error: message }, origin, env);
  }

  const candidateText = parsed?.candidates?.[0]?.content?.parts
    ?.map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("")
    .trim();

  if (!candidateText) {
    return jsonResponse(502, { error: "Gemini returned an empty cleanup result." }, origin, env);
  }

  let structured;
  try {
    structured = JSON.parse(candidateText);
  } catch {
    console.error("Gemini structured output was invalid JSON");
    return jsonResponse(502, { error: "Gemini cleanup output could not be parsed." }, origin, env);
  }

  const polishedMap = new Map();
  if (Array.isArray(structured?.segments)) {
    for (const item of structured.segments) {
      if (Number.isInteger(item?.index) && typeof item?.text === "string" && item.text.trim()) {
        polishedMap.set(item.index, item.text.trim());
      }
    }
  }

  const results = normalizedSegments.map((seg) => ({
    index: seg.index,
    text: polishedMap.get(seg.index) || seg.text,
  }));

  return jsonResponse(200, { segments: results }, origin, env);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("origin");
    if (!origin || !isAllowedOrigin(origin, env)) {
      return jsonResponse(403, { error: "This website is not allowed to use the transcription service." }, origin, env);
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
      return jsonResponse(405, { error: "Use POST to request a transcription." }, origin, env);
    }

    const expectedAccessCode = env.TRANSCRIPTION_ACCESS_CODE;
    if (!expectedAccessCode) {
      return jsonResponse(503, {
        error: "Cloud transcription is not configured yet. Add TRANSCRIPTION_ACCESS_CODE as a Worker secret.",
      }, origin, env);
    }

    const authorization = request.headers.get("authorization") || "";
    const accessCode = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!accessCode || !matchesAccessCode(accessCode, expectedAccessCode)) {
      return jsonResponse(401, { error: "The Cloudflare transcription access code is incorrect." }, origin, env);
    }

    const contentType = request.headers.get("content-type")?.toLowerCase() || "";
    if (contentType.startsWith("application/json")) {
      return handleGeminiPolish(request, env, origin);
    }

    if (!contentType.startsWith("multipart/form-data")) {
      return jsonResponse(415, { error: "Send an audio chunk using multipart form data." }, origin, env);
    }

    let formData;
    try {
      formData = await request.formData();
    } catch (error) {
      console.error("Could not read the audio upload:", error);
      return jsonResponse(400, { error: "Could not read the audio chunk. Try again with a smaller file." }, origin, env);
    }

    const audioFile = formData.get("file");
    const language = formData.get("language");
    const provider = formData.get("provider") || "groq";
    if (!(audioFile instanceof File) || audioFile.size === 0) {
      return jsonResponse(400, { error: "The audio chunk is missing or empty." }, origin, env);
    }
    if (audioFile.size > MAX_AUDIO_BYTES) {
      return jsonResponse(413, { error: "The audio chunk exceeds the 25 MB upload limit." }, origin, env);
    }
    if (language !== "af" && language !== "en" && language !== "auto") {
      return jsonResponse(400, { error: "Choose Afrikaans, English, or Auto-Detect." }, origin, env);
    }
    if (provider !== "groq" && provider !== "deepgram") {
      return jsonResponse(400, { error: "Choose Groq or Deepgram as the transcription provider." }, origin, env);
    }

    const apiKey = provider === "deepgram" ? env.DEEPGRAM_API_KEY : env.GROQ_API_KEY;
    if (!apiKey) {
      const keyName = provider === "deepgram" ? "DEEPGRAM_API_KEY" : "GROQ_API_KEY";
      return jsonResponse(503, {
        error: `Cloud transcription is not configured yet. Add ${keyName} and TRANSCRIPTION_ACCESS_CODE as Worker secrets.`,
      }, origin, env);
    }

    if (provider === "deepgram") {
      const keytermsField = formData.get("keyterms");
      if (keytermsField !== null && typeof keytermsField !== "string") {
        return jsonResponse(400, { error: "Deepgram keyterms must be text." }, origin, env);
      }

      const keyterms = typeof keytermsField === "string"
        ? keytermsField.split(",").map((term) => term.trim()).filter(Boolean).slice(0, 80)
        : [];
      if (keyterms.some((term) => term.length > 60)) {
        return jsonResponse(400, { error: "Each Deepgram keyterm must be 60 characters or fewer." }, origin, env);
      }

      const query = new URLSearchParams({
        model: "nova-3",
        diarize_model: "latest",
        utterances: "true",
        punctuate: "true",
        smart_format: "true",
        language: language === "auto" ? "multi" : language,
      });
      for (const keyterm of keyterms) query.append("keyterm", keyterm);

      let deepgramResponse;
      try {
        deepgramResponse = await fetch(`https://api.deepgram.com/v1/listen?${query}`, {
          method: "POST",
          headers: {
            Authorization: `Token ${apiKey}`,
            "Content-Type": "audio/wav",
          },
          body: new Blob([await audioFile.arrayBuffer()], { type: "audio/wav" }),
          signal: AbortSignal.timeout(120_000),
        });
      } catch (error) {
        console.error("Deepgram transcription request failed:", error);
        return jsonResponse(502, { error: "Could not reach Deepgram. Check the connection and try the chunk again." }, origin, env);
      }

      const responseText = await deepgramResponse.text();
      let result;
      try {
        result = JSON.parse(responseText);
      } catch {
        console.error("Deepgram returned a non-JSON transcription response:", deepgramResponse.status);
        return jsonResponse(502, { error: "Deepgram returned an unreadable response. Try the chunk again." }, origin, env);
      }

      if (!deepgramResponse.ok) {
        const providerMessage = result.err_msg || result.error?.message || result.message;
        console.error("Deepgram transcription API returned an error:", deepgramResponse.status, providerMessage || "No details");
        const message = deepgramResponse.status === 429
          ? "Deepgram's rate limit was reached. Wait a minute, then retry the remaining audio."
          : providerMessage || `Deepgram transcription failed (${deepgramResponse.status}).`;
        return jsonResponse(deepgramResponse.status, { error: message }, origin, env);
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
      }, origin, env);
    }

    const promptField = formData.get("prompt");
    if (promptField !== null && typeof promptField !== "string") {
      return jsonResponse(400, { error: "The transcription prompt must be text." }, origin, env);
    }
    if (typeof promptField === "string" && promptField.length > 600) {
      return jsonResponse(400, { error: "The transcription prompt must be 600 characters or fewer." }, origin, env);
    }
    const clientPrompt = typeof promptField === "string" ? promptField.trim() : "";

    const groqForm = new FormData();
    groqForm.set("file", new Blob([await audioFile.arrayBuffer()], { type: "audio/wav" }), "audio-chunk.wav");
    groqForm.set("model", "whisper-large-v3");
    groqForm.set("response_format", "verbose_json");
    groqForm.set("timestamp_granularities[]", "segment");
    groqForm.set("temperature", "0");
    if (language !== "auto") groqForm.set("language", language);
    if (clientPrompt) {
      groqForm.set("prompt", clientPrompt);
    } else if (language === "af") {
      groqForm.set("prompt", GROQ_AFRIKAANS_PROMPT);
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
      return jsonResponse(502, { error: "Could not reach Groq. Check the connection and try the chunk again." }, origin, env);
    }

    const responseText = await groqResponse.text();
    let result;
    try {
      result = JSON.parse(responseText);
    } catch {
      console.error("Groq returned a non-JSON transcription response:", groqResponse.status);
      return jsonResponse(502, { error: "Groq returned an unreadable response. Try the chunk again." }, origin, env);
    }

    if (!groqResponse.ok) {
      const providerMessage = result.error?.message;
      console.error("Groq transcription API returned an error:", groqResponse.status, providerMessage || "No details");
      const message = groqResponse.status === 429
        ? "Groq's rate limit was reached. Wait a minute, then retry the remaining audio."
        : providerMessage || `Groq transcription failed (${groqResponse.status}).`;
      return jsonResponse(groqResponse.status, { error: message }, origin, env);
    }

    const activePrompt = clientPrompt || (language === "af" ? GROQ_AFRIKAANS_PROMPT : "");
    const normalize = (s) => s.toLowerCase().replace(/[^\p{L}\s]/gu, " ").split(/\s+/).filter(Boolean);
    const promptWords = new Set(normalize(activePrompt));
    const echoesPrompt = (text) => {
      if (!promptWords.size) return false;
      const words = normalize(text);
      if (words.length < 3) return false;
      const hits = words.filter((word) => promptWords.has(word)).length;
      return hits / words.length > 0.6;
    };

    const looksHallucinated = (segment) => {
      const text = typeof segment.text === "string" ? segment.text : "";
      if (!text.trim()) return true;

      const noSpeechProbability = Number(segment.no_speech_prob);
      const averageLogProbability = Number(segment.avg_logprob);
      const compressionRatio = Number(segment.compression_ratio);
      const likelySilence = noSpeechProbability > 0.6 && averageLogProbability < -1;
      const repeatedLoop = compressionRatio > 2.4;
      if (echoesPrompt(text)) return true;
      return likelySilence || repeatedLoop;
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
    }, origin, env);
  },
};