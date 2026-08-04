import React from "react";

const tones = {
  submitted: { color: "#135e27", background: "#ddf2e2" },
  open: { color: "#47545b", background: "#ebeff1" },
  risk: { color: "var(--orange)", background: "var(--orange-soft)" },
  success: { color: "var(--green)", background: "var(--green-soft)" },
  info: { color: "var(--ura-deep)", background: "var(--ura-blue-soft)" },
};

/** StatusPill — small rounded status label. Never used as the sole status signal; always paired with text. */
export function StatusPill({ tone = "info", children }) {
  const t = tones[tone] || tones.info;
  return (
    <span
      style={{
        display: "inline-flex",
        padding: "4px 8px",
        borderRadius: 999,
        fontFamily: "var(--font-sans)",
        fontSize: 11,
        fontWeight: 850,
        letterSpacing: ".02em",
        color: t.color,
        background: t.background,
      }}
    >
      {children}
    </span>
  );
}
