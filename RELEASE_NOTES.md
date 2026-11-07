# Kita Chat 3.0.0 — Flagship BYOK foundation

Kita Chat is the rebrand and security/UX overhaul of NazChat. The existing Android package ID remains compatible so users can update without losing app installation identity.

## Trust & identity

- Kita Chat brand, onboarding, empty state, updater labels and adaptive K speech-mark icon
- Schema versioning and migration for existing NazChat local state
- Android Keystore-backed AES-GCM provider secret storage
- Raw provider keys removed from Android localStorage snapshots and safe backups
- Provider key remove/status control in Settings
- Safe `kita-chat-backup-v2.json` export format with secrets excluded

## Provider and chat workflow

- Provider presets for OpenAI, Anthropic, Gemini, OpenRouter, DeepSeek, Ollama/local and custom endpoints
- Secure native model-fetch and stream paths that load API keys only inside the native network layer
- Model parameters: temperature, top-p and max output tokens
- Project-level instructions and local source indexing/retrieval
- Prompt library with reusable prompts
- Response style profiles
- Context/token estimate and estimated cost shown on assistant responses when usage data is available
- Sequential multi-model comparison for a completed answer
- Save HTML/code outputs to the local artifact library
- First-run onboarding explaining the BYOK model

## Native hardening

- Native streams are cancelled during Activity destruction
- Static WebView references are cleared during teardown
- Mixed content is disabled
- Cross-file and universal file URL access are disabled while keeping bundled assets loadable
- Native secrets bridge exposes presence/removal but does not return raw key values to JavaScript

## Compatibility and limitations

- The existing package ID remains `com.nazchat.app` for seamless updates; the visible app identity is Kita Chat.
- Browser preview mode cannot use Android Keystore and falls back to browser storage; the Android APK is the secure target.
- Full Room/Compose migration, background resumable streams, voice mode and encrypted cross-device sync remain future architecture work.
- Image generation and image/vision attachments remain removed. PDF, DOCX, text, Markdown, CSV, JSON, HTML, CSS, XML and source-code attachments remain supported.

## Attribution

Skill instructions remain adapted from Anthropic Agent Skills (Apache-2.0), Superpowers (MIT), UI UX Pro Max (MIT), and Awesome Cursor Rules (CC0-1.0). See `THIRD_PARTY_NOTICES.md` and `licenses/`.
