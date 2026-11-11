# Kita Chat 4.16.1

Created by **Nazz**. © 2026 Nazz. All rights reserved; see LICENSE.

- Website audit from Chat now asks first when the assistant picks a site you did not name, like opening a page. You can audit it once or allow that site for the whole chat; a site you typed yourself, or Bypass all, runs without asking.
- Finished Network scans no longer leave background listeners behind.
- VersionCode 67, same com.nazchat.app package and original signing identity.

# Kita Chat 4.16.0

- Ask Kita in Chat to scan your own Wi-Fi, check a device's open ports or audit a website. Kita runs the check and explains the results in the conversation.
- Network scans still ask for permission first, work only on the phone's private Wi-Fi subnet and never scan mobile data or public IP addresses.
- Website audit checks the certificate, HTTPS redirect, security headers and DNS records without exploiting the site.
- Tools → Network remains available for the full visual scanner, website tests and saved reports.
- VersionCode 66, same com.nazchat.app package and original signing identity.

# Kita Chat 4.15.2

Created by **Nazz**. © 2026 Nazz. All rights reserved; see LICENSE.

- Drop-down choices (port check profile, response style, web search provider, agent count, model per role, Cloudflare account, Supabase project, text sizes…) now open a Kita picker that slides up from the bottom, matching the light or dark theme, instead of the old grey Android dialog.
- The current choice is marked; tap one to pick it. Tapping outside, Back or Escape closes the picker without changing anything.
- Works with touch, mouse and keyboard (Enter to open, arrows to move).
- VersionCode 65, same com.nazchat.app package and original signing identity.

# Kita Chat 4.15.1

- Code snippets in an explanation now stay where they are in the text. Before, every code block in an answer was pulled into one tabbed box at the first block, so a "BIND:" or "Unbound:" heading could be left with nothing under it.
- Tabs are used only for multi-file answers: at least two blocks with file names, or a whole HTML page with its CSS / JavaScript / JSON.
- A block without a file name is labelled by its language (Shell, Config, Python, Text…) instead of "snippet.txt". Downloads keep a sensible file name.
- Unnamed tabs of the same language get numbered names (snippet.css, snippet-2.css) instead of repeating, and tab labels no longer squeeze into each other.
- VersionCode 64, same com.nazchat.app package and original signing identity.

# Kita Chat 4.15.0

Deeper checks for your own network and websites (Tools → Network).

- Port check profiles:
  - Quick: 35 common ports.
  - Top ports: about 1100, ports 1-1024 plus well-known services above.
  - Custom: up to 1200 ports, like 22,80,8000-8100.
  - Big scans show progress.
- Service versions: MySQL/MariaDB version, whether Redis answers without a password, the TLS certificate name (and whether it is self-signed), the web server and page title, and the first line other services send.
- UDP check for each device: DNS (and whether it answers lookups for any name), NTP (version and stratum) and the Windows NetBIOS name, without root.
- Save report: saves everything you found as a text file.
- Website test:
  - Passive checks work on any site: cookies without Secure/HttpOnly/SameSite, CORS that trusts any origin (worst with credentials), mixed content, forms that post over http://, and version leaks (X-Powered-By, Server, generator tag).
  - Active checks run only on domains you prove are yours, with a DNS TXT record (kita-verify=…) or a file at /.well-known/kita-verify.txt: exposed .git, .env, backups and config copies, phpinfo and server-status, directory listings, admin and login pages, robots.txt, and a crawl of up to 10 pages on the same site.
- Traffic capture: Android lets an app record only the phone's own traffic. Record it with PCAPdroid (free), then open the .pcap or .pcapng here, or attach it to a message. Kita lists the hosts by data, DNS lookups, the sites behind encrypted connections (TLS SNI), unencrypted HTTP requests and QUIC, and sends only that summary to the model.
- As before, scans stay on the phone's own private subnet and ask first. There is no password guessing and there are no exploits.
- VersionCode 63, same com.nazchat.app package and original signing identity. Tested with mocked native parts and captures built byte by byte; not tested on a real device or network.

# Kita Chat 4.14.0

Network tools: check the network you are on and your own websites, from your phone (Tools → Network).

