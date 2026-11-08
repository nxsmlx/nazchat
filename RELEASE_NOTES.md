# Kita Chat 4.3.1 — Studio launcher icon

- Android home-screen/app-drawer icon now matches the folded K logo inside Kita Studio
- Iris foreground on an ink background, replacing the old green chat-bubble and mint adaptive icons
- Adaptive layers for Android 8+, a monochrome layer for supported Android 13+ themed launchers, and legacy icons in all five standard densities
- Logo stays inside the central 66dp safe circle; system-themed colors are controlled by the launcher
- Version code **37**; package `com.nazchat.app`, existing chat data and original signing identity retained

No changes to chat/provider behavior. Update over the existing app; do not uninstall. Physical-device launcher/cache behavior has not been tested by the agent.

# Kita Chat 4.3.0 — Kita Studio

- A new calm Studio interface: mist/ink surfaces, iris accent, DM Sans, readable conversation layout and a simpler composer
- Dedicated Chats, Projects and Library with real saved conversations, project instructions, prompts and artifacts — not prototype demo content
- Searchable provider/model picker and grouped Tools for web search, thinking, reasoning depth, skills, voice, response styles and model parameters
- Light, Dark and System appearance with larger conversation text; System mode uses Android configuration in the APK
- Project reassignment without deleting messages; prompt-content review before saving; fenced-code artifacts retain embedded backticks and avoid duplicate saves
- Responsive drawers/sheets, keyboard focus/Escape handling and improved mobile touch targets
- Existing `nazchat_v1` data and native provider-key references are retained; no new database or account is required
- Version code **36**, package `com.nazchat.app`; designed for an original-key-signed in-place update from v4.2.2

This is a GitHub Android release, not a Google Play production approval. Browser regression checks and mocked native callbacks do not replace device tests. Physical-device installation, Android keyboard/Back, TalkBack, native networking and lifecycle behavior have not been verified by the build agent. The previously identified production-hardening work remains separate.

# Kita Chat 4.2.2 — Light and dark theme consistency

- Unified semantic colors across chat, composer, sidebar, Settings, providers, model picker, Skill Library, dialogs and preview chrome
- Fixed light-mode surfaces retaining dark backgrounds and low-contrast text; improved dark-mode hierarchy and readable secondary text
- Theme-aware terminal and syntax highlighting, including corrected browser Highlight.js asset
- Restore the saved theme before first paint; keep browser controls, Android system bars and native preview toolbar in sync
- Fixed reduced-motion theme transitions and duplicate input fields in custom dialogs
- 126 theme/screen checks at 360px, 390px and 1440px, plus existing chat/streaming/tools regression tests
- Preserved the Releases API fallback, fixed public API authentication and exact Android version/checksum metadata; stale raw manifests can now be superseded safely
- Fixed native version checks on Android 7 / API 24–27
- Version code 35; package ID `com.nazchat.app` and original signing identity retained for updates without uninstalling

The generated HTML document keeps its own colors. The app does not force its theme onto the document.

# Kita Chat 4.2.1 — Update check fix

The update check was failing to detect new versions when raw.githubusercontent.com served stale `version.json` due to CDN caching.

This release adds a robust fallback:

- First tries `raw.githubusercontent.com/main/version.json` (fast, cache-friendly)
- If that fails or returns invalid data, falls back to GitHub Releases API (`/repos/{owner}/{repo}/releases/latest`) — always fresh, no CDN interference
- Parses APK asset URL to extract version and constructs full metadata on-the-fly
- Still respects `APP_VERSION_CODE`, native updater version, and SHA-256 verification

Now reliably detects latest releases.

# Kita Chat 4.2.0 — Complete theme audit

The previous light/dark modes were inconsistent in spacing, typography and elevation. This release refines both themes globally:

- Header: glass bar with backdrop blur, consistent height and padding
- Sidebar: clean surface, fixed width, subtle border, proper spacing
- Chat canvas: clear max-width, consistent gap, no overflow
- User bubble: calmer background, readable contrast, correct radius
- Thinking panel: distinct but quiet visual treatment, expandable on its own
- Terminal frame: fixed-height, scrollable, with soft monospace styling
- Composer: floating card with full header/footer, model/tools row
- Settings sheets & modals: elevated surfaces, uniform radius, layered shadows
- Action buttons: consistent sizing, spacing and hover states
- All typefaces use a single rhythm: Space Grotesk for display, Manrope for body

