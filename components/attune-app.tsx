"use client";

import {
  ArrowUp,
  Bell,
  BookHeart,
  CalendarDays,
  Check,
  ChevronRight,
  CircleCheck,
  Clock3,
  Heart,
  Inbox,
  LoaderCircle,
  MessageCircleHeart,
  Pencil,
  RotateCcw,
  Settings2,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import type {
  AnalysisResult,
  CaptureCandidate,
  Destination,
  RelationshipSettings,
  SavedItem,
} from "@/lib/domain";
import { formatLocalTime, getTimeAwareSuggestion } from "@/lib/time";

const SETTINGS_KEY = "attune:settings:v1";
const ITEMS_KEY = "attune:saved-items:v1";

const defaultSettings: RelationshipSettings = {
  userName: "You",
  partnerName: "Maya",
  userTimezone: "America/Los_Angeles",
  partnerTimezone: "Europe/London",
};

const timezones = [
  "America/Los_Angeles",
  "America/New_York",
  "Europe/London",
  "Europe/Paris",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Australia/Sydney",
];

const destinationMeta: Record<Destination, { label: string; icon: typeof Heart; color: string }> = {
  memory: { label: "Memory", icon: BookHeart, color: "rose" },
  calendar: { label: "Calendar", icon: CalendarDays, color: "sage" },
  task: { label: "Task", icon: CircleCheck, color: "amber" },
  reminder: { label: "Reminder", icon: Bell, color: "lavender" },
  interaction: { label: "Interaction", icon: MessageCircleHeart, color: "blue" },
};

type View = "capture" | "memories" | "calendar" | "reminders";
type ChatEntry =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; result: AnalysisResult };

