# NazChat 2.0.0

NazChat 2.0 is a substantial UI and workflow refresh.

## Highlights

- Composer-first model selection: the model is no longer placed in the top header.
- Cleaner mobile chat workspace with a calmer header, better typography, table overflow, and streaming cursor.
- Image attachments with client-side resize for vision-capable providers.
- Text, Markdown, code, CSV, JSON, PDF, and DOCX attachments with client-side extraction.
- Reasoning controls: Thinking toggle plus Low / High / Max depth.
- Lyber-compatible reasoning delta parsing.
- Native Android networking for providers without CORS headers.
- Conversation backup export/import.
- Settings update checker backed by this GitHub repository.
- Android file chooser integration.

## Notes

Provider API keys remain local to the device. Attachment content is sent to the selected provider only when the user sends the message.
