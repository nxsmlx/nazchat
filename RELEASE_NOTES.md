# Kita Chat 3.2.0 — Long answers fixed

Two symptoms had one root cause: the default output budget was 2048 tokens. A full HTML page is much larger, so the stream was cut off mid-code. The UI showed nothing useful, and any follow-up "change this" reply was cut off too, which is why the second preview never worked.

- Default **Max output tokens** raised from 2048 to **8192** (still adjustable per model in Tools)
- Truncated answers now say so explicitly and offer **▶ Continue** instead of ending silently
- Tool-call-only streams are explained in plain language instead of producing an empty reply
- Streaming render is throttled to ~140ms and skips syntax highlighting/KaTeX mid-stream, so long pages cannot freeze the WebView
- Answers over ~12k characters render as lightweight text while streaming, then as full Markdown when finished
- A stall watchdog shows "Waiting for the provider…" with elapsed seconds instead of appearing dead
- HTML detection prefers a complete document when a reply contains several fences
- New `tests/streaming-long-answers.test.js` covers 42k-character generations, follow-up edits, truncation, tool calls, and the default budget

# Kita Chat 3.1.3 — Model selection fix

Choosing a model with more than one provider configured appeared to do nothing: the picker closed but the composer kept showing the first provider's model.

- `currentModel()` now resolves the selected provider by ID instead of falling back to the first provider that has models
- The active conversation's provider/model take priority, so each chat keeps its own model
- The picker re-renders after a pick, so the check mark and selected row are correct
- Clearer empty state when a provider has no models selected yet
- Regression test covers selecting a model from the second provider

# Kita Chat 3.1.2 — Preview rebuilt

- APK previews generated HTML in a dedicated `PreviewActivity` via `loadDataWithBaseURL`, with Blob/data/srcdoc fallback in the browser build
- Preview frame can no longer collapse, and `data:`/`blob:`/`about:` navigations are no longer hijacked
- Broader HTML detection plus a copyable diagnostics panel when rendering fails

# Kita Chat 3.1.1 — HTML Preview hotfix

- Fixes blank HTML Preview frames in Android WebView by rendering the sandboxed preview through a data document instead of relying only on `iframe.srcdoc`.
- Preserves Preview / Code / Console tabs, live updates, sandboxing and console nonce validation.
- Adds a browser regression test for the preview renderer.

# Kita Chat 3.1.0 — Production UI polish

- Refined mobile-first spacing with a consistent 4/8 rhythm and calmer vertical pacing.
- Rebalanced typography with Manrope body text and Space Grotesk display/control hierarchy.
- Reduced generic rounded-card treatment and replaced it with quieter borders, surfaces and depth.
- Improved composer density, touch targets, model hierarchy and tool grouping.
- Refined sidebar, sheets, settings rows, code blocks, markdown rhythm and preview controls.
- Improved dark/light tokens, contrast, focus states and compact desktop scaling.

# Kita Chat 3.0.1 — Reply and Preview hotfix

- Fixes provider secret references for newly added providers after the Keystore migration.
- Shows a clear missing-key recovery message instead of silently sending an unauthenticated request.
- Restores a direct Preview action on completed HTML answers.
- Normalizes fenced language labels so `HTML`/`XHTML` blocks preview correctly.
- Adds preview console nonce/source validation without suppressing runtime error messages.

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