type UndoAction =
  | { kind: "approve"; candidate: CaptureCandidate }
  | { kind: "reject"; candidate: CaptureCandidate };

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function safeParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function AttuneApp() {
  const [settings, setSettings] = useState(defaultSettings);
  const [savedItems, setSavedItems] = useState<SavedItem[]>([]);
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [draft, setDraft] = useState("");
  const [activeView, setActiveView] = useState<View>("capture");
  const [isThinking, setIsThinking] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState<Date | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [undoAction, setUndoAction] = useState<UndoAction | null>(null);
  const scrollAnchor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const hydrateFrame = window.requestAnimationFrame(() => {
      setSettings(safeParse(localStorage.getItem(SETTINGS_KEY), defaultSettings));
      setSavedItems(safeParse(localStorage.getItem(ITEMS_KEY), []));
      setNow(new Date());
      setHydrated(true);
    });
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => {
      window.cancelAnimationFrame(hydrateFrame);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(ITEMS_KEY, JSON.stringify(savedItems));
  }, [savedItems, hydrated]);

  useEffect(() => {
    scrollAnchor.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [entries, isThinking]);

  useEffect(() => {
    if (!undoAction) return;
    const timer = window.setTimeout(() => setUndoAction(null), 6000);
    return () => window.clearTimeout(timer);
  }, [undoAction]);

  const submitCapture = async (text = draft) => {
    const cleanText = text.trim();
    if (!cleanText || isThinking) return;
    setDraft("");
    setError("");
    setActiveView("capture");
    setEntries((current) => [...current, { id: uid(), role: "user", text: cleanText }]);
    setIsThinking(true);
    try {
      const response = await fetch("/api/capture/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: cleanText, settings }),
      });
      const body = (await response.json()) as AnalysisResult | { error?: string };
      if (!response.ok || !("candidates" in body)) {
        throw new Error("error" in body ? body.error : "Attune couldn’t organize that note.");
      }
      setEntries((current) => [...current, { id: uid(), role: "assistant", result: body }]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Something went quiet. Try once more.");
    } finally {
      setIsThinking(false);
    }
  };

  const updateCandidate = (entryId: string, candidate: CaptureCandidate) => {
    setEntries((current) => current.map((entry) => {
      if (entry.id !== entryId || entry.role !== "assistant") return entry;
      return {
        ...entry,
        result: {
          ...entry.result,
          candidates: entry.result.candidates.map((item) => item.id === candidate.id ? candidate : item),
        },
      };
    }));
  };

  const setCandidateStatus = (entryId: string, candidate: CaptureCandidate, status: "approved" | "rejected") => {
    updateCandidate(entryId, { ...candidate, status });
    if (status === "approved") {
      const saved: SavedItem = { ...candidate, status, savedAt: new Date().toISOString() };
      setSavedItems((current) => [saved, ...current.filter((item) => item.id !== candidate.id)]);
      setUndoAction({ kind: "approve", candidate });
    } else {
      setUndoAction({ kind: "reject", candidate });
    }
  };

  const undo = () => {
    if (!undoAction) return;
    if (undoAction.kind === "approve") {
      setSavedItems((current) => current.filter((item) => item.id !== undoAction.candidate.id));
    }
    setEntries((current) => current.map((entry) => entry.role === "assistant" ? {
      ...entry,
      result: {
        ...entry.result,
        candidates: entry.result.candidates.map((candidate) => candidate.id === undoAction.candidate.id
          ? { ...candidate, status: "pending" }
          : candidate),
      },
    } : entry));
    setUndoAction(null);
  };

  const filteredItems = useMemo(() => {
    if (activeView === "memories") return savedItems.filter((item) => ["memory", "interaction"].includes(item.destination));
    if (activeView === "calendar") return savedItems.filter((item) => item.destination === "calendar");
    if (activeView === "reminders") return savedItems.filter((item) => ["reminder", "task"].includes(item.destination));
    return savedItems;
  }, [activeView, savedItems]);

  return (
    <div className="app-shell">
      <SideNav activeView={activeView} setActiveView={setActiveView} savedItems={savedItems} settings={settings} />

      <main className="main-panel">
        {activeView === "capture" ? (
          <CaptureView
            entries={entries}
            draft={draft}
            error={error}
            isThinking={isThinking}
            partnerName={settings.partnerName}
            onDraftChange={setDraft}
            onSubmit={submitCapture}
            onCandidateChange={updateCandidate}
            onCandidateStatus={setCandidateStatus}
            scrollAnchor={scrollAnchor}
          />
        ) : (
          <LibraryView view={activeView} items={filteredItems} onReturn={() => setActiveView("capture")} onDelete={(id) => setSavedItems((current) => current.filter((item) => item.id !== id))} />
        )}
      </main>

      <ContextRail settings={settings} setSettings={setSettings} now={now} savedItems={savedItems} />

      <MobileNav activeView={activeView} setActiveView={setActiveView} />

      {undoAction && (
        <div className="undo-toast" role="status">
          <span>{undoAction.kind === "approve" ? "Saved to Attune" : "Suggestion dismissed"}</span>
          <button onClick={undo}><RotateCcw size={15} /> Undo</button>
        </div>
      )}
    </div>
  );
}

function Brand() {
  return (
    <div className="brand">
      <div className="brand-mark"><Heart size={18} fill="currentColor" /></div>
      <span>attune</span>
    </div>
  );
}

function SideNav({ activeView, setActiveView, savedItems, settings }: {
  activeView: View;
  setActiveView: (view: View) => void;
  savedItems: SavedItem[];
  settings: RelationshipSettings;
}) {
  const links: { id: View; label: string; icon: typeof Heart; count?: number }[] = [
    { id: "capture", label: "Talk to Attune", icon: Sparkles },
    { id: "memories", label: "Memories", icon: BookHeart, count: savedItems.filter((i) => ["memory", "interaction"].includes(i.destination)).length },
    { id: "calendar", label: "Shared context", icon: CalendarDays, count: savedItems.filter((i) => i.destination === "calendar").length },
    { id: "reminders", label: "Care cues", icon: Bell, count: savedItems.filter((i) => ["reminder", "task"].includes(i.destination)).length },
  ];
  return (
    <aside className="side-nav">
      <Brand />
      <nav aria-label="Main navigation">
        <p className="nav-label">Your space</p>
        {links.map(({ id, label, icon: Icon, count }) => (
          <button key={id} className={activeView === id ? "nav-link active" : "nav-link"} onClick={() => setActiveView(id)}>
            <Icon size={18} strokeWidth={1.8} />
            <span>{label}</span>
            {typeof count === "number" && count > 0 && <small>{count}</small>}
          </button>
        ))}
        <Link className="nav-link import-link" href="/imports/telegram">
          <Inbox size={18} strokeWidth={1.8} />
          <span>Telegram import</span>
        </Link>
      </nav>
      <div className="side-note">
        <div className="presence-dot" />
        <div><strong>{settings.partnerName}</strong><span>Relationship space</span></div>
        <ChevronRight size={16} />
      </div>
      <p className="privacy-note">Private to you · stored on this device</p>
    </aside>
  );
}

