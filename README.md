# NazChat

NazChat is a polished, mobile-first Android AI chat client for OpenAI-compatible providers.

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

- `nazchat/index.html` — standalone web app / preview source
- `nazchat-apk/` — native WebView APK wrapper and network bridge
- `NazChat.apk` — built signed APK
- `version.json` — APK update manifest consumed by the app
- `skills.json` — remotely updatable skill pack, also bundled into the app
- `THIRD_PARTY_NOTICES.md` and `licenses/` — skill attribution and licenses

## Provider setup

1. Open Settings → Add Provider.
2. Use a Base URL such as `https://api.example.com/v1`.
3. Enter the provider API key.
4. Tap Test Connection & Fetch Models.
5. Select models and save.

API keys are stored locally on the device. This app does not operate a proxy server.
