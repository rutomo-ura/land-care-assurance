import React from "react";

const base = {
  fontFamily: "var(--font-sans)",
  fontWeight: 800,
  cursor: "pointer",
  border: "0",
  transition: "background .15s ease, color .15s ease, border-color .15s ease",
  whiteSpace: "nowrap",
};

const variants = {
  solid: {
    minHeight: 34,
    padding: "0 16px",
    fontSize: 12,
    color: "#fff",
    background: "var(--ura-blue-dark)",
    border: "1px solid var(--ura-blue-dark)",
    borderRadius: 7,
  },
  pill: {
    minHeight: 36,
    padding: "0 17px",
    fontSize: 12,
    color: "#fff",
    background: "transparent",
    border: "2px solid rgba(255,255,255,.55)",
    borderRadius: "var(--radius-pill)",
  },
  segmented: {
    minHeight: 31,
    padding: "0 12px",
    fontSize: 11,
    color: "var(--ink)",
    background: "#fff",
    border: "2px solid var(--ura-blue-dark)",
  },
  text: {
    minHeight: 24,
    padding: 0,
    fontSize: 12,
    color: "var(--ura-blue)",
    background: "transparent",
  },
};

/** Button — LandCare's four button treatments: solid action, pill nav/tab, segmented toggle, and text link. */
export function Button({ variant = "solid", active = false, disabled = false, children, style, ...rest }) {
  const v = variants[variant] || variants.solid;
  const activeStyle =
    active && variant === "pill"
      ? { color: "var(--ura-deep)", background: "#fff" }
      : active && variant === "segmented"
      ? { color: "#fff", background: "var(--ura-blue-dark)" }
      : {};
  return (
    <button
      type="button"
      disabled={disabled}
      style={{
        ...base,
        ...v,
        ...activeStyle,
        opacity: disabled ? 0.64 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
