# Kita Chat 4.8.0

Choose your accent colour and how much tools may do without asking.

- Settings → Appearance → Accent colour: Iris (Kita's colour, a little brighter in light mode), Lagoon, Ocean, Sunset or Forest, in light and dark. The app icon stays Iris.
- Settings → Permissions:
  - Careful: ask before every tool and every page the assistant chooses.
  - Balanced (default): tools that declare themselves read-only run without asking; anything that can change data asks first.
  - Bypass all: every tool and page runs without asking, including ones that can delete or send. Turning it on needs a confirmation, and a red badge above the message box shows while it is on; tap its × to turn it off.
- Tool prompts offer Allow once, Allow for this chat, Always allow this tool (not for tools marked destructive) and Decline. Page prompts can allow a site for the current chat.
- Per-tool rules (Ask, Always allow, Block) for every connected MCP tool, and a log of everything that ran without asking.
- Private network addresses stay blocked in every mode.
- A closed dialog can no longer leave an invisible layer that blocks taps if its fade-out animation stalls.
- VersionCode 53, same com.nazchat.app package and original signing identity. Not tested on a real device.

# Kita Chat 4.7.0

Smarter answers for long chats and code, and One UI style navigation. Includes every fix from 4.6.2 below.

- Glass navigation bar (Home, Chats, Projects, Library, Settings) on phones. It steps aside inside a conversation so the message box keeps the bottom of the screen.
- The update notice is a floating glass card; swipe it sideways to hide it until tomorrow.
- Web pages Kita writes are tested in a hidden, isolated viewer. If they throw errors, Kita sends the errors back to the model and replaces the page with the corrected version (up to two rounds). The answer shows "Page tested: no errors" or what was fixed. Turn it off in Tools → Test web pages.
- Research: up to six search/read steps before the final answer (was three), each shown as "Step n".
- Long chats: older messages are condensed into a running summary and the latest twelve are sent in full, which keeps long conversations within the model's limits and costs less. Short chats are unchanged.
- Fixed Compare models (and the new summary) calling a wrong address for providers whose URL has no trailing slash.
- VersionCode 52, same com.nazchat.app package and original signing identity. Not tested on a real device.

# Kita Chat 4.6.2

Answers that survive a dropped connection, and fewer wrong turns.

- If the connection drops while an answer is being written, Kita reconnects (up to twice) and continues from the text it already received instead of starting over. A stream that stops without finishing is treated the same way.
- If it still cannot finish, the text so far is kept and the answer shows Continue (pick up from there) and Try again (start over). The error note is never sent back to the model.
- Long builds retry a dropped part automatically; finished parts are always kept and Resume build continues from the first unfinished part.
- A long message or a question about code or an error is answered normally. Before, any message over 180 characters was treated as a page or report build and split into parts.
- Thinking: models that reason natively (o-series, GPT-5, DeepSeek-R1, Qwen3, Claude 4, Gemini 2.5+ and others) are no longer also asked to write <think> tags, which made them reason twice.
- Updates: Kita checks for a new version every time it opens (and after 30 minutes in the background). A failed check is retried next time. "Update now" starts the download and install directly.
- VersionCode 51, same com.nazchat.app package and original signing identity. Not tested on a real device.

# Kita Chat 4.6.1

Fixes saving files on Android.

- Export backup, Export encrypted backup, the Download button on code blocks and Download in HTML preview did nothing on Android: the app's WebView ignored them, so no file was saved. They now open Android's "Save to" screen, where you choose the folder (for example Downloads). No storage permission is needed.
- Backup files include the date in their name, for example kita-chat-backup-2026-11-10.json.
- MCP sign-in: when a server rejects the token step (HTTP 400), the message now shows the server's reason (for example invalid_grant or invalid_client). If the server does not accept the resource parameter, sign-in retries once without it and remembers that. If it rejects Kita Chat's client ID, the next sign-in registers again.
- MCP tool errors (HTTP 400 and others) include the server's message.
- VersionCode 50, same com.nazchat.app package and original signing identity. Not tested on a real device.

# Kita Chat 4.6.0

Interface update: easier to pick up where you left off, clearer actions and errors, and one-tap connectors.

- Text follows the phone's font size setting (85–150%).
- Home shows your three most recent chats first once you have chatted, with a compact welcome. "All chats" opens the full list.
- Answers keep Copy and Regenerate visible; Compare, Review & Improve, Save artifact and Share are under "More actions". Share opens Android's share sheet.
- A "Latest" button appears when you scroll up, including while an answer is still being written.
- Provider errors explain what to do (wrong key, no credit, rate limit, provider down, no connection) and offer Try again. An offline notice appears when there is no connection.
- Tools: Project, Voice, Response style and Library use the same row layout as the switches. Temperature and Top-p show their values beside the label.
- Skill Library: Create, Import and Update fit in one row, and tapping a skill opens its details.
- MCP Servers has a Connectors list: Linear, Notion, Sentry, Supabase, Canva, Hugging Face, DeepWiki, Context7, Exa Search and AWS Knowledge, added in one tap. Vercel is listed but only accepts apps it has approved. GitHub, Atlassian, Figma and Box are not supported yet.
- VersionCode 49, same com.nazchat.app package and original signing identity. Connector sign-in and installation were not tested on a real device.

# Kita Chat 4.5.5

Protects saved data from being lost when the app is updated or closed by Android.

- Android's WebView writes app data to storage lazily. When the app was updated or killed soon after a change (for example after adding providers), that change could be lost. Every save is now also written straight to a private file on the device, and the app opens with whichever copy is newest.
- The app saves everything to that file before it installs an update, and does not start the update if it cannot.
- If storage is full, saving still succeeds through the device file instead of failing.
- Data the app cannot read is kept for recovery instead of being replaced by empty data.
- API keys whose provider settings were lost are still on the device. Providers shows how many there are, and Add Provider lets you pick one ("Saved key …abcd") instead of typing it again.
- VersionCode 48, same com.nazchat.app package and original signing identity. Browser checks are not real-device verification.

Providers lost before this version cannot be restored automatically: only their keys were kept. Add them again and choose the saved key.

# Kita Chat 4.5.4

Security and reliability fixes from a code review.

- Provider API keys are sent only over HTTPS to the host each key is bound to. The first request binds it; entering the key again moves it to a new host. Scripts in the app can no longer send a key, or MCP sign-in tokens, anywhere else, or overwrite or erase MCP tokens.
- Markdown, code highlighting, math, PDF/DOCX reading and the DM Sans font now ship inside the app instead of loading from a CDN. The app opens and shows your chats without a network, and a Content-Security-Policy blocks remote scripts.
- The assistant asks before opening a web page you did not type and no search returned, and never opens private network addresses (router, localhost, LAN).
- Project documents are ranked by how many search terms they match.
- Turning off Run JS now really stops scripts in previews, in the app and in the full-screen Android preview.
- Edit Provider shows which endpoint and API type are selected, including for providers restored from older backups.
- Search and Thinking in Tools are on/off switches; Settings rows have distinct icons; model names are left-aligned.
- Tables fill the message width, short code blocks open by default, and preview size buttons use proper icons.
- VersionCode 47, same com.nazchat.app package and original signing identity. The APK is larger (about 1.2 MB) because the libraries are bundled.

If you changed a provider's URL to another host without re-entering its key, open Edit Provider and enter the key again. Browser checks are not real-device verification.

# Kita Chat 4.5.3

- Keep Appearance conversation-size controls compact with the label above a fixed-height dropdown.
- Prevent the Back row from overlapping theme choices; constrain code-size and checkbox controls.
- Conversation text remains Small 12px, Default 14px and Large 16px.
- VersionCode 46, same package and original signing identity. Browser checks are not real-device verification.

# Kita Chat 4.5.2

- Conversation text: Small 12px, Default 14px, Large 16px for assistant and user messages.
- Appearance preview uses the same sizes. Code sizing and Extra large remain unchanged.
- VersionCode 45; original package, signing identity and local data retained.

## Latest: Kita Chat 4.5.1

- Add Delete provider at the bottom of Edit Provider, with explicit confirmation.
- Remove only that provider and its per-model parameters and local saved API key. Shared secret references used by remaining providers are retained.
- Preserve conversations, messages, artifacts, projects, Memory and MCP configuration.
- Use another available provider/model, or show Select a model when none remain.
- Block deletion while generating or handing off a steer. Keep the provider if storage or native key removal fails.

This removes a key from this device only. It does not revoke it remotely or erase older exported backups. VersionCode 44, same com.nazchat.app package and original signing identity. Browser/native-interface mock tests are not real-device installation or upgrade tests.

## Kita Chat 4.5.0

- Steer messages while answering, with a separate Stop button, preserved partial responses and safe cancellation handoff. New pending steers replace rather than queue.
- Opt-in local Memory with editable notes and user-confirmed suggestions.
- Skill pack v2: 15 skills, expanded visual-design guidance, Art Direction, Interface Copy and Design Critique.
- Accessible Skill Library actions, custom editing and reviewed file/HTTPS imports.
- MCP Streamable HTTPS tools with browser OAuth/PKCE, public client registration, encrypted native token storage, refresh, per-call approval and cancellation.
- Both stateless modern MCP and supported legacy initialization/session revisions.
- Android previews remain in the separate bridge-free native screen.

Package com.nazchat.app, versionCode 43, original signing identity. Conversations, providers and nazchat_v1 storage remain unchanged by the upgrade. A private exported backup is recommended.

MCP support is a tools-only public-native-client subset. The user's actual endpoint and real-device OAuth flow have not been tested. Native installation/upgrade and the cause of any Play Protect warning remain unverified. See docs/V4_5_FEATURES.md for exact behavior and limitations.

## v4.4.4

- In-app provider picker with search, two-line descriptions, Light/Dark styling and keyboard focus handling.
- Appearance: conversation/code text sizes, reduced motion, autoscroll and reset.
- Optional update banner with Later and Skip this version; no automatic installation.
- Save-failure warning, restore confirmation, attachment size checks and retained drafts when model/key is missing.
- Android Back closes overlays first. Updater checks approved HTTPS URLs, redirects, size/time limits, package, newer version and signing identity.
- VersionCode 42; original package and signing certificate retained.

Native device tests and Play Protect detection cause remain unverified. See docs/UPDATE_SECURITY_AUDIT.md. Do not disable device protection based on this release.

## v4.4.3 — Rendering, Stop and tool-round fixes

- HTML output isolated in the code viewer; code table no longer inherits Markdown table styles
- Stop cancels pre-response waits, streams, searches and pending build parts
- Tool-round limit now leads to a final tools-free answer

Release target **4.4.3 / versionCode 41**.

## v4.4.2 — Reliable in-app update install

- In-app updates now install through Android PackageInstaller sessions instead of handing a content URI to the system installer screen, which some devices rejected while manual installs worked
- Android reports the exact result; failures now show the real reason plus a manual install link
- The old installer screen remains as a fallback

Release target **4.4.2 / versionCode 40**.

## v4.4.1 — Mobile viewport and HTML head fix

- Fixed a double-escaped `viewport` meta in the app document, which lost the mobile page scale on some devices
- Fixed the same escaping in generated HTML assembly and in the build-plan prompt
- Added a regression guard that asserts the parsed viewport content and assembled document head

Release target **4.4.1 / versionCode 39**.

# Kita Chat

Kita Chat is a private, local-first Android BYOK AI chat client for OpenAI-compatible providers.

## v4.4.0 — Incremental execution and a professional code viewer

- Long builds now plan once and then **execute one part per model call** (plan → part → evaluate → next part → validate), instead of one giant response
- A stopped or failed build keeps finished parts and offers **Resume build**
- Thinking/tool/build state lives in one compact status bar (collapsed by default, detail scrolls inside ~110px)
- Code answers use a real code viewer: line numbers, file names from the fence, tabs for multi-file answers, copy, download, expand and internal scrolling
- Web search runs its sources in parallel with per-request timeouts and keeps partial results; Stop now cancels native streams and pending searches
- Native fetch responses are matched per request id, so concurrent requests can no longer settle each other

Release target **4.4.0 / versionCode 38**, package `com.nazchat.app`, original signing identity.

## v4.3.1 — Matching Android launcher icon

- Replaced both old launcher designs with the same folded K used inside Kita Studio, in iris on ink
- Adaptive icon for Android 8+, monochrome layer for Android 13+ themed launchers, and correctly sized legacy PNGs for Android 7
- Generated from the production mark/palette to prevent future drift (`npm run icons:generate`; verify with `npm run test:icons`)
- Version **4.3.1 / versionCode 37**; chat behavior, package ID and storage unchanged

Launcher mask previews are simulated, not a claim of installation testing on physical devices. System-themed icon colors depend on the wallpaper and launcher.

## v4.3.0 — Kita Studio

- Integrated Studio layout with mist/ink palettes, iris accents, DM Sans and a quieter composer
- Separate Chats, Projects and Library navigation backed by the existing local database; no prototype replies or simulated providers
- Real model/provider selection, search, thinking, reasoning depth, skills, attachments and voice controls remain available
- Light, Dark and System appearance; Android System mode reads OS configuration rather than WebView's fixed theme, plus a persisted larger-text option
- Project reassignment, reviewed prompt saving, complete fenced-code artifact saving and keyboard/focus fixes
- Production HTML, CSS and JavaScript are explicitly bundled in the APK; `design-lab/` stays separate

Signed APK: **4.3.0 / versionCode 36**, package `com.nazchat.app`, original signing certificate verified with v2/v3. The full browser suite passed, including 126 theme/screen checks and 21 Studio cases. Existing storage and key references are retained by the implementation and upgrade fixtures; actual device installation/upgrade has not been performed by the agent. See `tests/README.md` and `docs/ANDROID_BUILD.md`. This is not Google Play readiness. The updater manifest is advanced only after the signed APK is published and verified.

## v4.2.2 — Theme consistency fixes

- One shared semantic palette for light/dark surfaces, text, controls, selection, status and code colors
- Theme-aware Settings, model/provider lists, dialogs, terminal, syntax highlighting and preview chrome
- Persisted theme restored before first paint; browser controls and `theme-color` follow the active palette
- Native theme bridge synchronizes WebView background, Android system bars and preview toolbar; generated HTML keeps its own colors
- Portable browser checks for both themes at 360px, 390px and 1440px (`npm run test:themes`; see `tests/README.md`)

Signed APK: versionCode 35, retaining `com.nazchat.app` and the original signing certificate for in-place updates. Verified using APK Signature Schemes v2/v3; 126 theme checks and the full browser regression suite pass. Installation on a physical Android device has not been performed by the build agent. The update manifest is advanced only after the signed APK is published. See `docs/ANDROID_BUILD.md` for the unsigned CI build and local signing process.

## v4.2.1 — Update check fix

- Added GitHub Releases API fallback to avoid stale `version.json` from raw.githubusercontent.com CDN cache
- Now reliably detects latest APK releases even when raw content is delayed
- Still verifies SHA-256, respects native app version, and uses the same secure install flow

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
- Conversation search, date grouping, pinning and rename/delete through the conversation action menu

## Project layout

- `nazchat/index.html` — Kita Chat entry point; keep adjacent `studio.css` and `studio.js` for the production interface
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
