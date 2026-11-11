# VoiceScript

VoiceScript can transcribe audio locally in the browser or use Groq Cloud for faster transcription. Cloud mode sends audio to Groq in 90-second chunks and may incur provider charges. The Groq API key is kept in a Netlify Function and must never be added to the HTML or committed to Git.

## Enable Groq Cloud on Netlify

1. Deploy this repository to the Netlify site `johann-dev-workspace.netlify.app`. The root `netlify.toml` publishes the existing site and registers `netlify/functions`.
2. In Netlify, open **Site configuration → Environment variables** and add:
   - `GROQ_API_KEY`: your API key from the Groq Console.
   - `TRANSCRIPTION_ACCESS_CODE`: a long, private passphrase of your choice. Enter the same passphrase in VoiceScript's Cloud mode. Do not commit this value or share it publicly.
   - Optionally, `ALLOWED_ORIGINS`: comma-separated allowed website origins. If omitted, the function allows this repository's GitHub Pages origin and the Netlify site origin.
3. Redeploy the Netlify site after setting or changing environment variables.
4. Open VoiceScript and choose **Groq Cloud**. Select the recording language and enter the private access code.

Cloud mode extracts audio locally into 90-second mono WAV chunks, then uploads each chunk to the Netlify Function, which forwards it to Groq's multilingual `whisper-large-v3` model for higher accuracy. Afrikaans requests include a short prompt encouraging standard South African Afrikaans spelling rather than Dutch; this can guide the model but cannot guarantee a perfect transcript. A 90-minute recording requires about 60 sequential requests. Netlify's function payload limit means cloud chunks must remain small; the function rejects a chunk larger than 3 MiB. Cloud processing time depends on network and provider response times; sub-minute completion is not guaranteed. The local on-device mode remains available and does not upload recordings.

## Windows desktop app

The desktop app runs VoiceScript in an isolated Electron window served from a local-only web server, so browser audio workers can work without opening the HTML directly. Install Node.js, open a terminal in the `VoiceScript` folder, and run:

```powershell
npm install
npm run dist:win
```

The Windows installer is created in `VoiceScript/release`. It still uses the same transcription engines: local speed depends on your computer, and Groq Cloud still needs a working internet connection, configured Netlify secrets, and may incur charges. The desktop app does not by itself make Groq transcription faster.
