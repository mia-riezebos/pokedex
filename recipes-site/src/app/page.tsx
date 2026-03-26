"use client";

import { useState, useEffect, useMemo } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
} from "firebase/firestore";
import RecipeCard from "@/components/RecipeCard";

interface Sharer {
  name: string;
  sharedAt?: string;
}

interface Recipe {
  id: string;
  title: string;
  url: string;
  source?: string;
  referCode?: string;
  description?: string;
  tags?: string[];
  shareCount?: number;
  sharedBy?: Sharer[];
  status?: string;
}

export default function RecipesPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [activeSource, setActiveSource] = useState<string | null>(null);

  // Real-time Firestore listener
  useEffect(() => {
    const q = query(
      collection(db, "recipes"),
      where("status", "==", "approved"),
      orderBy("shareCount", "desc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as Recipe[];
        setRecipes(docs);
        setLoading(false);
      },
      (err) => {
        console.error("Firestore error:", err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Stats
  const stats = useMemo(() => {
    const sources = new Set(recipes.map((r) => r.source).filter(Boolean));
    const contributors = new Set<string>();
    recipes.forEach((r) =>
      (r.sharedBy || []).forEach((s) => contributors.add(s.name))
    );
    const tags = new Set<string>();
    recipes.forEach((r) => (r.tags || []).forEach((t) => tags.add(t)));
    return {
      total: recipes.length,
      sources: sources.size,
      contributors: contributors.size,
      tags: tags.size,
    };
  }, [recipes]);

  // Filter chips data
  const { tagCounts, sourceCounts } = useMemo(() => {
    const tc: Record<string, number> = {};
    const sc: Record<string, number> = {};
    recipes.forEach((r) => {
      if (r.source) sc[r.source] = (sc[r.source] || 0) + 1;
      (r.tags || []).forEach((t) => {
        tc[t] = (tc[t] || 0) + 1;
      });
    });
    return { tagCounts: tc, sourceCounts: sc };
  }, [recipes]);

  // Filtered results
  const filtered = useMemo(() => {
    let result = recipes;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (r) =>
          (r.title || "").toLowerCase().includes(q) ||
          (r.description || "").toLowerCase().includes(q) ||
          (r.source || "").toLowerCase().includes(q) ||
          (r.referCode || "").toLowerCase().includes(q) ||
          (r.tags || []).some((t) => t.includes(q))
      );
    }
    if (activeTag) result = result.filter((r) => (r.tags || []).includes(activeTag));
    if (activeSource) result = result.filter((r) => r.source === activeSource);
    return result;
  }, [recipes, search, activeTag, activeSource]);

  const sortedSources = Object.entries(sourceCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  const sortedTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      {/* Header */}
      <header className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-gold to-gold-soft bg-clip-text text-transparent">
          Community Recipes
        </h1>
        <p className="text-gray-400 mt-2 text-sm sm:text-base">
          Shared by the community in #show-and-tell
        </p>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        {[
          { label: "Recipes", value: stats.total, icon: "\uD83C\uDF73" },
          { label: "Sources", value: stats.sources, icon: "\uD83C\uDF10" },
          { label: "Contributors", value: stats.contributors, icon: "\uD83D\uDC65" },
          { label: "Tags", value: stats.tags, icon: "\uD83C\uDFF7\uFE0F" },
        ].map((s) => (
          <div key={s.label} className="glass rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-gold">
              {loading ? "..." : s.value}
            </div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mt-1">
              {s.icon} {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="mb-5">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, tag, source, or code..."
          className="w-full glass rounded-xl px-4 py-3 text-sm text-gray-100 placeholder:text-gray-600 focus:outline-none focus:ring-1 focus:ring-gold/50 transition-all"
        />
      </div>

      {/* Filter chips */}
      {(sortedSources.length > 0 || sortedTags.length > 0) && (
        <div className="flex gap-2 flex-wrap mb-6">
          {(activeTag || activeSource) && (
            <button
              onClick={() => { setActiveTag(null); setActiveSource(null); }}
              className="text-[11px] px-3 py-1.5 rounded-full border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
            >
              Clear
            </button>
          )}

          {sortedSources.map(([source, count]) => (
            <button
              key={`s-${source}`}
              onClick={() => { setActiveSource(activeSource === source ? null : source); setActiveTag(null); }}
              className={`text-[11px] px-3 py-1.5 rounded-full border transition-colors ${
                activeSource === source
                  ? "border-gold/50 bg-gold-glow text-gold"
                  : "border-border bg-bg-card text-gray-500 hover:text-gray-300 hover:bg-bg-hover"
              }`}
            >
              {source} ({count})
            </button>
          ))}

          {sortedTags.map(([tag, count]) => (
            <button
              key={`t-${tag}`}
              onClick={() => { setActiveTag(activeTag === tag ? null : tag); setActiveSource(null); }}
              className={`text-[11px] px-3 py-1.5 rounded-full border transition-colors ${
                activeTag === tag
                  ? "border-accent/50 bg-accent/10 text-accent"
                  : "border-border bg-bg-card text-gray-500 hover:text-gray-300 hover:bg-bg-hover"
              }`}
            >
              #{tag} ({count})
            </button>
          ))}
        </div>
      )}

      {/* Recipe grid */}
      {loading ? (
        <div className="text-center py-20">
          <div className="w-10 h-10 border-2 border-border border-t-gold rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 text-sm">Loading recipes...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-xl text-gray-300 mb-2">
            {recipes.length === 0 ? "No recipes yet" : "No matches"}
          </p>
          <p className="text-sm text-gray-600">
            {recipes.length === 0
              ? "Use /recipes scrape in Discord to import from #show-and-tell"
              : "Try a different search or filter"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((r) => (
            <RecipeCard key={r.id} recipe={r} />
          ))}
        </div>
      )}

      {/* Footer */}
      {!loading && filtered.length > 0 && (
        <p className="text-xs text-gray-600 text-center mt-8">
          Showing {filtered.length} of {recipes.length} recipes
        </p>
      )}

      <footer className="text-center mt-12 pb-8">
        <p className="text-xs text-gray-700">
          Powered by <span className="text-gold/60">Pokedex</span> — recipes shared by the community
        </p>
      </footer>
    </div>
  );
}
