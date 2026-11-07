# Kita Chat

Kita Chat is a private, local-first Android BYOK AI chat client for OpenAI-compatible providers.

## v3.0.1 — Reply and Preview hotfix

- Restored native replies after secure provider-key migration by persisting secret references for new providers
- Added a clear missing-provider-key recovery path
- Restored direct Preview on completed HTML answers and normalized HTML/XHTML fenced labels

## v3.0.0 — Kita Chat flagship foundation

- Kita Chat branding and adaptive K speech-mark launcher icon
- Keystore-backed API secret storage in the APK; raw keys are excluded from localStorage snapshots and backups
- Legacy NazChat state migration with schema versioning
- Provider presets for OpenAI, Anthropic, Gemini, OpenRouter, DeepSeek, Ollama/local and custom endpoints
- Project workspaces with project instructions and local document source indexing/retrieval
- Prompt library, response styles, saved artifacts and model parameter controls
- Context/token estimates, per-response usage/cost display, and multi-model comparison action
- Hardened stream cleanup and native secret-aware network paths
- First-run Kita Chat onboarding and safe backup format

## v2.8.0

- 12 curated expert skills: planning, frontend design, UI/UX and accessibility, TypeScript/web, backend/API, SQL/Supabase, debugging, testing, code review, Android/Kotlin, security, and MCP/integrations
- Automatic prompt routing (up to 3 relevant skills) or explicit manual skill selection from the composer
- Persistent skill badges and a Review & Improve action for code answers
- Quiet Skill Library in Settings with enable/disable controls, details, custom skills, and local/URL SKILL.md import
- Bundled offline skill pack plus background updates from `skills.json`
- Context-aware prompt budgets, with no skill injection for casual conversation
- Image generation and image/vision attachments removed; document and code attachments remain
- Sources and adaptations documented in `THIRD_PARTY_NOTICES.md`

## Earlier highlights

- Refined commercial-style app shell with motion, haptic feedback, and accessibility motion reduction
- Composer model selector (kept out of the header)
- Multiple providers and selectable models
- Lyber / OpenAI-compatible native networking without browser CORS restrictions
- Streaming responses and provider reasoning deltas
- Reasoning depth controls: Low, High, Max
- Text, Markdown, code, PDF, and DOCX attachments with client-side extraction
- Markdown tables, code copy, syntax highlighting, LaTeX, sources, regenerate/edit
- Search conversations and local backup export/import
- Dark/light theme
- GitHub update check from Settings
- Conversation search, date grouping, pinning, double-tap rename, and polished sidebar

## Project layout

- `nazchat/index.html` — Kita Chat web source — standalone web app / preview source
- `nazchat-apk/` — native WebView APK wrapper and network bridge
- `NazChat.apk` — signed Kita Chat APK artifact (kept for update compatibility) — built signed APK
- `version.json` — APK update manifest consumed by the app
- `skills.json` — remotely updatable skill pack, also bundled into the app
- `THIRD_PARTY_NOTICES.md` and `licenses/` — skill attribution and licenses

## Provider setup

1. Open Settings → Add Provider.
2. Use a Base URL such as `https://api.example.com/v1`.
3. Enter the provider API key.
4. Tap Test Connection & Fetch Models.
5. Select models and save.

In the Android APK, API keys are encrypted using an Android Keystore-backed AES-GCM secret store and are sent directly to the selected provider. Safe backups exclude raw keys. The browser preview falls back to local browser storage because Android Keystore is unavailable there. Kita Chat does not operate a proxy server.
