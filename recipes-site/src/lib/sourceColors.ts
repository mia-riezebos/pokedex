export const sourceColors: Record<string, string> = {
  Poke: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  Pokepaste: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  Showdown: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  Smogon: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  YouTube: "bg-red-500/10 text-red-400 border-red-500/20",
  Reddit: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  Pikalytics: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  Limitless: "bg-green-500/10 text-green-400 border-green-500/20",
};

export const defaultSourceColor =
  "bg-indigo-500/10 text-indigo-400 border-indigo-500/20";

export function getSourceColor(source?: string): string {
  if (!source) return defaultSourceColor;
  return sourceColors[source] ?? defaultSourceColor;
}
