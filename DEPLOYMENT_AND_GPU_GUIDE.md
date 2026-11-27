# VoiceLab AI Studio — Deployment & Self-Hosted GPU Worker Guide

## 1. Architecture Overview
- **Frontend**: React 19, TypeScript, Tailwind CSS v4 (mobile-first & Android-ready)
- **Web/API Server**: Node.js + Express (`server.ts`) handling Firebase ID token verification, private audio file storage (`storage/samples/<uid>/`), real WAV/audio validation, background job queue, OpenAPI 3.0 spec (`/api/v1/openapi.json`), and modular AI Engine Adapters (`server/adapters/voiceEngine.ts`).
- **Database & Auth**: Firebase Authentication (Google Sign-In) + Cloud Firestore (`firestore.rules` + `firebase-blueprint.json`).
- **AI Inference Worker (Modular External GPU Service)**: Self-hosted Python FastAPI GPU worker connected via `VOICE_ENGINE_URL`.

---

## 2. Environment Variables
Configure these in your deployment environment (`.env` / Secrets panel):

- `GEMINI_API_KEY`: Optional Gemini API key (server-side only).
- `APP_URL`: Public URL of the deployed web app.
- `VOICE_ENGINE_URL`: Base URL of your Python FastAPI GPU worker (e.g. `https://gpu-worker.example.com`).
- `VOICE_ENGINE_API_KEY`: Bearer token sent to your FastAPI GPU worker.
- `EXTERNAL_TTS_ENDPOINT`: Optional external REST TTS provider endpoint.
- `EXTERNAL_TTS_API_KEY`: Bearer token for the external REST TTS provider.
- `MAX_AUDIO_UPLOAD_MB`: Maximum upload size in MB (default `25`).
- `TEMP_FILE_RETENTION_HOURS`: Retention window before temporary uploads are purged (default `24`).

---

## 3. Recommended Self-Hosted AI Models & GPU Resources
Because Bangladeshi Bengali (`bn-BD`) pronunciation and zero-shot voice cloning require verified multilingual weights:

1. **Text-to-Speech & Voice Cloning (Bangladeshi Bengali + English)**
   - **Fish-Speech 1.5 / OpenAudio** or **CosyVoice 2** (Apache-2.0 / check model license before commercial SaaS deployment; fine-tune on Bangladeshi Bengali speech datasets such as OpenSLR SLR53 / verified studio recordings for authentic Dhaka accent).
   - **F5-TTS** (MIT license, zero-shot voice cloning, requires Bengali grapheme/phoneme training for natural Bangla).
   - **Coqui XTTS-v2** (CPML / commercial license required for commercial SaaS; English + 16 languages baseline).
2. **Speech Recognition & Translation (AI Dubbing)**
   - **Faster-Whisper Large-v3** (MIT) for Bangla & English transcription.
3. **Speech Enhancement**
   - **DeepFilterNet 3** (MIT/Apache-2.0) for real-time denoising & dereverberation.
4. **Recommended GPU Hardware**
   - **Development / Single Stream**: 1x NVIDIA RTX 4090 (24 GB VRAM) or L4 (24 GB VRAM).
   - **Production Multi-Worker**: 1x–4x NVIDIA A10G / L40S / A100 (40–80 GB VRAM) behind Redis + Celery/RQ autoscaling workers.

---

## 4. FastAPI GPU Worker Contract (`VOICE_ENGINE_URL`)
Your Python FastAPI GPU service should implement:
- `GET /health` -> `200 OK { "status": "ok" }`
- `POST /v1/voice-clone` -> accepts `{ voice_id, voice_name, language, sample_path, mime_type }`, extracts speaker embedding, returns `200 OK`
- `POST /v1/tts` -> accepts `{ text, language, voiceId, voiceType, sampleFilePath, controls }`, returns `audio/wav` bytes

---

## 5. Running & Deploying
- **Development**: `npm install && npm run dev` (starts `tsx server.ts` on port `3000`).
- **Type Check**: `npm run lint`
- **Production Build**: `npm run build`
- **Production Start**: `NODE_ENV=production npm start`
