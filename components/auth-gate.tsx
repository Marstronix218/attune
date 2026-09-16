"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Heart, LoaderCircle, LockKeyhole, UserRoundPlus } from "lucide-react";
import { AttuneApp } from "@/components/attune-app";
import type { RelationshipSettings } from "@/lib/domain";
import { createClient } from "@/lib/supabase/browser";

type Workspace = {
  relationshipId: string;
  userId: string;
  settings: RelationshipSettings;
};

const timezoneOptions = [
  "America/Los_Angeles",
  "America/New_York",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Australia/Sydney",
];

export function AuthGate() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [workspace, setWorkspace] = useState<Workspace | null>(null);

  const loadWorkspace = useCallback(async (id: string, fallbackEmail = "") => {
    if (!supabase) return;
    const [{ data: profile }, { data: relationship }] = await Promise.all([
      supabase.from("profiles").select("display_name, timezone").eq("user_id", id).maybeSingle(),
      supabase.from("relationships").select("id, partner_name, partner_timezone").eq("owner_user_id", id).eq("status", "active").order("created_at").limit(1).maybeSingle(),
    ]);
    if (!relationship) {
      setWorkspace(null);
      setLoading(false);
      return;
    }
    setWorkspace({
      relationshipId: relationship.id,
      userId: id,
      settings: {
        userName: profile?.display_name || fallbackEmail.split("@")[0] || "You",
        partnerName: relationship.partner_name,
        userTimezone: profile?.timezone || "America/Los_Angeles",
        partnerTimezone: relationship.partner_timezone,
      },
    });
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getUser().then(({ data }) => {
      const user = data.user;
      setUserId(user?.id ?? null);
      setEmail(user?.email ?? "");
      if (user) void loadWorkspace(user.id, user.email);
      else setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      setUserId(user?.id ?? null);
      setEmail(user?.email ?? "");
      if (user) void loadWorkspace(user.id, user.email);
      else {
        setWorkspace(null);
        setLoading(false);
      }
    });
    return () => data.subscription.unsubscribe();
  }, [loadWorkspace, supabase]);

  if (!supabase) return <AttuneApp />;
  if (loading) return <LoadingScreen />;
  if (!userId) return <AuthScreen supabase={supabase} />;
  if (!workspace) return <OnboardingScreen userId={userId} email={email} supabase={supabase} onCreated={() => loadWorkspace(userId, email)} />;

  const persistSettings = async (settings: RelationshipSettings) => {
    setWorkspace((current) => current ? { ...current, settings } : current);
    await Promise.all([
      supabase.from("profiles").update({ display_name: settings.userName, timezone: settings.userTimezone, updated_at: new Date().toISOString() }).eq("user_id", workspace.userId),
      supabase.from("relationships").update({ partner_name: settings.partnerName, partner_timezone: settings.partnerTimezone, updated_at: new Date().toISOString() }).eq("id", workspace.relationshipId),
      supabase.from("partner_profiles").update({ name: settings.partnerName, timezone: settings.partnerTimezone, updated_at: new Date().toISOString() }).eq("relationship_id", workspace.relationshipId),
    ]);
  };

  return (
    <AttuneApp
      initialSettings={workspace.settings}
      relationshipId={workspace.relationshipId}
      storageScope={workspace.userId}
      onSettingsChange={(settings) => void persistSettings(settings)}
      onSignOut={() => void supabase.auth.signOut()}
    />
  );
}

function LoadingScreen() {
  return <main className="auth-shell"><div className="auth-loading"><LoaderCircle className="spin" /><span>Opening your private space…</span></div></main>;
}

type BrowserClient = NonNullable<ReturnType<typeof createClient>>;

function AuthScreen({ supabase }: { supabase: BrowserClient }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const result = mode === "signin"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });
    if (result.error) setMessage(result.error.message);
    else if (mode === "signup" && !result.data.session) setMessage("Check your email to confirm your account, then sign in.");
    setBusy(false);
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-brand"><span><Heart size={19} fill="currentColor" /></span>attune</div>
        <p className="auth-eyebrow">Your private relationship space</p>
        <h1>{mode === "signin" ? "Welcome back." : "Create your space."}</h1>
        <p className="auth-intro">Your memories and relationship context stay separate from every other Attune account.</p>
        <form onSubmit={submit} className="auth-form">
          <label>Email<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label>
          <label>Password<input type="password" minLength={8} autoComplete={mode === "signin" ? "current-password" : "new-password"} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" /></label>
          {message && <p className="auth-message" role="status">{message}</p>}
          <button type="submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : mode === "signin" ? <LockKeyhole size={17} /> : <UserRoundPlus size={17} />}{mode === "signin" ? "Sign in" : "Create account"}</button>
        </form>
        <button className="auth-switch" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setMessage(""); }}>
          {mode === "signin" ? "New to Attune? Create an account" : "Already have an account? Sign in"}
        </button>
      </section>
    </main>
  );
}

function OnboardingScreen({ userId, email, supabase, onCreated }: { userId: string; email: string; supabase: BrowserClient; onCreated: () => void }) {
  const [form, setForm] = useState({
    userName: email.split("@")[0] || "You",
    partnerName: "Jamie",
    userTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Los_Angeles",
    partnerTimezone: "Europe/Berlin",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function createWorkspace(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const { error: profileError } = await supabase.from("profiles").upsert({ user_id: userId, display_name: form.userName, timezone: form.userTimezone }, { onConflict: "user_id" });
    if (profileError) { setError(profileError.message); setBusy(false); return; }
    const { data: relationship, error: relationshipError } = await supabase.from("relationships").insert({ owner_user_id: userId, partner_name: form.partnerName, partner_timezone: form.partnerTimezone, relationship_name: `${form.userName} & ${form.partnerName}` }).select("id").single();
    if (relationshipError) { setError(relationshipError.message); setBusy(false); return; }
    const { error: partnerError } = await supabase.from("partner_profiles").insert({ relationship_id: relationship.id, name: form.partnerName, timezone: form.partnerTimezone });
    if (partnerError) { setError(partnerError.message); setBusy(false); return; }
    onCreated();
  }

  return (
    <main className="auth-shell">
      <section className="auth-card onboarding-card">
        <div className="auth-brand"><span><Heart size={19} fill="currentColor" /></span>attune</div>
        <p className="auth-eyebrow">A few details first</p>
        <h1>Set up your space.</h1>
        <form onSubmit={createWorkspace} className="auth-form onboarding-form">
          <label>Your name<input required value={form.userName} onChange={(event) => setForm({ ...form, userName: event.target.value })} /></label>
          <label>Partner name<input required value={form.partnerName} onChange={(event) => setForm({ ...form, partnerName: event.target.value })} /></label>
          <label>Your timezone<select value={form.userTimezone} onChange={(event) => setForm({ ...form, userTimezone: event.target.value })}>{timezoneOptions.map((zone) => <option key={zone}>{zone}</option>)}</select></label>
          <label>Partner timezone<select value={form.partnerTimezone} onChange={(event) => setForm({ ...form, partnerTimezone: event.target.value })}>{timezoneOptions.map((zone) => <option key={zone}>{zone}</option>)}</select></label>
          {error && <p className="auth-message">{error}</p>}
          <button type="submit" disabled={busy}>{busy && <LoaderCircle className="spin" size={17} />}Create relationship space</button>
        </form>
      </section>
    </main>
  );
}
