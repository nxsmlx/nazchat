# Third-party skill acknowledgements

NazChat's `skills.json` contains concise, adapted instruction packs. They are not copies of the original repositories and do not execute third-party scripts. Source attribution is retained below and in each skill's metadata.

## Anthropic Agent Skills

Source: https://github.com/anthropics/skills

Adapted concepts from `frontend-design`, `web-artifacts-builder`, `theme-factory`, `mcp-builder`, and `webapp-testing`.

License: Apache License 2.0. See `licenses/Apache-2.0.txt`.

Changes for NazChat: condensed and rewritten for a chat-only OpenAI-compatible client; removed repository setup, local scripts, document generation, and image-generation workflows; added NazChat's single-file HTML Preview contract, accessibility/mobile requirements, token-conscious behavior, and provider-neutral instructions.

## Superpowers

Copyright (c) 2025 Jesse Vincent
Source: https://github.com/obra/superpowers

Adapted concepts from `brainstorming`, `writing-plans`, `systematic-debugging`, `test-driven-development`, `verification-before-completion`, `requesting-code-review`, and `receiving-code-review`.

License: MIT. See `licenses/MIT-superpowers.txt`.

Changes for NazChat: condensed for chat-only use; removed subagent, git worktree, repository-write and tool-execution requirements that are unavailable in the app; retained evidence-based planning, debugging, testing and review practices.

## UI UX Pro Max

Copyright (c) 2024 Next Level Builder
Source: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill

Adapted high-level UI/UX, responsive, design-system and accessibility practices. No external dataset or CLI is bundled.

License: MIT. See `licenses/MIT-ui-ux-pro-max.txt`.

Changes for NazChat: independently condensed into prompt guidance, with CLI/search scripts and generated imagery excluded.

## Awesome Cursor Rules

Source: https://github.com/PatrickJS/awesome-cursorrules

Adapted high-level practices for TypeScript, React, Next.js, Tailwind, backend/API, SQL/Supabase and Android/Kotlin.

License: CC0 1.0 Universal. See `licenses/CC0-1.0.txt`.

Changes for NazChat: condensed and generalized into framework-aware, provider-neutral chat prompts.

## Skill pack v2 additions

Art Direction, Interface Copy and Design Critique are concise adapted guidance from the already attributed Anthropic skills (Apache-2.0) and UI UX Pro Max (MIT) sources. No third-party scripts are executed. Protocol and OAuth implementations are original code based on MCP specifications and OAuth RFCs. Host-side test dependency org.json is test-only and is not bundled in the APK.

# Bundled runtime libraries

Since 4.5.4 these libraries ship unmodified inside the app (`nazchat/vendor/`) instead of loading from a CDN at runtime. Files were taken from the npm registry (integrity-checked by `npm pack`). Full license texts are in `nazchat/vendor/licenses/` and are packaged in the APK.

| Library | Version | Files | License |
|---|---|---|---|
| marked | 12.0.2 | `marked.min.js` | MIT |
| DOMPurify | 3.1.5 | `purify.min.js` | Apache-2.0 or MPL-2.0 |
| highlight.js (`@highlightjs/cdn-assets`) | 11.9.0 | `highlight.min.js`, `highlight-github-dark.min.css` | BSD-3-Clause |
| KaTeX | 0.16.9 | `katex/katex.min.js`, `katex/katex.min.css`, `katex/auto-render.min.js`, `katex/fonts/*.woff2` | MIT (fonts: SIL OFL 1.1) |
| PDF.js (`pdfjs-dist`) | 3.11.174 | `pdf.min.js`, `pdf.worker.min.js` (loaded on demand) | Apache-2.0 |
| mammoth | 1.8.0 | `mammoth.browser.min.js` (loaded on demand) | BSD-2-Clause |
| DM Sans (`@fontsource-variable/dm-sans`) | 5.1.0 | `fonts/dm-sans-latin*-wght-normal.woff2` | SIL OFL 1.1 |
