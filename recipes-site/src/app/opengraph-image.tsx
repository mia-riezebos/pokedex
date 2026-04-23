import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Pokedex — AI-assisted Discord triage, moderation & community tools";

export default function OpengraphImage() {
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

        <div
          style={{
            color: "#f0c840",
            fontSize: 24,
            letterSpacing: 4,
            textTransform: "uppercase",
            fontWeight: 600,
            marginBottom: 24,
            zIndex: 1,
          }}
        >
          POKEDEX
        </div>

        <div
          style={{
            fontSize: 96,
            fontWeight: 800,
            color: "#f0c840",
            letterSpacing: -2,
            lineHeight: 1,
            marginBottom: 24,
            textAlign: "center",
            zIndex: 1,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <span>Run your Discord</span>
          <span>on autopilot.</span>
        </div>

        <div
          style={{
            fontSize: 28,
            color: "rgba(255,255,255,0.7)",
            zIndex: 1,
            textAlign: "center",
            maxWidth: 900,
          }}
        >
          AI triage · AutoMod · Moderation · Community tools
        </div>

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
