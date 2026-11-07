# Kita Chat architecture

## Current release: 3.3.0

Kita Chat remains an incremental hybrid Android client so existing `com.nazchat.app` installations can update in place. The visible identity, icon and UI are Kita Chat; the package id is intentionally retained for update compatibility.

## Trust boundary

- The Android APK stores provider keys in `NazSecrets`, encrypted with an AES-GCM key held by Android Keystore.
- JavaScript receives a secret reference and never needs the raw key for native provider requests.
- `NazBridge.fetchSecret` and `NazStream.openSecret` load the key inside native networking.
- Safe backups remove `apiKey`; encrypted backups use a user passphrase and AES-GCM in the app.
- Browser preview mode has no Android Keystore and uses browser storage only as a development fallback.

## Feature layers

- UI: single mobile-first HTML shell, Markdown/LaTeX/code renderer, HTML artifact preview, composer, settings sheets.
- Local state: schema-versioned `nazchat_v1` migration with providers, conversations, projects, prompts, styles, artifacts and skill settings.
- Project context: extracted document text is chunked locally, indexed by simple term overlap and added as explicitly-labelled untrusted reference material.
- Provider layer: presets and custom OpenAI-compatible endpoints, capability metadata, parameters, usage/cost estimates, native secret-aware streaming.
- Automatic output budget: `autoMaxTokens()` derives the ceiling from model metadata (`max_completion_tokens`, else 60% of context, else 16384). Users never set it; `learnTokenCeiling()` reads a provider rejection, stores the real limit and retries silently.
- Native tool calling: `web_search` and `fetch_url` declare JSON schemas, the stream accumulates `tool_calls` (chat-completions and Responses shapes), Kita executes them and feeds results back for up to 3 rounds. Every call is recorded in `msg.toolTrace` and rendered as visible provenance. Providers that reject `tools` are detected and retried without them.
- Edit routing: `lastHtmlArtifact()` + `isEditRequest()` send the current document with the change request instead of replaying the whole chat, so edits cost less and cannot inherit stale markup.
- Streaming: paint is throttled to ~140ms, long streams render as plain text until completion, and a watchdog reports provider stalls.
- Skills: bundled and remotely-updatable curated prompt guidance with auto/manual routing and local custom imports.
- Native: WebView, file picker, haptics, Keystore secret store, speech dictation, stream cleanup and silent APK updater.

## Intentional limitations

- Full Room/Compose migration is deferred until the hybrid migration has sufficient device telemetry and a stable data schema.
- Streaming is not resumable after process death; partial UI streams are cancelled during Activity teardown.
- Local retrieval currently uses lightweight term-overlap chunk selection rather than embeddings.
- Model comparison is sequential for reliability and predictable provider rate limits.
- Tools are executed only by Kita (web_search, fetch_url); arbitrary user-defined tool endpoints are not yet supported.
- The package id is still `com.nazchat.app` to preserve upgrade compatibility.