Local build only.

# Kita Chat 4.1.0 — Dark mode refinement

Local build — not published yet.

- Dark mode now uses layered graphite surfaces: background `#111318`, surface `#181b22`, raised controls `#222730`
- Clearer separation between header, sidebar, chat canvas, composer, sheets and terminal
- Steel accent `#aeb9c8` replaces the muddy low-contrast treatment without becoming neon
- User bubbles, Thinking, terminal, buttons and Settings cards gain controlled depth and contrast
- Light mode remains unchanged and existing interactions remain covered by the full regression suite

# Kita Chat 4.0.1 — Existing-app updater hotfix

- Android updater now gives Package Installer an explicit APK MIME type
- Uses `ACTION_VIEW` with a readable content URI for better vendor compatibility
- Detects Android 8+ install-permission state and opens the correct system settings screen
- Update UI explains when the user must allow installs from Kita Chat and then retry

# Kita Chat 4.0.0 — Approved screen mockup integrated

- Integrated the approved Quiet Workstation screen into the live app
- Desktop now uses a persistent 252px conversation rail with a focused main workspace
- Header now presents the active conversation context and model controls more like a professional workspace
- Chat measure, user bubbles, assistant header, Thinking panel and terminal frame follow the approved mockup proportions
- Composer is a floating workstation control with compact model/tools footer and a focused send action
- Mobile keeps the rail as a drawer and preserves the compact one-column chat flow
- Existing settings, model selection, tools, preview, skills and provider functionality remain wired to the live shell

# Kita Chat 3.9.1 — Updater button hotfix

- Fixed the About → Check for updates button after the Settings Hub-and-Spoke refactor
- Added the missing update button/status elements to the About sub-view
- Added a safe guard so update checks report a Toast instead of failing on a missing view

# Kita Chat 3.9.0 — Global UI/UX audit

- Removed every `border-left` treatment from the UI; active states use subtle full borders, surface fills and soft elevation
- Standardized model, provider, skill and conversation rows into clear two-line layouts with ellipsis and right-side metadata
- Model picker now has sticky provider filter pills with counts, plus search and model metadata pills
- Search inputs share one leading SVG magnifier treatment and consistent spacing
- Skill toggles, provider key status, model counts and settings summaries use consistent badges/switches
- Removed remaining text/emoji icons from controls in favor of inline SVG line iconography
- Custom modal/Toast system remains the only dialog path; no native browser prompts remain

Local build is now ready for publish.

# Kita Chat 3.8.0 — Settings Hub-and-Spoke navigation

Local build — not published yet.

- Settings is now a grouped hub: Providers, Workspace, Skill Library, Appearance and About
- No provider or skill list is dumped into the main Settings view
- Providers open in a dedicated drill-down with sticky Back/+ Add controls, compact cards, truncated URLs, key status dots and model-count pills
- Skill Library opens in its own searchable view with a single header flow and animated 44×24 toggle switches
- Related rows are grouped inside elevated containers with internal dividers; long lists stay in dedicated views
- Settings sub-pages use progressive disclosure instead of one infinite scroll

# Kita Chat 3.7.0 — Custom dialogs and quiet controls

Local build — not published yet.

- Removed all native `window.alert`, `window.confirm` and `window.prompt` usage from the app
- Added a reusable asynchronous custom dialog with backdrop blur, elevated dark surface, Cancel/Continue actions and destructive Delete styling
- Added input and textarea modes for rename, project, prompt, style, model comparison and encrypted backup flows
- Removed active conversation/card color bars; selected states now use subtle full borders and background fills
- Standardized sidebar items to 16px padding, 10px/14px conversation rows and 6px list gaps
- Replaced remaining moon, pencil, microphone, speaker and trash emoji controls with consistent SVG line icons
- Added regression checks for no native dialogs, modal styling and fixed terminal layout

# Kita Chat 3.6.0 — Minimalist visual refinement

The previous bold color direction was too loud. This pass keeps the professional hierarchy but removes the neon/signal treatment:

- Quiet graphite surfaces in dark mode and restrained off-white surfaces in light mode
- One muted slate accent instead of orange/cobalt/lime combinations
- Dialogs use a clean 14px surface, thin border and restrained shadow — no gradients or Android-style visual noise
- Sheets, cards, buttons and composer use one consistent radius/spacing system
- Tool icons remain a consistent SVG family, with no emoji or saturated color coding
- Thinking, phase progress and terminal remain visually distinct but calm
- Added mobile/desktop layout checks for overflow, dialog styling and fixed terminal height

Local build only — not published yet.

# Kita Chat 3.5.0 — Two-phase workflow + modern redesign

### Workflow restored: Thinking, then Coding — once each
Long builds now run exactly **one thinking phase followed by one coding phase**, never a chain of thinking/coding stages:

- **Phase 1 (Think):** a small planning call whose output is recorded in the Thinking panel
- **Phase 2 (Code):** a single call that writes the entire artifact with the full model budget; if it is cut off it is continued once, still one phase
- The chat shows clear `Thinking → Coding` step chips while it runs

### Terminal frame — code never spills into chat
Coding output now streams into a real terminal component:

- Fixed height of about 10 lines; vertical scrolling happens **inside the frame only**
- Traffic-light dots, live line/size counter and a blinking cursor
- Collapse/Expand and ▶ Preview (for HTML) available while it is still writing
- No matter how much code is generated, the main chat stays clean and conversational

### Complete visual redesign (v3.5 "modern agent platform")
- New cohesive dark/light system: deep neutral surfaces, violet accent, softer borders
- Glass header and composer with backdrop blur; spring-animated bottom sheets
- All tool buttons now use consistent inline SVG icons (skills, thinking, depth, search, more) — no more emoji
- Unified spacing rhythm, consistent radii, button heights, focus rings and pressed states
- Markdown, tables, blockquotes, skill chips, tool traces and dialogs restyled to match

### Also in this release (from 3.4.0)
- Thinking is capped at ~4k tokens and defaults to Medium effort; a stream that dies inside reasoning is rescued automatically
- Slow providers (first byte after 60–130s) no longer fail: the status wait is now 150s and the watchdog explains the wait
- Automatic output budget, native web_search/fetch_url tools, edit-focused requests, model selection fixes

# Kita Chat 3.3.1 — Code stays in its own frame

While an answer is being written, code used to pour straight into the message text. It now behaves like the thinking panel:

- Once a ```` ``` ```` block opens, the code moves into its own collapsible frame headed **⌨ Writing html…** with live line and size counts
- The frame body scrolls itself to the newest line and never dumps thousands of lines into the chat
- Prose before the block still streams above it, and prose after the block appears once it closes
- **▶ Preview** is available inside the frame while HTML is still being generated, with the live preview updating as it arrives
- When generation finishes the frame is replaced by the normal collapsed code block with Copy, Preview, and Expand

# Kita Chat 3.3.0 — Real tool calling, zero tuning

### Tools now actually run
Kita Chat used to stop at "this model tried to call a tool". Now the model can search and read the web, and Kita Chat executes those calls itself:

- `web_search` — live results with sources attached to the answer
- `fetch_url` — reads a page or API response so answers can follow real documentation
- Up to 3 tool rounds per message, with each call shown under the answer as "🔧 1 tool call · Search: … 412ms"
- Providers that reject `tools` are detected and answered without them, silently
- Tool calling is on by default; no setting to enable

### Output length is no longer yours to manage
- The max-output slider is gone. Kita Chat asks for the largest budget the model allows (from model metadata, or 60% of the context window)
- If a provider still rejects that number, the real ceiling is read from the error, saved, and the request is retried automatically
- If a model genuinely stops early, the answer says so and offers **Continue**

### Asking for changes keeps working
- "Ubah tajuk jadi merah" on a generated page now sends the current document with your change, not 30 messages of history
- Smaller requests, fewer cut-offs, and the page cannot drift because it is edited from its real source

### Other fixes
- Web search no longer runs twice when it is toggled on
- Streaming stays responsive during long generations
- Stall watchdog reports provider waits

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
