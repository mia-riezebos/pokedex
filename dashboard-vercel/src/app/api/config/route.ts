import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { requireTier } from "@/lib/permissions";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.userId || !requireTier(session.tier, "admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { key, value } = await req.json();
  if (!key) return NextResponse.json({ error: "key required" }, { status: 400 });

  if (value === null || value === undefined) {
    await adminDb.collection("config").doc(key).delete();
  } else {
    await adminDb.collection("config").doc(key).set({
      key,
      value,
      updatedBy: session.userId,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  return NextResponse.json({ ok: true });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session.userId || !requireTier(session.tier, "admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { adminRoles, modRoles } = await req.json();

  await adminDb.collection("config").doc("dashboard_roles").set({
    adminRoles: adminRoles || [],
    modRoles: modRoles || [],
  });

  return NextResponse.json({ ok: true });
}
