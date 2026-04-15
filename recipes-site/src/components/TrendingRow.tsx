"use client";

import { countRecentShares } from "@/lib/trending";

interface Sharer {
  id?: string;
  name: string;
  sharedAt?: string;
}

interface Recipe {
  id: string;
  title: string;
  url: string;
  source?: string;
  sharedBy?: Sharer[];
}

const sourceColors: Record<string, string> = {
  Poke: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  Pokepaste: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  Showdown: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  Smogon: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  YouTube: "bg-red-500/10 text-red-400 border-red-500/20",
  Reddit: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  Pikalytics: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  Limitless: "bg-green-500/10 text-green-400 border-green-500/20",
};

export default function TrendingRow({ recipes }: { recipes: Recipe[] }) {
  if (recipes.length < 2) return null;

  return (
    <section className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/25">
          🔥 Trending this week
        </span>
        <span className="text-[11px] text-gray-600">
          by shares in the last 7 days
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {recipes.map((recipe, i) => {
          const sourceColor =
            sourceColors[recipe.source || ""] ||
            "bg-indigo-500/10 text-indigo-400 border-indigo-500/20";
          const recent = countRecentShares(recipe.sharedBy);

          return (
            <a
              key={recipe.id}
              href={recipe.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative block rounded-xl p-5 border border-gold/25 bg-gradient-to-br from-gold/[0.08] via-white/[0.03] to-transparent hover:border-gold/40 hover:-translate-y-0.5 transition-all duration-200 overflow-hidden"
            >
              <span className="absolute top-3 right-4 text-2xl font-black text-gold/20 select-none pointer-events-none">
                {i + 1}
              </span>

              <h3 className="text-base font-semibold text-gray-100 pr-10 line-clamp-2 group-hover:text-gold transition-colors">
                {recipe.title || "Untitled Recipe"}
              </h3>

              <div className="flex items-center gap-2 mt-3 flex-wrap">
                {recipe.source && (
                  <span
                    className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${sourceColor}`}
                  >
                    {recipe.source}
                  </span>
                )}
                <span className="text-[10px] font-semibold text-red-400">
                  🔥 +{recent} this week
                </span>
              </div>
            </a>
          );
        })}
      </div>
    </section>
  );
}