- Scan devices:
  - Finds the devices on the Wi-Fi the phone is on, with their names, and marks the router.
  - Only private addresses on the phone's own subnet are scanned, at most one /24, and it asks you first (once per session).
  - Mobile data networks belong to your carrier and are never scanned.
- Check ports:
  - For one device, shows which common ports are open and what each service says (web page title and server, or its first line).
  - Each port gets a plain explanation and a risk level, for example "Telnet: unencrypted remote login, often with a default password" or "Android debugging (ADB) over the network".
- Discover services: lists devices that announce themselves on the network (UPnP/SSDP and mDNS), such as routers, printers, TVs and Chromecasts.
- Audit a website:
  - The certificate (issuer, days until it expires).
  - Whether http:// redirects to https://.
  - Security headers (HSTS, Content-Security-Policy, clickjacking protection, nosniff, Referrer-Policy) and a Server header that shows a version.
  - DNS records (address, SPF and DMARC for mail, CAA).
- Ask Kita about these results: sends the report as an attachment to a Chat message that asks which devices and services are risky and what to fix first.
- There are no attack features: no password guessing, no exploits, no scans of public addresses.
- The limits are enforced in native code and tested on a host JVM.
- New Android permissions: Wi-Fi state, and Wi-Fi multicast (to hear devices that announce themselves).
- VersionCode 62, same com.nazchat.app package and original signing identity. Tested with a mocked scanner; not tested on a real device or network.

# Kita Chat 4.13.0

Web & DNS: reach blocked servers and get better search results. This release also includes 4.12.0 and 4.11.1.

- Settings → Web & DNS → DNS: choose Cloudflare (1.1.1.1), Google (8.8.8.8), a custom DNS-over-HTTPS address, or System.
  - Some networks answer DNS with a block page. With DNS-over-HTTPS, every request the app makes natively (models, web search, MCP, integrations, publishing, updates) looks the host up over encrypted HTTPS and goes to the real server.
  - Certificates are still checked against the real site name, so security is unchanged.
  - If a lookup fails, the request falls back to the phone's DNS.
  - "Test lookup" shows what a host resolves to.
  - Pages shown in Preview still use the phone's DNS.
- Settings → Web & DNS → Web search, tried in this order:
  - Model search (optional): OpenAI search (Responses API web search) and Anthropic search (Messages API web search) through one of your providers and its saved key, with the model you choose. The answer and its cited sources become the search results.
  - Search APIs with your keys: Brave Search API, Tavily, Search1API, Exa and Serper. Paste several keys per service, one per line. They are used in turn, and a key that is refused, out of credit or rate limited hands over to the next. Keys are stored in Android Keystore and native code sends each one only to that service's API host, in that service's own header.
  - The built-in DuckDuckGo search, with no key needed.
- VersionCode 61, same com.nazchat.app package and original signing identity. Tested with mocked search APIs and host-JVM tests of the DNS-over-HTTPS rules, not on a real device or network.

# Kita Chat 4.12.0

Long builds in Code are done by a team of agents, each with its own role. This release also includes 4.11.1.

- Orchestrator plans the build and fixes a shared contract. When Supabase is connected, it also says what data the app must store.
- Designer writes a shared design system (CSS variables, base styles, components) before the coders start. Every coder gets it, and the page carries it once.
- Database (only with Supabase connected and an app that stores data) writes the tables and Row Level Security policies. It always asks before running the SQL and never runs SQL that deletes anything. The coders then get the new tables, the project URL and the public key. If you decline, the app is built without new tables.
- Coders write the parts at the same time (1 to 4 at once).
- Tester runs the assembled page in the hidden test view.
- Reviewer reads all the parts together with the Tester's errors and reports real problems part by part (JavaScript errors, missing ids or classes, broken layout, buttons that do nothing, missing content).
- Fixer rewrites only the parts with problems, not the whole page. The Tester then runs the page again, and the card shows ✓ tested or the remaining errors.
- The answer lists the team: what each agent did, the coders with their line counts, and which parts were fixed.
- Tools → Agent team: choose a model for each role (for example a strong model for Orchestrator and Reviewer and a fast one for Coders), and turn the Designer, Reviewer and Fixer, and Database on or off. A model that is no longer available falls back to the chat model.
- Fixed: a "DATABASE:" line in a plan could be read as an extra part.
- VersionCode 60, same com.nazchat.app package and original signing identity. Tested with mocked providers and a mocked Supabase API, not on a real device.

