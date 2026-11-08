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

`studio.test.js` exercises the **production** UI (not `design-lab/`). Its 21 cases
cover schema-3 upgrade fixtures, retained chats/provider-key references/projects,
real navigation and empty states, prompt review/persistence, artifact parsing and
preview, project assignment/context, generation navigation guards, Tools/model
selection, larger text, theme persistence, native-System **mocks**, keyboard/focus
and responsive layouts at 320×480, 390×844, 800×400 and 1440×900. Provider replies
are mocked in tests only; no live AI requests are made. Selected visible controls
are measured against a 44px target. This is not a complete accessibility audit.
Run it independently with `npm run test:studio`; screenshots and reports go to
ignored `test-results/studio/`.

These are browser tests, not Android instrumentation tests. Native system bars,
startup colors and preview chrome must also be checked on a device after building
an APK. Test fixtures use an isolated browser profile; no real API keys or user
conversations are read. The application currently loads rendering libraries and
fonts from CDNs, so the browser checks need internet access for these resources.
