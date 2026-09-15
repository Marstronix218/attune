"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, ExternalLink, FileJson, LoaderCircle, MonitorDown, ShieldCheck, Terminal, UploadCloud } from "lucide-react";

type Conversation = {
  id: string;
  conversationName: string;
  messageCount: number;
  participants: string[];
  dateRange: { first: string | null; last: string | null };
  preview: Array<{ id: string; senderName: string; text: string; timestamp: string }>;
};

type ImportResult = { fileName: string; conversations: Conversation[] };

export default function TelegramImportPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [stage, setStage] = useState<"idle" | "uploading" | "ready">("idle");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selected = useMemo(
    () => result?.conversations.find((conversation) => conversation.id === selectedId) ?? result?.conversations[0] ?? null,
    [result, selectedId],
  );

  async function upload(file: File) {
    setError(null);
    setStage("uploading");
    const form = new FormData();
    form.append("file", file);
    try {
      const response = await fetch("/api/import/telegram", { method: "POST", body: form });
      const data = (await response.json()) as ImportResult & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Import failed.");
      setResult(data);
      setSelectedId(data.conversations[0]?.id ?? null);
      setStage("ready");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Import failed.");
      setStage("idle");
    }
  }

  return (
    <main className="min-h-screen bg-[#f4f0e8] px-5 py-8 text-[#1f2823] sm:px-8">
      <div className="mx-auto max-w-4xl">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-[#637068] hover:text-[#1f2823]">
          <ArrowLeft size={16} /> Back to Attune
        </Link>

        <header className="mt-10 max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6b796f]">Private import</p>
          <h1 className="mt-3 font-serif text-4xl tracking-[-0.03em] sm:text-5xl">Bring in a Telegram conversation</h1>
          <p className="mt-4 leading-7 text-[#667068]">
            Upload a Telegram Desktop JSON export or create one with Attune’s local connector. Attune parses it privately, then lets you review every
            memory before anything becomes trusted context.
          </p>
        </header>

        <section className="mt-10 rounded-3xl border border-[#d8d1c4] bg-[#fffcf7] p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <span className="rounded-2xl bg-[#e9efe9] p-3 text-[#496456]"><MonitorDown size={24} /></span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#6b796f]">First, export from Telegram</p>
              <h2 className="mt-2 text-2xl font-semibold">Create the file Attune can read</h2>
              <p className="mt-2 text-sm leading-6 text-[#737b75]">Exports are available in the installed Telegram Desktop app, not Telegram Web or the mobile app.</p>
            </div>
          </div>
          <ol className="mt-7 grid gap-3 sm:grid-cols-2">
            <ExportStep number="1" title="Open Telegram Desktop" detail="Install or open the desktop application on your computer." />
            <ExportStep number="2" title="Choose what to export" detail="For one conversation, open it and choose ⋮ → Export chat history. For all chats, use Settings → Advanced → Export Telegram data." />
            <ExportStep number="3" title="Select JSON" detail="Under Format, choose Machine-readable JSON. Media is optional—Attune only needs the messages." />
            <ExportStep number="4" title="Export and upload" detail="When Telegram finishes, find result.json in the export folder and drop it below." />
          </ol>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#f6f2eb] px-4 py-3 text-xs text-[#687169]">
            <span>Just signed into Telegram Desktop? Telegram may ask you to confirm the export from another device or wait before downloading.</span>
            <a className="inline-flex shrink-0 items-center gap-1 font-semibold text-[#496456] hover:underline" href="https://telegram.org/blog/export-and-more" target="_blank" rel="noreferrer">Telegram’s guide <ExternalLink size={13} /></a>
          </div>
        </section>

        <section className="mt-5 rounded-3xl border border-[#d8d1c4] bg-[#fffcf7] p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <span className="rounded-2xl bg-[#eee9f4] p-3 text-[#6e6280]"><Terminal size={24} /></span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#75678d]">No export option? Use the local connector</p>
              <h2 className="mt-2 text-2xl font-semibold">Read the chat through Telegram’s API</h2>
              <p className="mt-2 text-sm leading-6 text-[#737b75]">This uses the same Telethon approach as your Telegram helper repository. It runs on your computer and creates a JSON file that can be uploaded below.</p>
            </div>
          </div>
          <ol className="mt-7 grid gap-3 sm:grid-cols-3">
            <ExportStep number="1" title="Get Telegram credentials" detail="Sign in at my.telegram.org, open API development tools, and create an application to receive an API ID and API hash." />
            <ExportStep number="2" title="Run the connector" detail="In a terminal opened in the Attune project, install Telethon and run the export command shown below." />
            <ExportStep number="3" title="Upload the result" detail="The connector creates telegram-attune-export.json. Drop that file into the uploader below." />
          </ol>
          <div className="mt-5 overflow-x-auto rounded-2xl bg-[#252925] p-4 text-xs leading-6 text-[#eef2ed]">
            <pre><code>{`python3 -m pip install -r scripts/telegram-requirements.txt
npm run telegram:export -- @their_username --limit 5000`}</code></pre>
          </div>
          <div className="mt-4 flex items-start gap-2 text-xs leading-5 text-[#687169]">
            <ShieldCheck className="mt-0.5 shrink-0 text-[#496456]" size={16} />
            <p>Attune never receives your API hash, login code, or 2FA password. The connector keeps the Telegram login session only in memory, and this script does not send messages.</p>
          </div>
          <div className="mt-4 flex flex-wrap gap-4 text-xs font-semibold">
            <a className="inline-flex items-center gap-1 text-[#496456] hover:underline" href="https://my.telegram.org" target="_blank" rel="noreferrer">Open my.telegram.org <ExternalLink size={13} /></a>
            <a className="inline-flex items-center gap-1 text-[#496456] hover:underline" href="https://docs.telethon.dev/en/stable/basic/signing-in.html" target="_blank" rel="noreferrer">Telethon sign-in guide <ExternalLink size={13} /></a>
          </div>
        </section>

        {!result || !selected ? (
          <section
            className={`mt-10 rounded-3xl border border-dashed p-10 text-center transition sm:p-16 ${
              dragging ? "border-[#496456] bg-[#edf0e9]" : "border-[#cfc8bb] bg-[#fffcf7]"
            }`}
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              const file = event.dataTransfer.files[0];
              if (file) void upload(file);
            }}
          >
            <input
              ref={inputRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
              }}
            />
            {stage === "uploading" ? (
              <>
                <LoaderCircle className="mx-auto animate-spin text-[#496456]" size={36} />
                <h2 className="mt-5 text-xl font-semibold">Parsing your conversation…</h2>
                <p className="mt-2 text-sm text-[#737b75]">Reading messages, participants, and dates.</p>
              </>
            ) : (
              <>
                <UploadCloud className="mx-auto text-[#496456]" size={38} strokeWidth={1.5} />
                <h2 className="mt-5 text-xl font-semibold">Drop your Telegram JSON here</h2>
                <p className="mt-2 text-sm text-[#737b75]">JSON export · up to 25 MB for this preview</p>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="mt-7 rounded-full bg-[#294438] px-6 py-3 text-sm font-semibold text-white hover:bg-[#1f372d]"
                >
                  Choose a file
                </button>
              </>
            )}
            {error && <p className="mt-5 text-sm text-[#9b4e43]">{error}</p>}
          </section>
        ) : (
          <section className="mt-10 overflow-hidden rounded-3xl border border-[#d8d1c4] bg-[#fffcf7]">
            <div className="flex items-start gap-4 border-b border-[#e4ded3] p-6 sm:p-8">
              <span className="rounded-2xl bg-[#e9efe9] p-3 text-[#496456]"><FileJson /></span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[#496456]"><CheckCircle2 size={16} /> <span className="text-xs font-semibold uppercase tracking-wider">Ready to review</span></div>
              <h2 className="mt-2 truncate text-2xl font-semibold">{selected.conversationName}</h2>
              <p className="mt-1 text-sm text-[#727a74]">{result.fileName}</p>
              </div>
            </div>
            <div className="grid gap-px bg-[#e4ded3] sm:grid-cols-3">
              <Stat label="Messages" value={selected.messageCount.toLocaleString()} />
              <Stat label="Participants" value={selected.participants.join(", ")} />
              <Stat label="Date range" value={formatRange(selected.dateRange)} />
            </div>
            <div className="p-6 sm:p-8">
              {result.conversations.length > 1 && (
                <label className="mb-6 block text-sm font-semibold">
                  Conversation to analyze
                  <select
                    className="mt-2 block w-full rounded-xl border border-[#cfc8bb] bg-white px-4 py-3 font-normal"
                    value={selected.id}
                    onChange={(event) => setSelectedId(event.target.value)}
                  >
                    {result.conversations.map((conversation) => (
                      <option key={conversation.id} value={conversation.id}>{conversation.conversationName} · {conversation.messageCount.toLocaleString()} messages</option>
                    ))}
                  </select>
                </label>
              )}
              <h3 className="text-sm font-semibold">Conversation preview</h3>
              <div className="mt-4 space-y-3">
                {selected.preview.slice(0, 4).map((message) => (
                  <div key={message.id} className="rounded-2xl bg-[#f6f2eb] p-4">
                    <p className="text-xs font-semibold text-[#58665e]">{message.senderName}</p>
                    <p className="mt-1 line-clamp-2 text-sm leading-6">{message.text || "Media message"}</p>
                  </div>
                ))}
              </div>
              <div className="mt-7 flex flex-wrap gap-3">
                <button className="rounded-full bg-[#294438] px-6 py-3 text-sm font-semibold text-white">Analyze for memories</button>
                <button onClick={() => { setResult(null); setSelectedId(null); }} className="rounded-full border border-[#cfc8bb] px-6 py-3 text-sm font-semibold">Choose another file</button>
              </div>
              <p className="mt-4 text-xs leading-5 text-[#7b817c]">Analysis is the next server-side integration step. Imported files are not persisted by this preview.</p>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="bg-[#fffcf7] p-5"><p className="text-xs uppercase tracking-wider text-[#7b817c]">{label}</p><p className="mt-2 text-sm font-semibold">{value}</p></div>;
}

function ExportStep({ number, title, detail }: { number: string; title: string; detail: string }) {
  return (
    <li className="flex gap-3 rounded-2xl border border-[#e4ded3] p-4">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#294438] text-xs font-semibold text-white">{number}</span>
      <div><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 text-xs leading-5 text-[#737b75]">{detail}</p></div>
    </li>
  );
}

function formatRange(range: Conversation["dateRange"]) {
  if (!range.first || !range.last) return "No dated messages";
  const formatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${formatter.format(new Date(range.first))} – ${formatter.format(new Date(range.last))}`;
}