# Kita Chat 4.11.1

- GitHub Pages now works when a repository with the same name already exists as private (for example after publishing it first as "GitHub repository"). GitHub Pages on a free plan needs a public repository, so Kita asks whether to make it public before committing anything. If you say no, nothing changes and Kita suggests another site name.
- Publish → Versions: every publish is kept as a version (when, how many files, and whether it came from this page, an earlier answer or a rollback). Rollback publishes an earlier version again to the same site, the same way on Vercel, Cloudflare and GitHub, after a confirmation. The list shows the live version and the two before it, with "Show all" for the rest; the last 10 versions of each site are kept on the device.
- GitHub Pages: Kita now waits for GitHub to finish building the site (up to about 2½ minutes) before it says the site is live, so the link no longer opens a 404 right after publishing. A failed build shows GitHub's error; a slow one says it is still building. A .nojekyll file is added so GitHub serves the files as they are (faster, and files starting with _ are kept).
- A Pages "plan" error from GitHub now explains what to do instead of showing only the raw message.
- The Publish sheet no longer shows the result of an earlier publish under a new attempt.
- Default site names are shorter (about 40 characters, cut between words).
- VersionCode 59, same com.nazchat.app package and original signing identity.

# Kita Chat 4.11.0

Supabase joins the integrations, so the apps you build in Code can have a real database, sign-in and storage. This release also includes everything in 4.10.0 (Chat | Code and publishing).

- Settings → Integrations → Supabase:
  - Paste a Supabase access token, then choose the project your apps should use. With one project, it is chosen for you.
  - Kita keeps only the project URL and its public key (the publishable key, or the legacy anon key). The service_role or secret key is never fetched into the app, and the access token stays in Android Keystore and is only sent to api.supabase.com.
  - Shows the tables in the public schema and whether Row Level Security is on. "Use in Code" turns the project on or off for building.
- In Code, the model knows the project URL, the public key and the current tables, and writes pages that use supabase-js for data and sign-in, with Row Level Security.
- Database changes:
  - Models with tools can call supabase_sql (create tables, policies, buckets, or read data) and supabase_schema. Every change asks you first and shows the SQL; changes that can delete data (DROP, TRUNCATE, DELETE, dropping columns, turning off RLS) are marked as destructive. Bypass all never skips these. Reads follow your permission mode.
  - For any SQL block in an answer, "Run on Supabase" runs it after the same confirmation and shows the result under the block.
  - The table list is refreshed after every change.
- Tool activity shows the SQL that ran.
- VersionCode 58, same com.nazchat.app package and original signing identity. Tested against a mocked Supabase Management API, not a live project or a real device.

# Kita Chat 4.10.0

Chat and Code are now separate, and Code can publish what you design straight from your phone.

- Chat | Code switch on Home and at the top of the chat list:
  - Chat is for questions, writing and research.
  - Code is for building: agents, the page test and artifact cards, with Publish on every page.
  - Each conversation belongs to one mode and the lists show the current mode only. Older conversations that built a web page were moved to Code once; the rest stay in Chat.
  - A build request typed into a fresh chat (for example "buat landing page…") moves that conversation to Code automatically. In Code, shorter requests such as "buat kalkulator" also start a build.
  - The Code home shows where you can publish and your published sites.
