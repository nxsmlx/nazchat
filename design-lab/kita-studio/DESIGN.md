# Kita Studio — frontend exploration

Status: isolated interactive prototype. Not an APK, migration, provider client or production implementation. The existing v4.2.2 files remain untouched.

## Direction
A calm, capable AI studio for people who move between conversation and making things. Mobile-first, with legible tools and a composer that leaves room for thought. The distinctive element is a folded four-part Kita mark paired with an asymmetric, open workspace—not a dashboard of cards.

## Tokens
- Light canvas / surface / raised: `#f4f5f8` / `#ffffff` / `#eceef4`
- Light ink / secondary / iris: `#222531` / `#626879` / `#6653bb`
- Dark canvas / surface / raised: `#15171d` / `#1c1f27` / `#272b36`
- Dark ink / secondary / iris: `#edf0f7` / `#a5adbf` / `#bdadff`
- Status green is reserved for state, not decoration.
- Spacing: 4, 8, 12, 16, 24, 32, 48. Touch areas ≥44px, main mobile actions 48px.
- Radius: 10px controls, 16px surfaces, 22px composer and mobile sheets.
- Type: DM Sans variable, with system sans fallback; system monospace only for code. 12/14/16/20/28/40px scale, conversation line-height 1.7.

## Structure
Desktop:
```
[sidebar 256px] [quiet header                           ]
[New chat    ] [                                       ]
[Chats       ] [        home / readable conversation    ]
[Projects    ] [                                       ]
[Library     ] [       active context chips             ]
[History     ] [       generous composer                ]
[Settings    ] [       model / tools / send             ]
```
Mobile:
```
[menu] [Kita / conversation title] [new chat]
[                                         ]
[        home / conversation               ]
[                                         ]
[context chips                            ]
[prompt                                   ]
[model             Tools              Send]
```

- Navigation: Chat, Projects, Library. Settings is utility navigation at the bottom.
- Composer: model selector, labeled Tools control, attachment, send/stop. Selected tools appear as removable chips, not five unexplained toggles.
- Settings: Connections, Appearance, Workspace, About; model reasoning remains in conversation Tools.
- Model selection: searchable examples with provider labels, context size and current selection.
- Artifacts: dedicated preview/code panel, saved to Library.
- Light/dark/system selection persists only in a prototype-specific localStorage key.

## Critical review before build
Avoid purple gradients, identical feature cards, decorative uppercase metadata, and a marketing landing-page hero. Use the iris accent for selection and key controls only. Give starter prompts an open-list treatment. Keep mobile header orientation and generous tap areas. Do not imply simulated AI/provider behavior is real.

## Demonstrated flows
1. Home → prompt suggestion or own text → simulated streaming answer → copy / regenerate / edit / stop.
2. Model search → model choice → Tools selection → visible context chips → attachment selection (filename only, no upload).
3. Recent artifact chat → Preview / Code → save to Library → reopen.
4. Connections → explicitly fake connection simulation; Appearance → Light / Dark / System.
5. Projects → project-specific chat; Library → saved prompt or artifact.

## Boundaries
No backend requests, API keys, native bridges, voice recording, updates or production data access. Demo replies are predetermined, not AI-generated. Attachment contents are not read. Connection fields accept demo labels, never credentials. All prototype state other than appearance is in-memory and resets on reload. External links within the demo artifact are not needed.
