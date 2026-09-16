import { NextResponse } from "next/server";
import { z } from "zod";
import { candidateSchema, destinationSchema, type SavedItem } from "@/lib/domain";
import { createClient } from "@/lib/supabase/server";

const relationshipSchema = z.string().uuid();
const createSchema = z.object({ relationshipId: relationshipSchema, candidate: candidateSchema });
const deleteSchema = z.object({ relationshipId: relationshipSchema, destination: destinationSchema, id: z.string().uuid() });

async function ownedClient(relationshipId: string) {
  const supabase = await createClient();
  if (!supabase) return { error: NextResponse.json({ error: "Supabase is not configured." }, { status: 503 }) };
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: NextResponse.json({ error: "Please sign in." }, { status: 401 }) };
  const { data: relationship } = await supabase.from("relationships").select("id").eq("id", relationshipId).eq("owner_user_id", auth.user.id).maybeSingle();
  if (!relationship) return { error: NextResponse.json({ error: "Relationship not found." }, { status: 404 }) };
  return { supabase };
}

export async function GET(request: Request) {
  const relationshipId = new URL(request.url).searchParams.get("relationshipId");
  const parsed = relationshipSchema.safeParse(relationshipId);
  if (!parsed.success) return NextResponse.json({ error: "Invalid relationship." }, { status: 400 });
  const owned = await ownedClient(parsed.data);
  if ("error" in owned) return owned.error;
  const { supabase } = owned;
  const [memories, events, tasks, reminders, interactions] = await Promise.all([
    supabase.from("memories").select("id,memory_type,content,classification,confidence,occurred_at,created_at").eq("relationship_id", parsed.data).eq("status", "approved"),
    supabase.from("calendar_events").select("id,title,description,event_date,start_time,participant,created_at").eq("relationship_id", parsed.data).eq("status", "approved"),
    supabase.from("tasks").select("id,title,description,due_at,created_at").eq("relationship_id", parsed.data).in("status", ["approved", "completed"]),
    supabase.from("reminders").select("id,title,remind_at,created_at").eq("relationship_id", parsed.data).in("status", ["approved", "sent"]),
    supabase.from("interactions").select("id,type,summary,occurred_at,created_at").eq("relationship_id", parsed.data).eq("status", "approved"),
  ]);
  const queryError = [memories.error, events.error, tasks.error, reminders.error, interactions.error].find(Boolean);
  if (queryError) return NextResponse.json({ error: queryError.message }, { status: 500 });

  const items: SavedItem[] = [
    ...(memories.data ?? []).map((row) => saved(row.id, "memory", row.memory_type, row.content, row.classification, row.confidence, row.occurred_at, row.created_at)),
    ...(events.data ?? []).map((row) => saved(row.id, "calendar", row.title, row.description ?? row.title, "fact", 0.9, row.event_date ?? row.start_time, row.created_at, row.participant)),
    ...(tasks.data ?? []).map((row) => saved(row.id, "task", row.title, row.description ?? row.title, "fact", 0.9, row.due_at, row.created_at, "user")),
    ...(reminders.data ?? []).map((row) => saved(row.id, "reminder", row.title, row.title, "fact", 0.9, row.remind_at, row.created_at, "user")),
    ...(interactions.data ?? []).map((row) => saved(row.id, "interaction", row.type, row.summary, "fact", 0.9, row.occurred_at, row.created_at, "both")),
  ].sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const body: unknown = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid record." }, { status: 400 });
  const owned = await ownedClient(parsed.data.relationshipId);
  if ("error" in owned) return owned.error;
  const { supabase } = owned;
  const { relationshipId, candidate } = parsed.data;
  const now = new Date().toISOString();
  const { data: source, error: sourceError } = await supabase.from("memory_sources").insert({
    relationship_id: relationshipId,
    source_type: "user_input",
    source_text: candidate.sourceText,
    source_timestamp: now,
    metadata: { candidate_title: candidate.title, reasoning: candidate.reasoning },
  }).select("id").single();
  if (sourceError) return NextResponse.json({ error: sourceError.message }, { status: 500 });

  const common = { relationship_id: relationshipId, source_id: source.id, status: "approved" };
  let inserted: { id: string; created_at?: string } | null = null;
  let insertError: { message: string } | null = null;
  if (candidate.destination === "memory") {
    const result = await supabase.from("memories").insert({ ...common, memory_type: candidate.title, content: candidate.detail, classification: candidate.classification, importance: 5, confidence: candidate.confidence, source: "user_input", occurred_at: toTimestamp(candidate.date) }).select("id,created_at").single();
    inserted = result.data; insertError = result.error;
  } else if (candidate.destination === "calendar") {
    const result = await supabase.from("calendar_events").insert({ ...common, title: candidate.title, description: candidate.detail, event_date: candidate.date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10), timezone: "UTC", participant: candidate.participant, importance: 5, source: "user_input" }).select("id,created_at").single();
    inserted = result.data; insertError = result.error;
  } else if (candidate.destination === "task") {
    const result = await supabase.from("tasks").insert({ ...common, title: candidate.title, description: candidate.detail, due_at: toTimestamp(candidate.date), timezone: "UTC", priority: 5, source: "user_input" }).select("id,created_at").single();
    inserted = result.data; insertError = result.error;
  } else if (candidate.destination === "reminder") {
    const result = await supabase.from("reminders").insert({ ...common, title: candidate.title, remind_at: toTimestamp(candidate.date), timezone: "UTC" }).select("id,created_at").single();
    inserted = result.data; insertError = result.error;
  } else {
    const result = await supabase.from("interactions").insert({ ...common, type: candidate.title, summary: candidate.detail, occurred_at: toTimestamp(candidate.date) ?? now, timezone: "UTC", source: "user_input" }).select("id,created_at").single();
    inserted = result.data; insertError = result.error;
  }
  if (insertError || !inserted) {
    await supabase.from("memory_sources").delete().eq("id", source.id);
    return NextResponse.json({ error: insertError?.message ?? "Could not save record." }, { status: 500 });
  }
  return NextResponse.json({ item: { ...candidate, id: inserted.id, status: "approved", savedAt: inserted.created_at ?? now } satisfies SavedItem });
}

export async function DELETE(request: Request) {
  const body: unknown = await request.json();
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid record." }, { status: 400 });
  const owned = await ownedClient(parsed.data.relationshipId);
  if ("error" in owned) return owned.error;
  const table = { memory: "memories", calendar: "calendar_events", task: "tasks", reminder: "reminders", interaction: "interactions" } as const;
  const { error } = await owned.supabase.from(table[parsed.data.destination]).delete().eq("id", parsed.data.id).eq("relationship_id", parsed.data.relationshipId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

function toTimestamp(value: string | null) {
  if (!value) return null;
  return value.length === 10 ? `${value}T12:00:00.000Z` : value;
}

function saved(
  id: string,
  destination: SavedItem["destination"],
  title: string,
  detail: string,
  classification: SavedItem["classification"],
  confidence: number,
  date: string | null,
  savedAt: string,
  participant: SavedItem["participant"] = "partner",
): SavedItem {
  return { id, destination, title, detail, classification, confidence, date, participant, sourceText: "", status: "approved", reasoning: "Saved to your private Attune account.", savedAt };
}
