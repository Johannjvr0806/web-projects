# VoiceScript

VoiceScript can transcribe audio locally in the browser with Whisper Small or use Groq and Deepgram Cloud. The local model is quantized to int8 and downloads about 250 MB on first use; it uses more device memory and may run slower than Whisper Tiny, while generally providing better recognition. Cloud modes upload audio to the selected provider and may incur charges. Provider API keys are kept in Netlify Functions and must never be added to the HTML or committed to Git.

## Enable Cloud Transcription on Netlify

1. Deploy this repository to the Netlify site `johann-dev-workspace.netlify.app`. The root `netlify.toml` publishes the existing site and registers `netlify/functions`.
2. In Netlify, open **Site configuration → Environment variables** and add:
   - `TRANSCRIPTION_ACCESS_CODE`: a long, private passphrase of your choice. Enter the same passphrase in VoiceScript's Cloud mode. Do not commit this value or share it publicly.
   - `GROQ_API_KEY`: your API key from the Groq Console, if you use Groq.
   - `DEEPGRAM_API_KEY`: your API key from the Deepgram Console, if you use Deepgram.
   - Optionally, `ALLOWED_ORIGINS`: comma-separated allowed website origins. If omitted, the function allows this repository's GitHub Pages origin and the Netlify site origin.
3. Redeploy the Netlify site after setting or changing environment variables.
4. Open VoiceScript from its HTTPS GitHub Pages/Netlify address or the desktop app's local web server. Choose a cloud provider, select the recording language, and enter the private access code. Cloud mode does not work when opening the HTML directly as `file://`.

Groq extracts audio locally into 90-second mono WAV chunks, then uploads each chunk to the Netlify Function, which forwards it to Groq's multilingual `whisper-large-v3` model. Afrikaans requests include an Afrikaans example as context and filter likely silence, repeated loops, or low-confidence prompt echoes. These safeguards cannot guarantee a perfect transcript; review the transcript before relying on it.

Deepgram uses Nova-3 with diarization and utterance timestamps. Afrikaans and English are supported; Auto-Detect uses Nova-3's multilingual mode. Audio is extracted into 90-second chunks with an 8-second overlap. The app uses shared speech in the overlap to match speaker IDs across adjacent chunks, but a speaker who is not heard in the overlap may receive a new ID later in the recording. The overlap also means slightly more audio is sent and billed. Review speaker labels before relying on them.

Both cloud modes send sequential requests through the Netlify Function. Netlify's function payload limit means chunks must remain small; the function rejects a chunk larger than 3 MiB. Cloud processing time depends on network and provider response times; sub-minute completion is not guaranteed. The local on-device mode remains available and does not upload recordings.

## Windows desktop app

The desktop app runs VoiceScript in an isolated Electron window served from a local-only web server, so browser audio workers can work without opening the HTML directly. Install Node.js, open a terminal in the `VoiceScript` folder, and run:

```powershell
npm install
npm run dist:win
```

The Windows installer is created in `VoiceScript/release`. It still uses the same transcription engines: local speed depends on your computer, and cloud modes need a working internet connection, their configured Netlify secrets, and may incur charges. The desktop app does not by itself make cloud transcription faster.

Packaged desktop builds check the public GitHub Releases page for updates at startup. When an update has downloaded, choose **Restart now** to install it immediately or **Later** to install it when you next quit the app. Development builds do not check for updates.

To publish an update, increment the app version from the `VoiceScript` folder (for example, `npm version patch --no-git-tag-version`), then set `GH_TOKEN` to a GitHub token with permission to publish releases in this repository and run:

```powershell
npm run release:win
```

The command publishes the Windows installer and update metadata to a GitHub Release. Keep `GH_TOKEN` private and never commit it. The currently installed 1.0.0 installer does not contain the updater, so install a new updater-enabled release once; subsequent releases can update in-app without uninstalling.
