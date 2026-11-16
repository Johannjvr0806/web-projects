# VoiceScript

VoiceScript can transcribe audio locally in the browser with Whisper Small or use Groq and Deepgram Cloud. The local model is quantized to int8 and downloads about 250 MB on first use; it uses more device memory and may run slower than Whisper Tiny, while generally providing better recognition. Cloud modes upload audio to the selected provider and may incur charges. Provider API keys are kept as Cloudflare Worker secrets and must never be added to the HTML or committed to Git.

## Enable Cloud Transcription on Cloudflare

1. From the repository root, enter `cloudflare-worker` and set the secrets with Wrangler:
   ```powershell
   Set-Location .\cloudflare-worker
   npx wrangler secret put TRANSCRIPTION_ACCESS_CODE
   npx wrangler secret put GROQ_API_KEY
   npx wrangler secret put DEEPGRAM_API_KEY
   ```
   Wrangler prompts for each value. `ALLOWED_ORIGINS` is optional; the Worker defaults to this repository's GitHub Pages origin and the Netlify site origin.
2. Deploy the Worker:
   ```powershell
   npx wrangler deploy
   ```
3. If the deployed Worker URL differs from the configured URL, update `TRANSCRIPTION_API_URL` in `VoiceScript/index.html`.
4. Open VoiceScript from its HTTPS GitHub Pages/Netlify address or the desktop app's local web server. Choose a cloud provider, select the recording language, and enter the private access code. Cloud mode does not work when opening the HTML directly as `file://`.

Groq extracts audio locally into 90-second mono WAV chunks, skips near-silent chunks, and uploads each remaining chunk to the Cloudflare Worker. Afrikaans requests use a short Afrikaans context prompt by default and pass the previous chunk's transcript as context for the next chunk. The Worker filters prompt echoes and forwards the audio to Groq's multilingual `whisper-large-v3` model at temperature 0. These safeguards cannot guarantee a perfect transcript; review it before relying on it.

Deepgram uses Nova-3 with diarization and utterance timestamps. Afrikaans and English are supported; Auto-Detect uses Nova-3's multilingual mode. Audio is extracted into 5-minute chunks with an 8-second overlap. Names and terms can be added as browser-stored Deepgram keyterms, and Deepgram results use the browser-stored spelling replacements. The app uses shared speech in the overlap to match speaker IDs across adjacent chunks, but a speaker who is not heard in the overlap may receive a new ID later in the recording. The overlap also means slightly more audio is sent and billed. Review speaker labels and corrected text before relying on them.

Both cloud modes send sequential requests through the Cloudflare Worker, which accepts audio chunks up to 25 MiB. Deepgram's 5-minute mono WAV chunks are about 9.6 MB; Groq continues to use 90-second chunks. Cloud processing time depends on network and provider response times; sub-minute completion is not guaranteed. The local on-device mode remains available and does not upload recordings.

## Windows desktop app

The desktop app runs VoiceScript in an isolated Electron window served from a local-only web server, so browser audio workers can work without opening the HTML directly. Install Node.js, open a terminal in the `VoiceScript` folder, and run:

```powershell
npm install
npm run dist:win
```

The Windows installer is created in `VoiceScript/release`. It still uses the same transcription engines: local speed depends on your computer, and cloud modes need a working internet connection, their configured Cloudflare Worker secrets, and may incur charges. The desktop app does not by itself make cloud transcription faster.

Packaged desktop builds check the public GitHub Releases page for updates at startup. When an update has downloaded, choose **Restart now** to install it immediately or **Later** to install it when you next quit the app. Development builds do not check for updates.

To publish an update, increment the app version from the `VoiceScript` folder (for example, `npm version patch --no-git-tag-version`), then set `GH_TOKEN` to a GitHub token with permission to publish releases in this repository and run:

```powershell
npm run release:win
```

The command publishes the Windows installer and update metadata to a GitHub Release. Keep `GH_TOKEN` private and never commit it. The currently installed 1.0.0 installer does not contain the updater, so install a new updater-enabled release once; subsequent releases can update in-app without uninstalling.
