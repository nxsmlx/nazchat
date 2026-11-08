# Kita Studio — interactive design preview

A separate frontend redesign concept for Kita Chat. **Not an APK or production update.**

## Open

Open `index.html` using the app's **Preview** action, or any modern browser. There is no build step.

For a normal local development environment:

```sh
node design-lab/kita-studio/serve.cjs
# http://localhost:5174
```

The server only exposes the prototype HTML. It does not serve the repository, attachments, signing files or logs. On hosts that terminate background processes when a container session exits, use the HTML preview instead.

## Try

- Start with a suggested prompt or type your own; responses are **prewritten demo content**, not AI output.
- Stop or regenerate a response; edit a previous message.
- Change the example model, search by provider, and enable Tools.
- Select an attachment to display its filename. **File contents are never read or uploaded.**
- Open “A quieter landing page”, switch Preview/Code, change preview width, or copy the HTML.
- Create a project, open its chat and revisit the conversation.
- Browse the Library and use a saved prompt.
- Open Settings → Appearance for Light / Dark / System and larger conversation text.
- Settings → Connections uses a clearly labeled simulated connection test. **Do not enter real keys.**

Only appearance is saved, under `kita-studio-appearance`. All other prototype data lives in memory and resets on reload. It never uses the production `nazchat_v1` key or Android bridges. The Google Fonts stylesheet is an optional external typography dependency; system fonts provide a fallback.

## Tests

Uses the repository's existing Playwright/Chromium tooling, without altering its production test suite:

```sh
node design-lab/kita-studio/preview.test.cjs
node design-lab/kita-studio/check-accessibility.cjs
```

The default test uses the local file, so no server is required. To test an already-running server, set `PREVIEW_URL=http://localhost:5174`.

Coverage: light/dark at 360, 390, 768 and 1440px; narrow/short 320×480 and landscape 800×400; model filtering, tools, context chips, simulated generation and stop, artifacts, settings, appearance, project creation, library, filenames, focus and reduced motion. Screenshots are written under `test-results/kita-studio/` (ignored by Git).

Latest verification: **416 browser assertions passed**, plus **28 palette contrast combinations** and **102 visible button-size checks (≥44px)**. Theme reload persistence and the absence of provider requests during a simulated connection test were checked separately. Logs: `test-results/kita-studio-final-tests.log`.

Accessibility checks measure palette contrast and visible touch targets, plus selected focus flows; they are not a full TalkBack/WCAG audit. Home, artifact preview and model selection were also verified with all HTTP(S) requests blocked, so external fonts are not required for functionality.

See `DESIGN.md` for visual direction and boundaries.
