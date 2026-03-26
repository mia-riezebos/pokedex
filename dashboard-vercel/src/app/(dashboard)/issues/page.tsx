"use client";

import { useState } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import IssueCard from "@/components/IssueCard";
import { useCollection } from "@/hooks/useFirestore";

export default function IssuesPage() {
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");

  const { data: issues, loading } = useCollection("issues", {
    orderBy: ["createdAt", "desc"] as [string, "asc" | "desc"],
    limit: 100,
  });

  const filtered = issues.filter((issue: any) => {
    if (statusFilter && issue.status !== statusFilter) return false;
    if (priorityFilter && issue.priority !== priorityFilter) return false;
    return true;
  });

  return (
    <ProtectedRoute requiredTier="moderator">
      <div>
        <h1 className="text-xl font-bold mb-6">Issues</h1>

        <div className="flex gap-2 mb-4 flex-wrap">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-discord-tertiary border border-discord-border rounded-md px-3 py-1.5 text-sm text-discord-text"
          >
            <option value="">All Status</option>
            <option value="open">Open</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="in-progress">In Progress</option>
            <option value="closed">Closed</option>
            <option value="wontfix">Won&apos;t Fix</option>
          </select>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="bg-discord-tertiary border border-discord-border rounded-md px-3 py-1.5 text-sm text-discord-text"
          >
            <option value="">All Priority</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse h-16 bg-discord-secondary rounded-lg" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-discord-muted text-sm">No issues found</p>
        ) : (
          <div className="space-y-2">
            {filtered.map((issue: any) => (
              <IssueCard key={issue.id} issue={issue} />
            ))}
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
