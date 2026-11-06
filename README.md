# NazChat

NazChat is a polished, mobile-first Android AI chat client for OpenAI-compatible providers.

## v2.5.0

- Refined commercial-style app shell with motion, haptic feedback, and accessibility motion reduction
- Composer model selector (kept out of the header)
- Multiple providers and selectable models
- Lyber / OpenAI-compatible native networking without browser CORS restrictions
- Streaming responses and provider reasoning deltas
- Reasoning depth controls: Low, High, Max
- Image attachments with resized vision payloads
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
- `version.json` — update manifest consumed by the app

## Provider setup

1. Open Settings → Add Provider.
2. Use a Base URL such as `https://api.example.com/v1`.
3. Enter the provider API key.
4. Tap Test Connection & Fetch Models.
5. Select models and save.

API keys are stored locally on the device. This app does not operate a proxy server.
