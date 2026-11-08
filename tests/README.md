# Browser regression checks

Install the test dependency with `npm ci`. Use a locally installed Chromium:

```sh
CHROMIUM_PATH=/usr/bin/chromium npm run test:themes
CHROMIUM_PATH=/usr/bin/chromium npm test
```

The helper also detects `/usr/bin/chromium`, `/usr/bin/chromium-headless-shell` and
`/usr/bin/chromium-browser`. Paths to the app are resolved relative to this
repository, not the original author's workspace.

`themes.test.js` renders the real UI at 360px, 390px and 1440px in both themes.
It checks text/placeholder contrast (WCAG AA), component surfaces, horizontal
overflow, terminal height, switching from both controls, persistence, native
palette callbacks and browser errors. Screens include chat, sidebar, models,
Settings, providers, skills, workspace tools, dialogs, onboarding and preview.
Screenshots are written to ignored `test-results/themes/`.

These are browser tests, not Android instrumentation tests. Native system bars,
startup colors and preview chrome must also be checked on a device after building
an APK. Test fixtures use an isolated browser profile; no real API keys or user
conversations are read. The application currently loads rendering libraries and
fonts from CDNs, so the browser checks need internet access for these resources.
