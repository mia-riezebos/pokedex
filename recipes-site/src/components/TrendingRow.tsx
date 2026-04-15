"use client";

import { countRecentShares } from "@/lib/trending";
import { getSourceColor } from "@/lib/sourceColors";

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
          const sourceColor = getSourceColor(recipe.source);
          const recent = countRecentShares(recipe.sharedBy);

          return (
            <a
              key={recipe.id}
              href={recipe.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative block rounded-xl p-5 border border-gold/25 bg-gradient-to-br from-gold/[0.08] via-white/[0.03] to-transparent hover:border-gold/50 motion-safe:hover:-translate-y-1 motion-safe:hover:shadow-[0_20px_40px_-15px_rgba(240,200,64,0.25)] transition-all duration-300 overflow-hidden fade-up"
              style={{ animationDelay: `${i * 80}ms` }}
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
