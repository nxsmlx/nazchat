# Updater security review (unreleased working changes)

No Play Protect screenshot, precise detection text or installed-package telemetry was available. Therefore this review DOES NOT establish the cause of the user's harmful-app warning, certify safety, or establish a false positive. Do not disable Play Protect based on this audit.

Current v4.4.3 adds native PackageInstaller sessions and a non-exported result receiver after users reported manual installation worked but the old content-provider handoff failed. Installation still requires Android user confirmation; this is not proof of why Play Protect warned.

Findings requiring native hardening:
- Updater bridge accepts arbitrary URL and an optional checksum, with redirects. Require approved HTTPS release paths, mandatory checksums, bounded download size/time, package/signature/version verification before install.
- Main WebView bridge trust boundaries still need a dedicated security change; untrusted main/subframe navigation must not have native updater/secret access.
- FileProvider canonical-path prefix check should require a directory separator, read-only access, and correct requested-column handling.
- STATUS_FAILURE_BLOCKED does not identify Play Protect specifically.

Recommended release gate: verify official APK hash/certificate; obtain the actual warning screenshot, device/Android version and install source; reproduce on a device with protection enabled; submit a false-positive appeal only if supported by evidence. Do not infer safety from browser regressions.

## Working-tree hardening implemented

- Mandatory 64-character SHA-256, approved GitHub repository/version APK URL, 30-second read timeout, 50 MB download limit.
- Redirects limited to four hops and specific HTTPS GitHub download hosts.
- File provider restricted to a single read-only update.apk with separator-safe canonical containment.
- Blocked-install message no longer attributes the rejection to Play Protect without evidence.
- Native archive preflight compares package ID, strictly increasing versionCode and the complete current signer set against the installed app before opening the installer. This does not replace Android's cryptographic installer verification.

Not yet complete: native build/device verification of archive preflight, comprehensive native resource cleanup on failures, trusted-only WebView bridge navigation, physical-device/Play Protect verification. These remain security release gates, not solved merely by the UI changes or browser test pass.

This workstream is distinct from text-size controls and update notifications. No new signing identity or automatic install is introduced by these changes.
