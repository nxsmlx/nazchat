# Kita Chat 4.22.0

- Turn your website into an Android app: in Code, tap Publish and choose Android app (APK). Kita puts your site and a small Android project in a private GitHub repository of yours, GitHub builds and signs the APK in about 3 to 5 minutes, and you get a Download APK link.
- Every new version is signed with the same key, so your app updates in place on phones. The key is created once on GitHub and kept there only encrypted; the secret that unlocks it is sealed on your phone before it is sent to GitHub, and Kita does not keep it.
- The app shows your site full screen, opens outside links in the browser, and has no access to anything else on the phone.
- GitHub connection: the token now needs the repo and workflow scopes (the Create token link asks for both). Kita tells you clearly if an older token is missing the workflow scope.
- VersionCode 77, same com.nazchat.app package and original signing identity.

# Kita Chat 4.21.1

- Settings → About now links to the official website keetakita.my, the Privacy Policy and the Terms of Use, and has Share Kita Chat to send the download page to a friend.
- VersionCode 76, same com.nazchat.app package and original signing identity.

# Kita Chat 4.21.0

- Code tab: changes to an existing page are now small edits. The AI reads only the lines it needs and replaces exact pieces of the files instead of rewriting the whole page, so edits to long projects (2000+ lines) are faster, cheaper and no longer stop halfway.
- The updated page is tested automatically; if it shows errors, the AI fixes them with more small edits. The steps (Read index.html, Edit css/styles.css…) appear on the answer.
- Works with the Files setting: with Separate files the AI edits index.html, css/styles.css and js/app.js directly.
- The AI tools only touch the project files: there is no shell and no access to your phone. If a provider does not support tools, Kita falls back to the full-page edit.
- Fixed: an attached image was dropped when a provider rejected tools and Kita retried without them.
- VersionCode 75, same com.nazchat.app package and original signing identity.

# Kita Chat 4.20.0

- Attach images: photos, screenshots or pasted pictures. Kita resizes them on the phone and vision models read them, for example "what is in this photo", "read this menu" or "build a page like this screenshot".
- Images are shown as thumbnails in the chat; tap one to see it full size. Full images stay on your phone (not in the chat data), so chats stay fast.
- Works with Chat Completions and the Responses API. If the selected model cannot see images, Kita says so instead of failing; pick a model with vision.
- Also in this update (4.19.0): Code tab Files setting for a production layout (index.html, css/styles.css, js/app.js), Download project (.zip), and multi-file answers that preview with their own CSS and JavaScript.
- VersionCode 74, same com.nazchat.app package and original signing identity.

# Kita Chat 4.19.0

- Code tab: new Files setting. Choose Separate files to get a production layout: index.html, css/styles.css and js/app.js (plus js/main.js for modules). Kita splits the page when you download or publish, so preview and editing keep working the same with any model.
- Download project (.zip): every web page or multi-file answer can be saved as one .zip from the card menu (⋯).
- Answers that come as several files (index.html + styles.css + app.js) now open in Preview with their own CSS and JavaScript. Before, the page opened without them.
- Publishing to GitHub, Vercel and Cloudflare uses the same file layout as the download.
- VersionCode 73, same com.nazchat.app package and original signing identity.

# Kita Chat 4.18.0

- Code tab: choose a design style for new builds: Minimal, Editorial, Bold, Soft, Technical, Playful, Trusted or Raw, or leave it on Auto. Each style comes with an open font pairing and a fallback for offline, and the Designer agent follows it.
- Built-in icons: pages Kita builds can use 95 clean line icons (Lucide). They are added as inline SVG in preview, download and publish, so pages need no icon library and no emoji icons.
- Four new design skills: Motion & Micro-interactions, Layout Patterns (landing sections, app screens, grids), Icons & Imagery, and Data Viz & Dashboards. They are picked automatically for matching requests, in English or Malay.
- Pickers can show a short description under each choice.
- VersionCode 72, same com.nazchat.app package and original signing identity.

# Kita Chat 4.17.3

- Fixed: with DNS-over-HTTPS on (Settings → Web & DNS), providers and other sites could fail with "Hostname … not verified" or "TLSV1_ALERT_INTERNAL_ERROR". Android replaced the site name sent during the secure handshake with the IP address, so servers that host many sites (Caddy, Cloudflare, shared hosting) did not know which site was meant. Kita now finishes the handshake with the real site name.
- If a TLS error happens while DNS-over-HTTPS is on, Test connection now suggests switching Web & DNS to System.
- VersionCode 71, same com.nazchat.app package and original signing identity.

# Kita Chat 4.17.2

