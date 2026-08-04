import React from "react";

/** Legend — map-key list of colored dot swatches with labels and optional counts. */
export function Legend({ items, title }) {
  return (
    <div style={{ display: "grid", gap: 7, fontFamily: "var(--font-sans)" }}>
      {title && <span style={{ color: "var(--ura-deep)", fontSize: 10, fontWeight: 800, letterSpacing: ".05em", textTransform: "uppercase" }}>{title}</span>}
      {items.map((it, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "12px minmax(0,1fr) auto", gap: 8, alignItems: "center" }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, border: "1px solid rgba(17,24,32,.55)", background: it.color }} />
          <strong style={{ fontSize: 12, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.label}</strong>
          {it.count != null && <span style={{ color: "var(--ink)", fontSize: 11, fontWeight: 800 }}>{it.count}</span>}
        </div>
      ))}
    </div>
  );
}
