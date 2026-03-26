import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { requireTier } from "@/lib/permissions";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.userId || !requireTier(session.tier, "moderator")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const { text } = await req.json();
  if (!text?.trim()) {
    return NextResponse.json({ error: "Comment text required" }, { status: 400 });
  }

  const doc = await adminDb.collection("issues").doc(id).get();
  if (!doc.exists) {
    return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  }

  const notes = doc.data()?.notes || [];
  notes.push({
    text: text.trim(),
    authorId: session.userId,
    authorName: session.username,
    createdAt: new Date().toISOString(),
  });

  await adminDb.collection("issues").doc(id).update({
    notes,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ ok: true });
}
