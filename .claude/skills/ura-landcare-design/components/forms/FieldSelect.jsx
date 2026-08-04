import React from "react";

/** FieldSelect — labeled pill/rounded select or search input used across sidebar filters. */
export function FieldSelect({ label, children, compact = false, ...rest }) {
  return (
    <label style={{ display: "grid", gap: 6, marginTop: compact ? 8 : 9, fontFamily: "var(--font-sans)" }}>
      <span style={{ color: "var(--muted)", fontSize: 10, fontWeight: 800, textTransform: "uppercase" }}>{label}</span>
      <select
        {...rest}
        style={{
          width: "100%",
          minHeight: 36,
          padding: "0 12px",
          border: "1px solid var(--line)",
          borderRadius: "var(--radius-pill)",
          background: "var(--paper)",
          color: "var(--ink)",
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        {children}
      </select>
    </label>
  );
}

export function FieldInput({ label, ...rest }) {
  return (
    <label style={{ display: "grid", gap: 6, marginTop: 9, fontFamily: "var(--font-sans)" }}>
      <span style={{ color: "var(--muted)", fontSize: 10, fontWeight: 800, textTransform: "uppercase" }}>{label}</span>
      <input
        {...rest}
        style={{
          width: "100%",
          minHeight: 36,
          padding: "0 12px",
          border: "1px solid var(--line)",
          borderRadius: "var(--radius-pill)",
          background: "var(--paper)",
          color: "var(--ink)",
          fontSize: 12,
          fontWeight: 700,
        }}
      />
    </label>
  );
}
