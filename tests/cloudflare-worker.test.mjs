import assert from "node:assert/strict";
import { test } from "node:test";
import worker from "../cloudflare-worker/src/index.mjs";

test("Cloudflare Worker uses env secrets and preserves Groq Afrikaans behavior", async () => {
  const originalFetch = globalThis.fetch;
  const env = {
    TRANSCRIPTION_ACCESS_CODE: "worker-access-code",
    GROQ_API_KEY: "worker-groq-key",
  };
  let upstreamForm;
  let upstreamAuthorization;
  let upstreamResponse = { segments: [] };
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://api.groq.com/openai/v1/audio/transcriptions");
    upstreamForm = options.body;
    upstreamAuthorization = options.headers.Authorization;
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
    return new Request("https://voicescript.example/transcribe", {
      method: "POST",
      headers: {
        Authorization: "Bearer worker-access-code",
        Origin: "https://johannjvr0806.github.io",
      },
      body: form,
    });
  };

  try {
    const response = await worker.fetch(makeRequest(), env);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://johannjvr0806.github.io");
    assert.equal(upstreamAuthorization, "Bearer worker-groq-key");
    assert.equal(upstreamForm.get("model"), "whisper-large-v3");
    assert.equal(upstreamForm.get("temperature"), "0");
    assert.equal(
      upstreamForm.get("prompt"),
      "Die likwidateur het die boedel van die maatskappy ondersoek en gelde terugvorder weens onbehoorlike vervreemding en roekelose bestuur. Hulle kan aanspreeklik gehou word.",
    );

    await worker.fetch(makeRequest("  vorige chunk  "), env);
    assert.equal(upstreamForm.get("prompt"), "vorige chunk");

    upstreamResponse = {
      segments: [{
        start: 0,
        end: 1,
        text: "Die likwidateur het die boedel van die maatskappy ondersoek en gelde terugvorder weens onbehoorlike vervreemding en roekelose bestuur. Hulle kan aanspreeklik gehou word.",
      }],
    };
    const echoResponse = await worker.fetch(makeRequest(), env);
    assert.deepEqual((await echoResponse.json()).segments, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
