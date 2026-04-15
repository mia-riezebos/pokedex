import { ImageResponse } from "next/og";
import { serverDb } from "@/lib/firebase-server";
import { collection, getDocs, query, where } from "firebase/firestore";

export const runtime = "nodejs";
export const revalidate = 300; // regenerate at most every 5 min
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Community Recipes — shared by the Pokedex community";

interface Stats {
  total: number;
  contributors: number;
}

async function fetchStats(): Promise<Stats> {
  try {
    const q = query(collection(serverDb, "recipes"), where("status", "==", "approved"));
    const snap = await getDocs(q);
    const contributors = new Set<string>();
    snap.docs.forEach((d) => {
      const data = d.data() as { sharedBy?: Array<{ name?: string }> };
      (data.sharedBy ?? []).forEach((s) => {
        if (s.name) contributors.add(s.name);
      });
    });
    return { total: snap.size, contributors: contributors.size };
  } catch {
    return { total: 0, contributors: 0 };
  }
}

export default async function OpengraphImage() {
  const stats = await fetchStats();
  const hasRecipes = stats.total > 0;

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          background: "#0a0e17",
          position: "relative",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Ambient gold orb */}
        <div
          style={{
            position: "absolute",
            width: 700,
            height: 700,
            top: -200,
            left: -150,
            background: "radial-gradient(circle, rgba(240,200,64,0.25), transparent 70%)",
            filter: "blur(40px)",
            display: "flex",
          }}
        />
        {/* Ambient indigo orb */}
        <div
          style={{
            position: "absolute",
            width: 500,
            height: 500,
            bottom: -100,
            right: -80,
            background: "radial-gradient(circle, rgba(99,102,241,0.2), transparent 70%)",
            filter: "blur(40px)",
            display: "flex",
          }}
        />

        {/* Eyebrow */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            color: "#f0c840",
            fontSize: 24,
            letterSpacing: 4,
            textTransform: "uppercase",
            fontWeight: 600,
            marginBottom: 24,
            zIndex: 1,
          }}
        >
          <span>POKEDEX</span>
          <span style={{ color: "rgba(255,255,255,0.3)" }}>·</span>
          <span style={{ color: "rgba(255,255,255,0.6)" }}>Community Hub</span>
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: 110,
            fontWeight: 800,
            color: "#f0c840",
            letterSpacing: -2,
            lineHeight: 1,
            marginBottom: 36,
            zIndex: 1,
          }}
        >
          Community Recipes
        </div>

        {/* Subtitle with live stats */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 28,
            fontSize: 32,
            color: "rgba(255,255,255,0.8)",
            zIndex: 1,
          }}
        >
          {hasRecipes ? (
            <>
              <span>
                <span style={{ color: "#f0c840", fontWeight: 700 }}>{stats.total}</span> recipes
              </span>
              <span style={{ color: "rgba(255,255,255,0.2)" }}>·</span>
              <span>
                <span style={{ color: "#f0c840", fontWeight: 700 }}>{stats.contributors}</span>{" "}
                contributors
              </span>
              <span style={{ color: "rgba(255,255,255,0.2)" }}>·</span>
              <span>Updated live</span>
            </>
          ) : (
            <span>Browse the latest builds shared by the community</span>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            position: "absolute",
            bottom: 48,
            left: 48,
            display: "flex",
            alignItems: "center",
            gap: 16,
            color: "rgba(255,255,255,0.35)",
            fontSize: 22,
            zIndex: 1,
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              background: "#f0c840",
              display: "flex",
            }}
          />
          <span>Pokedex · Community Hub</span>
        </div>

        {/* Gold accent bar */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 6,
            background: "linear-gradient(90deg, transparent, #f0c840, transparent)",
            display: "flex",
          }}
        />
      </div>
    ),
    { ...size }
  );
}
