import React from "react";

const tones = {
  neutral: { border: "var(--line)", strong: "var(--ink)" },
  risk: { border: "var(--orange)", strong: "var(--ink)", bgTint: "linear-gradient(180deg,#fffaf7 0%,#ffffff 72%)" },
  info: { border: "var(--ura-blue)", strong: "var(--ink)" },
  finance: { border: "var(--green)", strong: "var(--ink)" },
};

/** MetricCard — KPI/insight card. `featured` renders the dark gradient hero treatment; otherwise a top-border tone accent. */
export function MetricCard({ label, value, note, tone = "neutral", featured = false }) {
  const t = tones[tone] || tones.neutral;
  if (featured) {
    return (
      <article
        style={{
          minHeight: 170,
          padding: "20px 22px",
          background: "linear-gradient(135deg,#00334f 0%,#005b7f 100%)",
          color: "#fff",
          borderRadius: 8,
          fontFamily: "var(--font-sans)",
        }}
      >
        <span style={{ display: "block", fontSize: 11, fontWeight: 800, letterSpacing: ".04em", textTransform: "uppercase", color: "rgba(255,255,255,.84)" }}>{label}</span>
        <strong style={{ display: "block", marginTop: 12, fontSize: "clamp(27px,3vw,36px)", letterSpacing: "-.035em", color: "#fff" }}>{value}</strong>
        {note && <small style={{ color: "rgba(255,255,255,.7)", fontSize: 11, fontWeight: 650 }}>{note}</small>}
      </article>
    );
  }
  return (
    <article
      style={{
        minHeight: 170,
        padding: "20px 22px",
        background: "var(--paper)",
        border: "1px solid var(--line)",
        borderTop: `4px solid ${t.border}`,
        borderRadius: 8,
        backgroundImage: t.bgTint,
        fontFamily: "var(--font-sans)",
      }}
    >
      <span style={{ display: "block", fontSize: 11, fontWeight: 800, letterSpacing: ".04em", textTransform: "uppercase", color: "#64757e" }}>{label}</span>
      <strong style={{ display: "block", marginTop: 12, fontSize: "clamp(27px,3vw,36px)", letterSpacing: "-.035em", color: t.strong }}>{value}</strong>
      {note && <small style={{ color: "#788991", fontSize: 11, fontWeight: 650 }}>{note}</small>}
    </article>
  );
}
