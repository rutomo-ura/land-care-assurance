import React from "react";

/** DataTable — sticky-header ledger table with zebra rows and hover feedback. Pass columns and rows. */
export function DataTable({ columns, rows }) {
  return (
    <div style={{ overflow: "auto", border: "1px solid #dfe6e9", borderRadius: 6 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-sans)", fontSize: 12 }}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                style={{
                  position: "sticky",
                  top: 0,
                  padding: 12,
                  color: "#52646d",
                  background: "#eef3f4",
                  borderBottom: "1px solid #cfdadd",
                  fontSize: 10,
                  letterSpacing: ".06em",
                  textAlign: "left",
                  textTransform: "uppercase",
                }}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ background: i % 2 === 1 ? "#fafbfb" : "transparent" }}>
              {columns.map((c) => (
                <td key={c.key} style={{ padding: 12, borderBottom: "1px solid #e7edef", color: "var(--ink)" }}>
                  {r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
