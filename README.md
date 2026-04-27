# CharacterVoice

AI-powered character-matched book narration. Detects every character in a book and gives them a unique voice profile (age, gender, accent, tone, personality) so when Mr. Darcy speaks, he sounds like Mr. Darcy.

**Patent Pending** — U.S. Provisional Application No. 64/044,893
**Created by** Adolfo Castillo-Martinez (Founder)

---

## What it does

1. **Upload a book** — drop in any plain-text book.
2. **Character Voice DNA** — the engine parses dialogue, identifies every speaker, and builds a voice profile per character (age, gender, accent, voice tone, personality traits).
3. **Listen** — press play and the book is read aloud with each character speaking in their own matched voice. Narration uses a calm narrator voice for non-dialogue text.

The included demo loads *Pride and Prejudice* by Jane Austen (public domain) so you can hear it in action without uploading anything.

---

## Tech stack

- **Frontend:** React + Vite + Tailwind + shadcn/ui
- **Backend:** Express + Drizzle ORM + SQLite (in-memory in production)
- **Voice:** Web Speech API (browser-native TTS) — no audio files, no model weights, no voice cloning

This stack is intentionally light: no proprietary voice clones, no copyrighted training data, no audio assets in the repo. See `LEGAL.md` for the audit notes.

---

## Local development

```bash
npm install
npm run dev
```

Server runs on `http://localhost:5000`.

## Production build

```bash
npm run build
npm start
```

## Deployment

This repo is configured for Render via `render.yaml`. The free tier uses an ephemeral filesystem, so the app runs SQLite in `:memory:` mode in production. Each cold start gets a clean slate; visitors load the demo book with a single click.

---

## License

MIT — see `LICENSE`. The codebase is original work and does not bundle copyrighted text, audio, or model weights.