function CaptureView({ entries, draft, error, isThinking, partnerName, onDraftChange, onSubmit, onCandidateChange, onCandidateStatus, scrollAnchor }: {
  entries: ChatEntry[];
  draft: string;
  error: string;
  isThinking: boolean;
  partnerName: string;
  onDraftChange: (value: string) => void;
  onSubmit: (text?: string) => void;
  onCandidateChange: (entryId: string, candidate: CaptureCandidate) => void;
  onCandidateStatus: (entryId: string, candidate: CaptureCandidate, status: "approved" | "rejected") => void;
  scrollAnchor: React.RefObject<HTMLDivElement | null>;
}) {
  const examples = [
    `${partnerName} is meeting friends tomorrow evening`,
    `${partnerName} loves peonies and quiet coffee shops`,
    `Remind me to ask how the presentation went Friday`,
  ];
  return (
    <div className="capture-view">
      <header className="mobile-header"><Brand /><span>Private space</span></header>
      <div className={entries.length ? "conversation has-entries" : "conversation"}>
        {entries.length === 0 ? (
          <section className="empty-state">
            <div className="ai-orb"><Sparkles size={24} /></div>
            <p className="eyebrow">A softer kind of remembering</p>
            <h1>What would you like<br />to remember?</h1>
            <p className="intro">Share anything from a call, message, or passing thought. I’ll gently sort the useful pieces—you decide what stays.</p>
            <div className="example-grid">
              {examples.map((example, index) => (
                <button key={example} onClick={() => onSubmit(example)}>
                  <span>{index === 0 ? "Plans" : index === 1 ? "Preferences" : "Follow-up"}</span>
                  {example}
                  <ArrowUp size={15} />
                </button>
              ))}
            </div>
          </section>
        ) : (
          <div className="message-list">
            <div className="conversation-heading">
              <p className="eyebrow">Talk to Attune</p>
              <h1>Let’s make sense of it.</h1>
              <p>I’ll suggest where each detail belongs. Nothing is saved until you approve it.</p>
            </div>
            {entries.map((entry) => entry.role === "user" ? (
              <div className="user-message" key={entry.id}>{entry.text}</div>
            ) : (
              <div className="assistant-message" key={entry.id}>
                <div className="assistant-avatar"><Sparkles size={14} /></div>
                <div className="assistant-body">
                  <p>{entry.result.summary}</p>
                  <div className="candidate-list">
                    {entry.result.candidates.map((candidate) => (
                      <CandidateCard
                        key={candidate.id}
                        candidate={candidate}
                        onChange={(next) => onCandidateChange(entry.id, next)}
                        onStatus={(status) => onCandidateStatus(entry.id, candidate, status)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            ))}
            {isThinking && (
              <div className="thinking"><span><i /><i /><i /></span>Attune is finding the useful details…</div>
            )}
            {error && <div className="error-message">{error}</div>}
            <div ref={scrollAnchor} />
          </div>
        )}
      </div>
      <Composer draft={draft} setDraft={onDraftChange} submit={() => onSubmit()} isThinking={isThinking} />
    </div>
  );
}

function Composer({ draft, setDraft, submit, isThinking }: { draft: string; setDraft: (text: string) => void; submit: () => void; isThinking: boolean }) {
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };
  return (
    <form className="composer-wrap" onSubmit={(event: FormEvent) => { event.preventDefault(); submit(); }}>
      <div className="composer">
        <textarea rows={1} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={handleKeyDown} placeholder="Tell me what happened…" aria-label="Tell Attune what happened" />
        <button type="submit" disabled={!draft.trim() || isThinking} aria-label="Send note">
          {isThinking ? <LoaderCircle className="spin" size={18} /> : <ArrowUp size={19} />}
        </button>
      </div>
      <p>Attune can make mistakes. You’re always in control of what’s kept.</p>
    </form>
  );
}

function CandidateCard({ candidate, onChange, onStatus }: {
  candidate: CaptureCandidate;
  onChange: (candidate: CaptureCandidate) => void;
  onStatus: (status: "approved" | "rejected") => void;
}) {
  const [editing, setEditing] = useState(false);
  const meta = destinationMeta[candidate.destination];
  const Icon = meta.icon;

  if (candidate.status !== "pending") {
    return (
      <div className={`candidate-card resolved ${candidate.status}`}>
        <div className={`candidate-icon ${meta.color}`}><Icon size={17} /></div>
        <div><strong>{candidate.title}</strong><span>{candidate.status === "approved" ? `Saved to ${meta.label}` : "Not saved"}</span></div>
        {candidate.status === "approved" ? <Check size={18} /> : <X size={18} />}
      </div>
    );
  }

  return (
    <article className="candidate-card">
      <div className="candidate-topline">
        <div className={`candidate-icon ${meta.color}`}><Icon size={17} /></div>
        <div className="candidate-heading">
          <span>{meta.label}</span>
          {candidate.classification === "inference" && <em>inference</em>}
        </div>
        <span className="confidence">{Math.round(candidate.confidence * 100)}% sure</span>
      </div>
      {editing ? (
        <div className="candidate-edit">
          <input value={candidate.title} aria-label="Title" onChange={(event) => onChange({ ...candidate, title: event.target.value })} />
          <textarea value={candidate.detail} aria-label="Detail" rows={3} onChange={(event) => onChange({ ...candidate, detail: event.target.value })} />
          <select value={candidate.destination} aria-label="Destination" onChange={(event) => onChange({ ...candidate, destination: event.target.value as Destination })}>
            {Object.entries(destinationMeta).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}
          </select>
        </div>
      ) : (
        <div className="candidate-copy">
          <h3>{candidate.title}</h3>
          <p>{candidate.detail}</p>
          {candidate.date && <span className="date-chip"><Clock3 size={13} /> {formatCandidateDate(candidate.date)}</span>}
          <small>{candidate.reasoning}</small>
        </div>
      )}
      <div className="candidate-actions">
        <button className="approve" onClick={() => onStatus("approved")}><Check size={15} /> Keep</button>
        <button onClick={() => setEditing(!editing)}><Pencil size={14} /> {editing ? "Done" : "Edit"}</button>
        <button onClick={() => onStatus("rejected")}><X size={15} /> Skip</button>
      </div>
    </article>
  );
}

function formatCandidateDate(value: string) {
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(date);
}

function ContextRail({ settings, setSettings, now, savedItems }: {
  settings: RelationshipSettings;
  setSettings: (settings: RelationshipSettings) => void;
  now: Date | null;
  savedItems: SavedItem[];
}) {
  const partnerTime = now ? formatLocalTime(settings.partnerTimezone, now) : { time: "—", date: "—" };
  const userTime = now ? formatLocalTime(settings.userTimezone, now) : { time: "—", date: "—" };
  const suggestion = now
    ? getTimeAwareSuggestion(settings.partnerTimezone, now)
    : { title: "Finding the right moment", body: "Attune uses their local time to offer gentle context.", tone: "neutral" as const };
  return (
    <aside className="context-rail">
      <div className="rail-header"><span>Context</span><Settings2 size={17} /></div>
      <section className="connection-card">
        <div className="connection-head">
          <div className="avatar">{settings.partnerName.slice(0, 1).toUpperCase()}</div>
          <div><strong>{settings.partnerName}</strong><span>Your person</span></div>
        </div>
        <div className="time-row">
          <div><span>Their time</span><strong>{partnerTime.time}</strong><small>{partnerTime.date}</small></div>
          <div><span>Your time</span><strong>{userTime.time}</strong><small>{userTime.date}</small></div>
        </div>
      </section>
      <section className={`timing-card ${suggestion.tone}`}>
        <Clock3 size={17} />
        <div><strong>{suggestion.title}</strong><p>{suggestion.body}</p></div>
      </section>
      <section className="settings-card">
        <p className="rail-label">Relationship settings</p>
        <label>Partner name<input value={settings.partnerName} onChange={(event) => setSettings({ ...settings, partnerName: event.target.value || "Partner" })} /></label>
        <label>Their timezone<select value={settings.partnerTimezone} onChange={(event) => setSettings({ ...settings, partnerTimezone: event.target.value })}>{timezones.map((zone) => <option key={zone}>{zone}</option>)}</select></label>
        <label>Your timezone<select value={settings.userTimezone} onChange={(event) => setSettings({ ...settings, userTimezone: event.target.value })}>{timezones.map((zone) => <option key={zone}>{zone}</option>)}</select></label>
      </section>
      <div className="memory-count"><BookHeart size={17} /><span><strong>{savedItems.length}</strong> details held with care</span></div>
    </aside>
  );
}

function LibraryView({ view, items, onReturn, onDelete }: { view: Exclude<View, "capture">; items: SavedItem[]; onReturn: () => void; onDelete: (id: string) => void }) {
  const labels = {
    memories: { eyebrow: "What you’ve learned", title: "Memories", body: "Preferences, moments, and patterns you chose to keep." },
    calendar: { eyebrow: "The shape of their days", title: "Shared context", body: "Plans and dates worth keeping in view." },
    reminders: { eyebrow: "Small ways to show up", title: "Care cues", body: "Thoughtful follow-ups and reminders for later." },
  }[view];
  return (
    <div className="library-view">
      <header className="mobile-header"><Brand /><span>Private space</span></header>
      <div className="library-inner">
        <p className="eyebrow">{labels.eyebrow}</p>
        <h1>{labels.title}</h1>
        <p className="library-intro">{labels.body}</p>
        {items.length === 0 ? (
          <div className="library-empty"><Inbox size={27} /><h2>Nothing here yet</h2><p>Tell Attune about a recent conversation and the useful details will find their place.</p><button onClick={onReturn}>Talk to Attune <ArrowUp size={15} /></button></div>
        ) : (
          <div className="saved-grid">{items.map((item) => <SavedCard key={item.id} item={item} onDelete={() => onDelete(item.id)} />)}</div>
        )}
      </div>
    </div>
  );
}

function SavedCard({ item, onDelete }: { item: SavedItem; onDelete: () => void }) {
  const meta = destinationMeta[item.destination];
  const Icon = meta.icon;
  return (
    <article className="saved-card">
      <div className={`candidate-icon ${meta.color}`}><Icon size={17} /></div>
      <div className="saved-copy"><span>{meta.label}</span><h3>{item.title}</h3><p>{item.detail}</p>{item.date && <small><Clock3 size={12} /> {formatCandidateDate(item.date)}</small>}</div>
      <button className="delete-item" onClick={onDelete} aria-label={`Delete ${item.title}`}><Trash2 size={15} /></button>
    </article>
  );
}

function MobileNav({ activeView, setActiveView }: { activeView: View; setActiveView: (view: View) => void }) {
  const links: { id: View; label: string; icon: typeof Heart }[] = [
    { id: "capture", label: "Attune", icon: Sparkles },
    { id: "memories", label: "Memories", icon: BookHeart },
    { id: "calendar", label: "Context", icon: CalendarDays },
    { id: "reminders", label: "Care", icon: Bell },
  ];
  return <nav className="mobile-nav">{links.map(({ id, label, icon: Icon }) => <button key={id} className={activeView === id ? "active" : ""} onClick={() => setActiveView(id)}><Icon size={19} /><span>{label}</span></button>)}</nav>;
}
