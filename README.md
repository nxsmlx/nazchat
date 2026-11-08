# Kita Chat

Kita Chat is a private, local-first Android BYOK AI chat client for OpenAI-compatible providers.

## Unreleased — Theme consistency fixes

- One shared semantic palette for light/dark surfaces, text, controls, selection, status and code colors
- Theme-aware Settings, model/provider lists, dialogs, terminal, syntax highlighting and preview chrome
- Persisted theme restored before first paint; browser controls and `theme-color` follow the active palette
- Native theme bridge synchronizes WebView background, Android system bars and preview toolbar; generated HTML keeps its own colors
- Portable browser checks for both themes at 360px, 390px and 1440px (`npm run test:themes`; see `tests/README.md`)

Source changes only: the existing `NazChat.apk` and update manifest are not rebuilt or published by this change.

## v4.2.0 — Complete theme audit

- Unified light/dark surfaces, spacing, typography and elevation across header, sidebar, chat canvas, composer, terminal and sheets
- Calmer contrast, consistent glass treatment, and improved readability on both themes
- All interactive states now use subtle surface fills and border highlights
- No more black-on-black or washed-out text in light mode
- Local build only.

## v4.1.0 — Dark mode refinement (local draft)

- Layered graphite dark surfaces with clearer depth and contrast
- Calm steel accent and improved composer, terminal, sheets and message hierarchy
- Light mode and existing interactions remain unchanged

## v4.0.1 — Existing-app updater hotfix

- Package Installer now receives explicit APK MIME type and content URI
- Android install permission is detected and handled with a clear retry path

## v4.0.0 — Approved screen mockup integrated

- Integrated the approved Quiet Workstation mockup into the live app shell
- Persistent desktop conversation rail, focused main workspace and model context header
- Thinking panel, fixed terminal frame and floating composer now follow the approved screen proportions
- Responsive mobile drawer behavior preserved

## v3.9.1 — Updater button hotfix

- Fixed the About → Check for updates button after the Settings Hub refactor
- Added update status elements to the About sub-view and a safe missing-view guard

## v3.9.0 — Global UI/UX audit

- Removed all left accent bars and standardized active states
- Two-line list rows across models, providers, skills and conversations
- Sticky provider filter pills in the model selector
- Consistent SVG search icons, switches, badges and control iconography
- Custom HTML modal/Toast remains the only dialog system

## v3.8.0 — Settings Hub-and-Spoke navigation (local draft)

- Settings is a grouped hub with Providers, Workspace, Skill Library, Appearance and About
- Providers and Skill Library open in dedicated drill-down views
- Provider cards show key status, model counts and truncated URLs without inline action clutter
- Skill Library has search and animated 44×24 toggle switches
- Long lists no longer flood the main Settings page

## v3.7.0 — Custom dialogs and quiet controls (local draft)

- Removed native browser dialogs and added an asynchronous custom modal/Toast system
- Added input/textarea modal modes for rename, project, prompt, style, comparison and encrypted backup flows
- Removed active-state color bars and standardized subtle borders, fills, spacing and elevation
- Replaced remaining emoji controls with consistent SVG line icons

## v3.6.0 — Minimalist visual refinement (local draft)

- Replaced the loud orange/cobalt/lime direction with quiet graphite surfaces and one muted slate accent
- Simplified dialogs and bottom sheets with restrained borders, shadows and spacing
- Kept the SVG tool icon system, fixed-height terminal and two-phase Thinking → Coding workflow
- Added mobile/desktop visual checks for overflow, dialog styling and terminal height

This version is prepared locally but has not been published yet.

## v3.5.0 — Two-phase workflow + modern redesign

- Restored workflow: one Thinking phase, then one Coding phase — no multi-stage splits
- Coding output streams into a fixed 10-line scrollable terminal with traffic-light dots; code never spills into the chat
- Complete visual redesign: new color system, glass header/composer, SVG icons everywhere, spring-animated sheets, unified spacing and typography
- Thinking capped at ~4k tokens (default Medium), reasoning-length rescue, 150s slow-provider tolerance (from 3.4.0)

## v3.3.1 — Code stays in its own frame

- Code being generated renders in a collapsible "Writing html…" frame with live line/size counts instead of spilling into the chat
- Prose before and after the block still streams normally
- Live HTML preview available from inside the frame while generation continues

## v3.3.0 — Real tool calling, zero tuning

- `web_search` and `fetch_url` now actually execute: up to 3 tool rounds, sources attached, calls shown under the answer
- Output budget is automatic — taken from model metadata, learned from provider errors, retried silently; the manual slider is gone
- "Change this" requests send the current document instead of replaying the whole chat, so edits stay complete and previewable
- Providers that reject tools fall back to a plain answer

## v3.2.0 — Long answers fixed

- Default max output tokens raised to 8192; truncation is now reported with a Continue action
- Tool-call-only responses are explained instead of returning an empty message
- Streaming render throttled and lightened so long HTML generations stay responsive
- Stall watchdog surfaces provider waits; preview works again after follow-up edits

## v3.1.3 — Model selection fix

- Fixed model selection snapping back to the first provider when several providers are configured
- Conversation-level model now takes priority over the global default
- Added a multi-provider model selection regression test

## v3.1.2 — Preview rebuilt

- APK previews generated HTML in a dedicated `PreviewActivity` using `loadDataWithBaseURL`, with Blob/data/srcdoc fallback in the browser build
- Preview frame no longer relies on percentage heights, so it cannot collapse
- Broader HTML fence detection and a copyable diagnostics panel when rendering fails

## v3.1.1 — HTML Preview hotfix

- Android WebView HTML Preview now uses a sandboxed data document renderer to avoid blank `srcdoc` frames
- Added a browser regression test for the Preview screen

## v3.1.0 — Production UI polish

- Reworked mobile spacing, typography, hierarchy and component density
- Added Space Grotesk for brand/display hierarchy while retaining Manrope for readable body text
- Refined composer, sidebar, settings sheets, controls, code blocks and dark/light tokens
- Added calmer borders, surfaces, focus states and responsive desktop scaling

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
