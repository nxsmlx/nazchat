# Kita Chat 4.5.0

## Steer, not queue

During generation, enter a message and tap **Steer**. **Stop** remains a separate button. The current request is cancelled; its actual partial output stays in the original conversation. The next request starts only after cancellation settles. A second steer during handoff replaces the first pending instruction, rather than forming a queue. Stop cancels a pending handoff. An incremental build retains completed parts and is marked paused; the steered response is a new continuation using the retained artifact, not an automatic resume of its old plan. New requests can incur additional provider token charges.

## Memory

Settings > Memory is off by default. Add, edit or delete up to 100 short notes. Saving a note does not opt in. When enabled, up to six relevant notes (at most 1,800 characters) are included in provider requests. Memory is not encrypted chat storage and is included in user-exported backups. Never save passwords or sensitive information. Model suggestions require Save or Dismiss; they are never written automatically. Memory text sent to the selected provider is subject to that provider's privacy policy.

## Skills

Skill Library exposes Add skill, Import SKILL.md / URL, Update pack, custom Edit/Delete and reviewed import previews. Imported instructions are not code execution, but are sent to the model when selected. Pack v2 contains 15 skills, including Art Direction, Interface Copy and Design Critique. The bundled offline pack matches skills.json. Guidelines reduce generic output patterns; they cannot guarantee a particular model's visual quality.

## MCP HTTPS + public-client OAuth

Settings > MCP Servers > Add server. Enter the exact canonical public HTTPS Streamable HTTP endpoint. If the service requires a pre-registered client, enter its public client ID. No client secret is supported. Save, then Sign in. Browser login returns using:

`com.nazchat.app:/oauth/callback`

OAuth supports Protected Resource Metadata, authorization-server/OIDC discovery with exact issuer checks, PKCE S256, state, resource indicators, Client ID Metadata Documents, dynamic public-client registration and manual public client IDs. Tokens and pending authorization records are encrypted using the existing Android Keystore-backed store. They are not sent to JavaScript or included in chat backups. Since 4.5.4 JavaScript also cannot ask native code to attach, overwrite or remove them: the provider-key bridge accepts only `provider:`/`draft:` references, and each provider key is sent only over HTTPS to the one origin it is bound to (first use binds; saving a new key value rebinds). Tokens are bound to the endpoint and issuer. Rotating refresh tokens are saved. Sign-out invalidates outstanding authorization generations. Android OS automatic backup is disabled to avoid exporting native token state.

Tools/list supports pagination. Tools/call supports JSON and incremental request-scoped SSE responses. Protocol 2026-07-28 stateless requests and legacy 2025-03-26 / 2025-06-18 / 2025-11-25 initialization/session handling are supported. Every external tool call asks for approval. Output and descriptions remain untrusted data. Cancellation disconnects the request but cannot undo side effects already performed remotely. Private-network addresses, cleartext endpoints, embedded URL credentials, redirects and oversized responses are refused. Requests run off the UI thread with bounded timeouts.

### Deliberate limitations

- The user's actual MCP endpoint was not provided. Its OAuth provider and redirect policy have not been verified.
- Authentication requires a provider accepting a public native client and this redirect URI. Providers requiring confidential client secrets or a different redirect need separate integration.
- Legacy HTTP+SSE transport (the old GET /sse endpoint), sampling, elicitation, resources, prompts and long-lived server subscriptions are not supported in this tools-only release.
- Unsupported modern protocol negotiation is reported, not silently claimed compatible.
- Scope failures ask the user to sign in again; there is no unattended consent escalation.
- URL/DNS address checks reduce SSRF exposure, but are not a complete DNS-rebinding defense; HTTPS certificate validation remains enabled.
- Untrusted Android previews open in a separate bridge-free PreviewActivity, never the bridged shell's iframe.

## Verification scope

Browser tests exercise true incremental mocked responses, aborted-stream settlement, latest-steer replacement, separate Stop, conversation identity, phased continuation, note editing/confirmation, bounded memory, import review, pack routing, MCP native-interface mocks, permissions and cancellation. Host-side Java checks execute the production SSE/JSON parser and URL/form utilities. Java 8 compilation and unsigned SDK 36 CI are release gates. These checks are not real-device OAuth, PackageInstaller, keyboard or data-preserving upgrade tests. A previous Play Protect warning has no verified cause and is not claimed fixed.
