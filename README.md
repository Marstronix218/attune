# Attune

Attune is a private, chat-first relationship memory and care assistant. Tell it what happened in natural language and it proposes where each piece belongs—memory, calendar, task, reminder, or interaction—while keeping you in control of durable records.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. The capture flow works in demo mode without credentials and keeps approved items in browser storage.

## Configure Supabase

1. Create a Supabase project.
2. Copy `.env.example` to `.env.local` and add the project URL and anon key.
3. Apply `supabase/migrations/202609150001_initial_attune.sql` through the Supabase CLI or SQL editor.
4. Configure an auth provider in Supabase.

Set `NEXT_PUBLIC_SITE_URL=https://attune-sable-one.vercel.app` in Vercel. Supabase Auth should use the same URL as its Site URL and include it in Redirect URLs so confirmation links return to the deployed app.

The migration enables RLS on every private table and scopes records through the authenticated relationship owner. The service-role key is reserved for server-only jobs and must never use the `NEXT_PUBLIC_` prefix.

## Configure AI

Set `OPENAI_API_KEY` only on the server. When it is present, the capture endpoint uses the OpenAI Responses API with strict Zod-validated structured output and `store: false`. Without a key, the same endpoint uses a deterministic local classifier so the vertical slice remains fully testable.

## Telegram import

Export a chat as JSON from Telegram Desktop and open `/imports/telegram`. Attune also accepts timestamped Markdown (`.md` or `.markdown`) using common `Name, [date]` and `[date] **Name**: message` layouts. The parser normalizes messages, multiline text, replies, media metadata, timestamps, and participants. The upload preview is capped at 25 MB and is not persisted.

Time-only Markdown headers are also supported, including `**Jamie** (09:43, id 107613): message`. Attune preserves the Telegram message ID and marks the calendar date as unavailable instead of manufacturing one.

For sectioned exports, Attune reads `# Conversation with Jamie` and `## 2026-07-27 (Monday)` headings, then combines that section date with each message time. Because the export does not contain an IANA timezone, the wall-clock time is preserved and marked as timezone-unspecified.

If Telegram Desktop does not show an export option, Attune includes a local, read-only Telethon connector based on the account-client approach used by `texting-girlfriend-helper-telegram`:

```bash
python3 -m pip install -r scripts/telegram-requirements.txt
npm run telegram:export -- @their_username --limit 5000
```

Create an API ID and API hash at `my.telegram.org` first. The connector prompts for credentials and Telegram authentication locally, uses an in-memory session, reads the selected conversation, and creates `telegram-attune-export.json`. It does not send messages or persist the Telegram session.

## Validation

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

## Privacy contract

- AI-created durable records require review.
- Facts and inferences stay visibly distinct.
- Missing event times are never invented.
- Only approved memories should enter trusted retrieval.
- Every future persisted AI item must retain its source and rationale.
