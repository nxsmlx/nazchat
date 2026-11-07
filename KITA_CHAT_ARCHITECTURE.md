# Kita Chat architecture

## Current release: 3.1.2

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
- Skills: bundled and remotely-updatable curated prompt guidance with auto/manual routing and local custom imports.
- Native: WebView, file picker, haptics, Keystore secret store, speech dictation, stream cleanup and silent APK updater.

## Intentional limitations

- Full Room/Compose migration is deferred until the hybrid migration has sufficient device telemetry and a stable data schema.
- Streaming is not resumable after process death; partial UI streams are cancelled during Activity teardown.
- Local retrieval currently uses lightweight term-overlap chunk selection rather than embeddings.
- Model comparison is sequential for reliability and predictable provider rate limits.
- The package id is still `com.nazchat.app` to preserve upgrade compatibility.