- Settings → Integrations: connect GitHub, Vercel and Cloudflare with a token (with a link to the right token page and the permissions it needs). Each token is checked when you connect, stored in Android Keystore, and attached by native code only to that service's official API (api.github.com, api.vercel.com, api.cloudflare.com). It never appears in app data or backups.
- Publish (button on every web-page card): choose a site name and a target, confirm, and get the link.
  - Vercel: production deployment at name.vercel.app.
  - Cloudflare Pages: direct upload (files addressed with BLAKE3, as Cloudflare's own tool does) at name.pages.dev.
  - Cloudflare Workers: a Worker that serves the page at name.your-subdomain.workers.dev.
  - GitHub Pages: creates a public repository, commits the files in one commit and turns on Pages (live in about a minute).
  - GitHub repository: a private repository with the files, without Pages.
  - Publishing again with the same name updates the same site. Every publish asks first, also in Bypass all.
- VersionCode 57, same com.nazchat.app package and original signing identity. Publishing was tested against mocked service APIs, not live accounts or a real device.

# Kita Chat 4.9.0

Long builds are now done by a team of agents instead of one long stream.

- Orchestrator: a long build (website, landing page, dashboard, long report) is planned first. The plan fixes a short shared contract (colours and fonts as CSS variables, class prefixes, section ids, shared script names; or tone and headings for documents) and splits the work into 3 to 7 parts.
- Sub-agents: the parts are written at the same time by separate agents, 3 at once by default (Tools → Agents for long builds: 1 to 4). Every agent gets the contract, so the parts fit together. Finished parts are assembled in plan order as they arrive and saved straight away.
- Instead of a terminal with thousands of lines, the answer shows the agents: which part each one is writing, its line count, waiting or queued, and the time taken. The finished page is one artifact card, and it is run once in the hidden test view (✓ tested or N errors).
- Each part retries on its own: a dropped connection waits for the network and retries only that part; a rate limit (HTTP 429) drops the build to one agent at a time. Parts already written are never redone, and Resume build continues only the missing ones.
- Background (Android): while a build runs, Kita keeps working when you leave the app. A notification shows progress ("3/6 parts done · 2 agents writing") with a Stop button, and a "Build finished" notification appears when it is done if the app is not open. Android 13+ asks once for notification permission. Turn it off in Tools → Keep building in the background.
- Several streams can now run at once on Android (native stream callbacks are routed per stream).
- VersionCode 56, same com.nazchat.app package and original signing identity. New Android permissions: notifications, foreground service (data sync) and wake lock (only held while a build runs, at most 45 minutes). Not tested on a real device.

# Kita Chat 4.8.2

- Markdown files can be attached again. Android's file picker was given only the first allowed type (PDF), and Android has no file type for .md, so Markdown files were greyed out. The picker now shows every file, and Kita checks what it can read: PDF, DOCX, Markdown and other text or code files (including files without an extension, such as README). Binary files such as ZIP or APK are refused with a message.
- A long paste (2,000+ characters or 40+ lines) becomes an attachment chip with a one-line preview and its line count, instead of filling the message box. The full text is sent to the model as a document, and the sent message shows "Pasted text · N lines". Short pastes still go into the box as before.
- Some Android keyboards insert only part of a very long clipboard item and send no paste event. Kita now catches that large insertion too and, when the clipboard holds more than the keyboard inserted, attaches the full clipboard text.
- Whole web pages and long code (over 30 lines) now show as an artifact card instead of a wall of code: the page title (or file name), the kind and line count, and the automatic page test result (✓ tested or N errors). Open shows the page full screen, Code reveals the full code viewer, and ⋯ has Copy and Download. A set of files that includes a page is one card with the file tabs inside. Short snippets stay inline as before.
- Long answers survive the internet going down:
  - When the phone goes offline mid-answer, the open stream is ended at once (Android could otherwise wait up to 3 minutes on a silent connection), what arrived is saved, and Kita waits up to 5 minutes for the connection to come back without using up a retry. Then it reconnects and continues from the last character received.
  - Up to 4 automatic reconnects (2, 4, 8 and 15 seconds apart) instead of 2. A stream that goes silent for 2 minutes after text started is also treated as a dropped connection.
  - Continue (after a failed reconnect or the output limit) now finishes the same answer instead of adding a new reply, so a long page stays one artifact.
  - The partial answer is saved every few seconds while it streams. If the app is closed or killed mid-answer, the text is kept with a note and Continue picks it up.
- VersionCode 55, same com.nazchat.app package and original signing identity. Not tested on a real device.

# Kita Chat 4.8.1

- Fixed code that rendered as plain text and a row of "snippet.html" tabs when a provider put text directly before the opening ``` (for example "…switch to another model.```html") or put the closing ``` at the end of a code line. Such fences are now moved onto their own line, so the page shows as one code block again (with Preview and the automatic page test).
- Settings → About now shows the author: Made by Nazz. The repository has a LICENSE file (© 2026 Nazz, all rights reserved; third-party components keep their own licences).
- VersionCode 54, same com.nazchat.app package and original signing identity.

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
