import React from "react";

/** Tabs — pill report-section tabs (KPI dashboard) or underline workspace tabs (contractor portal). */
export function Tabs({ items, activeId, onChange, variant = "pill" }) {
  if (variant === "underline") {
    return (
      <nav role="tablist" style={{ display: "flex", gap: 8, overflowX: "auto", borderBottom: "1px solid var(--line)" }}>
        {items.map((it) => {
          const isActive = it.id === activeId;
          return (
            <button
              key={it.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange && onChange(it.id)}
              style={{
                minHeight: 40,
                padding: "0 14px",
                fontFamily: "var(--font-sans)",
                fontSize: 12,
                fontWeight: 750,
                color: isActive ? "var(--ura-deep)" : "var(--muted)",
                background: "transparent",
                border: 0,
                borderBottom: isActive ? "3px solid var(--ura-blue)" : "3px solid transparent",
                cursor: "pointer",
              }}
            >
              {it.label}
            </button>
          );
        })}
      </nav>
    );
  }
  return (
    <nav role="tablist" style={{ display: "flex", gap: 8, overflowX: "auto", padding: 4, background: "var(--paper)", border: "1px solid var(--line)", borderRadius: "var(--radius-pill)" }}>
      {items.map((it) => {
        const isActive = it.id === activeId;
        return (
          <button
            key={it.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange && onChange(it.id)}
            style={{
              flex: "0 0 auto",
              minHeight: 36,
              padding: "0 16px",
              fontFamily: "var(--font-sans)",
              fontSize: 13,
              fontWeight: 700,
              color: isActive ? "var(--ura-deep)" : "var(--muted)",
              background: isActive ? "var(--ura-blue-soft)" : "transparent",
              boxShadow: isActive ? "inset 0 0 0 1px var(--ura-blue-muted)" : "none",
              border: 0,
              borderRadius: "var(--radius-pill)",
              cursor: "pointer",
            }}
          >
            {it.label}
          </button>
        );
      })}
    </nav>
  );
}
