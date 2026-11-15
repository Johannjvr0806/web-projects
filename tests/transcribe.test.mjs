import assert from "node:assert/strict";
import { test } from "node:test";
import transcribe from "../netlify/functions/transcribe.mjs";

test("Groq Afrikaans uses contextual prompts and filters prompt echoes", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = {
    TRANSCRIPTION_ACCESS_CODE: process.env.TRANSCRIPTION_ACCESS_CODE,
    GROQ_API_KEY: process.env.GROQ_API_KEY,
  };
  process.env.TRANSCRIPTION_ACCESS_CODE = "test-access-code";
  process.env.GROQ_API_KEY = "test-groq-key";

  let upstreamForm;
  let upstreamResponse = { segments: [] };
  let upstreamCalls = 0;
  globalThis.fetch = async (_url, options) => {
    upstreamCalls++;
    upstreamForm = options.body;
    return new Response(JSON.stringify(upstreamResponse), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const makeRequest = (prompt) => {
    const form = new FormData();
    form.append("file", new Blob(["audio"]), "sample.wav");
    form.set("language", "af");
    form.set("provider", "groq");
    if (prompt !== undefined) form.set("prompt", prompt);
    return new Request("http://127.0.0.1:49152/.netlify/functions/transcribe", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-access-code",
        Origin: "http://127.0.0.1:49152",
      },
      body: form,
    });
  };

  try {
    const defaultResponse = await transcribe(makeRequest());
    assert.equal(defaultResponse.status, 200);
    assert.equal(upstreamForm.get("language"), "af");
    assert.equal(upstreamForm.get("model"), "whisper-large-v3");
    assert.equal(upstreamForm.get("temperature"), "0");
    assert.equal(
      upstreamForm.get("prompt"),
      "Die likwidateur het die boedel van die maatskappy ondersoek en gelde terugvorder weens onbehoorlike vervreemding en roekelose bestuur. Hulle kan aanspreeklik gehou word.",
    );

    const customResponse = await transcribe(makeRequest("  vorige chunk se laaste woorde  "));
    assert.equal(customResponse.status, 200);
    assert.equal(upstreamForm.get("prompt"), "vorige chunk se laaste woorde");

    upstreamResponse = {
      segments: [{
        start: 0,
        end: 1,
        text: "Die likwidateur het die boedel van die maatskappy ondersoek en gelde terugvorder weens onbehoorlike vervreemding en roekelose bestuur. Hulle kan aanspreeklik gehou word.",
      }],
    };
    const echoResponse = await transcribe(makeRequest());
    assert.equal(echoResponse.status, 200);
    assert.deepEqual((await echoResponse.json()).segments, []);

    const invalidResponse = await transcribe(makeRequest("x".repeat(201)));
    assert.equal(invalidResponse.status, 400);
    assert.equal(upstreamCalls, 3);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
