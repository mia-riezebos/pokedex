"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useDocument } from "@/hooks/useFirestore";

const statusOptions = ["open", "acknowledged", "in-progress", "closed", "wontfix"];
const priorityOptions = ["critical", "high", "medium", "low"];

export default function IssueDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: issue, loading } = useDocument("issues", id);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  const updateIssue = async (updates: Record<string, string>) => {
    setSaving(true);
    await fetch(`/api/issues/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    setSaving(false);
  };

  const addComment = async () => {
    if (!comment.trim()) return;
    setSaving(true);
    await fetch(`/api/issues/${id}/comment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: comment }),
    });
    setComment("");
    setSaving(false);
  };

  if (loading) return <div className="animate-pulse h-64 bg-discord-secondary rounded-lg" />;
  if (!issue) return <p className="text-discord-muted">Issue not found</p>;

  const d = issue as any;

  return (
    <ProtectedRoute requiredTier="moderator">
      <div className="max-w-3xl">
        <button onClick={() => router.back()} className="text-sm text-discord-muted hover:text-discord-text mb-4">
          &larr; Back
        </button>

        <div className="bg-discord-secondary rounded-lg p-6 mb-4">
          <h1 className="text-lg font-bold mb-2">{d.summary || d.text?.slice(0, 100) || "Untitled"}</h1>
          <p className="text-sm text-discord-muted mb-4">{d.text}</p>

          <div className="flex gap-4 mb-4">
            <div>
              <label className="block text-xs text-discord-muted mb-1">Status</label>
              <select value={d.status || "open"} onChange={(e) => updateIssue({ status: e.target.value })} disabled={saving}
                className="bg-discord-tertiary border border-discord-border rounded-md px-2 py-1 text-sm text-discord-text">
                {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-discord-muted mb-1">Priority</label>
              <select value={d.priority || ""} onChange={(e) => updateIssue({ priority: e.target.value })} disabled={saving}
                className="bg-discord-tertiary border border-discord-border rounded-md px-2 py-1 text-sm text-discord-text">
                <option value="">Unclassified</option>
                {priorityOptions.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><span className="text-discord-muted">Reporter:</span> <span>{d.reporterName || "Unknown"}</span></div>
            <div><span className="text-discord-muted">Category:</span> <span>{d.category || "None"}</span></div>
            <div><span className="text-discord-muted">Assignee:</span> <span>{d.assigneeName || "Unassigned"}</span></div>
            <div><span className="text-discord-muted">Created:</span> <span>{d.createdAt?.seconds ? new Date(d.createdAt.seconds * 1000).toLocaleString() : "Unknown"}</span></div>
          </div>
        </div>

        {d.threadContext?.length > 0 && (
          <div className="bg-discord-secondary rounded-lg p-4 mb-4">
            <h2 className="text-sm font-semibold mb-3">Context</h2>
            <div className="space-y-2">
              {d.threadContext.map((ctx: any, i: number) => (
                <div key={i} className="text-sm text-discord-muted bg-discord-tertiary rounded p-2">{ctx.text}</div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-discord-secondary rounded-lg p-4">
          <h2 className="text-sm font-semibold mb-3">Comments</h2>
          <div className="space-y-3 mb-4">
            {(d.notes || []).map((note: any, i: number) => (
              <div key={i} className="bg-discord-tertiary rounded-lg p-3">
                <div className="flex justify-between mb-1">
                  <span className="text-xs font-medium">{note.authorName}</span>
                  <span className="text-xs text-discord-muted">{note.createdAt ? new Date(note.createdAt).toLocaleString() : ""}</span>
                </div>
                <p className="text-sm text-discord-muted">{note.text}</p>
              </div>
            ))}
            {(!d.notes || d.notes.length === 0) && <p className="text-xs text-discord-muted">No comments yet</p>}
          </div>
          <div className="flex gap-2">
            <input type="text" value={comment} onChange={(e) => setComment(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addComment()}
              placeholder="Add a comment..." className="flex-1 bg-discord-tertiary border border-discord-border rounded-md px-3 py-2 text-sm text-discord-text placeholder-discord-muted focus:outline-none focus:border-discord-accent" />
            <button onClick={addComment} disabled={saving || !comment.trim()} className="bg-discord-accent text-white px-4 py-2 rounded-md text-sm disabled:opacity-50">Send</button>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
