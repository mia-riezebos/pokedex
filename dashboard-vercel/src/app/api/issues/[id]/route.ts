import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { requireTier } from "@/lib/permissions";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.userId || !requireTier(session.tier, "moderator")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const updates = await req.json();

  const allowed = ["status", "priority", "assigneeId", "assigneeName"];
  const filtered: any = {};
  for (const key of allowed) {
    if (key in updates) filtered[key] = updates[key];
  }
  filtered.updatedAt = FieldValue.serverTimestamp();

  if (updates.status === "closed") {
    filtered.closedBy = session.username;
    filtered.closedAt = FieldValue.serverTimestamp();
  }
  if (updates.assigneeId) {
    filtered.assignedBy = session.username;
    filtered.assignedAt = FieldValue.serverTimestamp();
  }

  await adminDb.collection("issues").doc(id).update(filtered);
  return NextResponse.json({ ok: true });
}
