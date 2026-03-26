"use client";

import { useState, useEffect } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useCollection, useDocument } from "@/hooks/useFirestore";

const configKeys = [
  { key: "triage_channel", label: "Triage Channel", type: "text" },
  { key: "emoji_trigger", label: "Emoji Trigger", type: "text" },
  { key: "output_mode", label: "Output Mode", type: "select", options: ["embed", "summary", "both"] },
  { key: "summary_interval", label: "Summary Interval", type: "select", options: ["daily", "weekly"] },
  { key: "feedback_forum", label: "Feedback Forum", type: "text" },
  { key: "acknowledge", label: "Acknowledge Reports", type: "toggle" },
  { key: "level_announce", label: "Level Announcements", type: "toggle" },
];

export default function SettingsPage() {
  const { data: configDocs } = useCollection("config");
  const { data: roleMapping } = useDocument("config", "dashboard_roles");
  const [saving, setSaving] = useState("");
  const [adminRolesInput, setAdminRolesInput] = useState("");
  const [modRolesInput, setModRolesInput] = useState("");

  const configMap: Record<string, any> = {};
  configDocs.forEach((doc: any) => {
    configMap[doc.key || doc.id] = doc.value !== undefined ? doc.value : doc;
  });

  useEffect(() => {
    if (roleMapping) {
      const rm = roleMapping as any;
      setAdminRolesInput((rm.adminRoles || []).join(", "));
      setModRolesInput((rm.modRoles || []).join(", "));
    }
  }, [roleMapping]);

  const updateConfig = async (key: string, value: any) => {
    setSaving(key);
    await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
    setSaving("");
  };

  const saveRoleMapping = async () => {
    setSaving("roles");
    await fetch("/api/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        adminRoles: adminRolesInput.split(",").map((r) => r.trim()).filter(Boolean),
        modRoles: modRolesInput.split(",").map((r) => r.trim()).filter(Boolean),
      }),
    });
    setSaving("");
  };

  return (
    <ProtectedRoute requiredTier="admin">
      <div className="max-w-2xl">
        <h1 className="text-xl font-bold mb-6">Settings</h1>

        <section className="bg-discord-secondary rounded-lg p-4 mb-4">
          <h2 className="text-sm font-semibold mb-3">Bot Configuration</h2>
          <div className="space-y-4">
            {configKeys.map(({ key, label, type, options }) => (
              <div key={key} className="flex items-center justify-between">
                <label className="text-sm text-discord-muted">{label}</label>
                {type === "toggle" ? (
                  <button onClick={() => updateConfig(key, !configMap[key])} disabled={saving === key}
                    className={`w-10 h-5 rounded-full transition-colors relative ${configMap[key] ? "bg-green-500" : "bg-discord-tertiary"}`}>
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${configMap[key] ? "translate-x-5" : "translate-x-0.5"}`} />
                  </button>
                ) : type === "select" ? (
                  <select value={configMap[key] || ""} onChange={(e) => updateConfig(key, e.target.value)} disabled={saving === key}
                    className="bg-discord-tertiary border border-discord-border rounded-md px-2 py-1 text-sm text-discord-text">
                    {options?.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input type="text" value={configMap[key] || ""} onChange={(e) => updateConfig(key, e.target.value)} disabled={saving === key}
                    className="bg-discord-tertiary border border-discord-border rounded-md px-2 py-1 text-sm text-discord-text w-48 focus:outline-none focus:border-discord-accent" />
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="bg-discord-secondary rounded-lg p-4">
          <h2 className="text-sm font-semibold mb-3">Role Mapping</h2>
          <p className="text-xs text-discord-muted mb-4">Discord role IDs, comma separated.</p>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-discord-muted mb-1">Admin Roles</label>
              <input type="text" value={adminRolesInput} onChange={(e) => setAdminRolesInput(e.target.value)} placeholder="Role IDs"
                className="w-full bg-discord-tertiary border border-discord-border rounded-md px-3 py-1.5 text-sm text-discord-text placeholder-discord-muted focus:outline-none focus:border-discord-accent" />
            </div>
            <div>
              <label className="block text-xs text-discord-muted mb-1">Moderator Roles</label>
              <input type="text" value={modRolesInput} onChange={(e) => setModRolesInput(e.target.value)} placeholder="Role IDs"
                className="w-full bg-discord-tertiary border border-discord-border rounded-md px-3 py-1.5 text-sm text-discord-text placeholder-discord-muted focus:outline-none focus:border-discord-accent" />
            </div>
            <button onClick={saveRoleMapping} disabled={saving === "roles"}
              className="bg-discord-accent text-white px-4 py-1.5 rounded-md text-sm disabled:opacity-50">
              {saving === "roles" ? "Saving..." : "Save Role Mapping"}
            </button>
          </div>
        </section>
      </div>
    </ProtectedRoute>
  );
}