- Test connection now says why a provider cannot be reached (host not found, key locked to another URL, TLS, timeout, or the provider's own error) instead of a bare "HTTP 0".
- Fixing a mistyped provider URL and testing again now works: the typed key is moved to the new URL. Before, it stayed locked to the first URL and every retry failed.
- The network permission prompt from Chat shows your Wi-Fi subnet again.
- VersionCode 70, same com.nazchat.app package and original signing identity.

# Kita Chat 4.17.1

- Asking Kita to scan your Wi-Fi or check ports now runs the real network checks and explains the results. Before, the model could write an nmap-style script instead.
- Network checks also work in the Code tab.
- A script that contains an HTML template (for example a Python report generator) is no longer opened as a broken page in Preview.
- VersionCode 69, same com.nazchat.app package and original signing identity.

# Kita Chat 4.17.0

- Chat can now run every Network check: custom port lists (like 22,80,8000-8100, up to 1200 ports), UDP check (DNS, NTP, NetBIOS name), finding devices that announce services (printers, TVs, cameras) and the website security test.
- Website test from Chat runs the passive checks on any site. Exposed files (.git, .env, backups) and the crawl run only on a domain you verified in Tools → Network.
- All network checks still ask first, stay on your own private Wi-Fi and never scan public addresses. Stop ends a website test right away.
- VersionCode 68, same com.nazchat.app package and original signing identity.

# Kita Chat 4.16.1

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

# Kita Chat 4.5.1

- Add Delete provider at the bottom of Edit Provider, with explicit confirmation.
- Remove only that provider and its per-model parameters and local saved API key. Shared secret references used by remaining providers are retained.
- Preserve conversations, messages, artifacts, projects, Memory and MCP configuration.
- Use another available provider/model, or show Select a model when none remain.
- Block deletion while generating or handing off a steer. Keep the provider if storage or native key removal fails.

This removes a key from this device only. It does not revoke it remotely or erase older exported backups. VersionCode 44, same com.nazchat.app package and original signing identity. Browser/native-interface mock tests are not real-device installation or upgrade tests.

# Kita Chat 4.5.0

- Steer messages while answering, with a separate Stop button, preserved partial responses and safe cancellation handoff. New pending steers replace rather than queue.
- Opt-in local Memory with editable notes and user-confirmed suggestions.
- Skill pack v2: 15 skills, expanded visual-design guidance, Art Direction, Interface Copy and Design Critique.
- Accessible Skill Library actions, custom editing and reviewed file/HTTPS imports.
- MCP Streamable HTTPS tools with browser OAuth/PKCE, public client registration, encrypted native token storage, refresh, per-call approval and cancellation.
- Both stateless modern MCP and supported legacy initialization/session revisions.
- Android previews remain in the separate bridge-free native screen.

Package com.nazchat.app, versionCode 43, original signing identity. Conversations, providers and nazchat_v1 storage remain unchanged by the upgrade. A private exported backup is recommended.

MCP support is a tools-only public-native-client subset. The user's actual endpoint and real-device OAuth flow have not been tested. Native installation/upgrade and the cause of any Play Protect warning remain unverified. See docs/V4_5_FEATURES.md for exact behavior and limitations.

# Kita Chat 4.4.4

- In-app provider picker with search, two-line descriptions, Light/Dark styling and keyboard focus handling.
- Appearance: conversation/code text sizes, reduced motion, autoscroll and reset.
- Optional update banner with Later and Skip this version; no automatic installation.
- Save-failure warning, restore confirmation, attachment size checks and retained drafts when model/key is missing.
- Android Back closes overlays first. Updater checks approved HTTPS URLs, redirects, size/time limits, package, newer version and signing identity.
- VersionCode 42; original package and signing certificate retained.

Native device tests and Play Protect detection cause remain unverified. See docs/UPDATE_SECURITY_AUDIT.md. Do not disable device protection based on this release.

# Kita Chat 4.4.3 — Chat rendering, Stop and tool fixes

- Generated HTML is always shown as source in the code viewer and never rendered into the chat; line numbers no longer wrap letter by letter
- Stop now cancels while waiting for the provider, during streaming, during web search and between build parts; late data is ignored
- After three tool rounds the model is asked for a real final answer with tools disabled, instead of ending with "Stopped after 3 tool rounds"
- Finished answers no longer show "Writing the answer"
- Version code **41**; data and signing identity unchanged. Native Stop was verified with mocked bridges, not yet on a physical device.

# Kita Chat 4.4.2 — In-app update fix

- Fixed in-app updates failing on devices where the manual APK install worked: the app now installs the downloaded update through an Android PackageInstaller session
- Android asks you to confirm the update; if it refuses, Kita Chat shows the exact reason and a link to install manually
- Version code **40**; package and original signing identity unchanged, no data changes

Note: this fix applies to updates installed *from* 4.4.2 onward. Updating to 4.4.2 itself may still need the manual install once.

# Kita Chat 4.4.1 — Viewport and HTML head fix

- The app document now keeps a valid mobile viewport (a previous escaping mistake removed the page scale)
- Assembled HTML builds and the plan prompt no longer contain doubled quotes
- New browser regression case checks the parsed viewport meta and the assembled document head

Version code **39**. Install over the existing app; no data changes.

# Kita Chat 4.4.0 — Incremental build workflow

- Long coding builds are executed in stages: one planning call, then one model call per part, then a validation pass. No more single 800-line response.
- Part progress is visible (count, per-part status and timing); finished parts are kept if you stop, and **Resume build** continues the remaining ones.
- Thinking and tool activity are condensed into one collapsible status bar; the answer and code get the visual priority.
- New code viewer with line numbers, file names, multi-file tabs, copy/download, expand and contained horizontal/vertical scrolling.
- Web search fetches its sources in parallel with timeouts and keeps partial results; Stop cancels native requests and searches immediately.
- Fixed concurrent native responses crossing over (each request is now matched by id).

Version code **38**; package `com.nazchat.app` and the original signing identity are retained. Provider behaviour, attachments, skills, projects and local data are unchanged.

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
