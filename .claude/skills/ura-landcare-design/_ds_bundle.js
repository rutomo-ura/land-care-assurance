/* @ds-bundle: {"format":4,"namespace":"URALandCareDesignSystem_d38a66","components":[{"name":"Button","sourcePath":"components/buttons/Button.jsx"},{"name":"MetricCard","sourcePath":"components/cards/MetricCard.jsx"},{"name":"DataTable","sourcePath":"components/data/DataTable.jsx"},{"name":"StatusPill","sourcePath":"components/feedback/StatusPill.jsx"},{"name":"FieldSelect","sourcePath":"components/forms/FieldSelect.jsx"},{"name":"FieldInput","sourcePath":"components/forms/FieldSelect.jsx"},{"name":"Legend","sourcePath":"components/navigation/Legend.jsx"},{"name":"Tabs","sourcePath":"components/navigation/Tabs.jsx"}],"sourceHashes":{"components/buttons/Button.jsx":"8fdf65b39259","components/cards/MetricCard.jsx":"075c94a7505c","components/data/DataTable.jsx":"d6b193a142d4","components/feedback/StatusPill.jsx":"a7cd41960877","components/forms/FieldSelect.jsx":"f36c48360bc7","components/navigation/Legend.jsx":"ab354eba7844","components/navigation/Tabs.jsx":"aa80396e3296"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.URALandCareDesignSystem_d38a66 = window.URALandCareDesignSystem_d38a66 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/buttons/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const base = {
  fontFamily: "var(--font-sans)",
  fontWeight: 800,
  cursor: "pointer",
  border: "0",
  transition: "background .15s ease, color .15s ease, border-color .15s ease",
  whiteSpace: "nowrap"
};
const variants = {
  solid: {
    minHeight: 34,
    padding: "0 16px",
    fontSize: 12,
    color: "#fff",
    background: "var(--ura-blue-dark)",
    border: "1px solid var(--ura-blue-dark)",
    borderRadius: 7
  },
  pill: {
    minHeight: 36,
    padding: "0 17px",
    fontSize: 12,
    color: "#fff",
    background: "transparent",
    border: "2px solid rgba(255,255,255,.55)",
    borderRadius: "var(--radius-pill)"
  },
  segmented: {
    minHeight: 31,
    padding: "0 12px",
    fontSize: 11,
    color: "var(--ink)",
    background: "#fff",
    border: "2px solid var(--ura-blue-dark)"
  },
  text: {
    minHeight: 24,
    padding: 0,
    fontSize: 12,
    color: "var(--ura-blue)",
    background: "transparent"
  }
};

/** Button — LandCare's four button treatments: solid action, pill nav/tab, segmented toggle, and text link. */
function Button({
  variant = "solid",
  active = false,
  disabled = false,
  children,
  style,
  ...rest
}) {
  const v = variants[variant] || variants.solid;
  const activeStyle = active && variant === "pill" ? {
    color: "var(--ura-deep)",
    background: "#fff"
  } : active && variant === "segmented" ? {
    color: "#fff",
    background: "var(--ura-blue-dark)"
  } : {};
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    disabled: disabled,
    style: {
      ...base,
      ...v,
      ...activeStyle,
      opacity: disabled ? 0.64 : 1,
      cursor: disabled ? "not-allowed" : "pointer",
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/buttons/Button.jsx", error: String((e && e.message) || e) }); }

// components/cards/MetricCard.jsx
try { (() => {
const tones = {
  neutral: {
    border: "var(--line)",
    strong: "var(--ink)"
  },
  risk: {
    border: "var(--orange)",
    strong: "var(--ink)",
    bgTint: "linear-gradient(180deg,#fffaf7 0%,#ffffff 72%)"
  },
  info: {
    border: "var(--ura-blue)",
    strong: "var(--ink)"
  },
  finance: {
    border: "var(--green)",
    strong: "var(--ink)"
  }
};

/** MetricCard — KPI/insight card. `featured` renders the dark gradient hero treatment; otherwise a top-border tone accent. */
function MetricCard({
  label,
  value,
  note,
  tone = "neutral",
  featured = false
}) {
  const t = tones[tone] || tones.neutral;
  if (featured) {
    return /*#__PURE__*/React.createElement("article", {
      style: {
        minHeight: 170,
        padding: "20px 22px",
        background: "linear-gradient(135deg,#00334f 0%,#005b7f 100%)",
        color: "#fff",
        borderRadius: 8,
        fontFamily: "var(--font-sans)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: "block",
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: ".04em",
        textTransform: "uppercase",
        color: "rgba(255,255,255,.84)"
      }
    }, label), /*#__PURE__*/React.createElement("strong", {
      style: {
        display: "block",
        marginTop: 12,
        fontSize: "clamp(27px,3vw,36px)",
        letterSpacing: "-.035em",
        color: "#fff"
      }
    }, value), note && /*#__PURE__*/React.createElement("small", {
      style: {
        color: "rgba(255,255,255,.7)",
        fontSize: 11,
        fontWeight: 650
      }
    }, note));
  }
  return /*#__PURE__*/React.createElement("article", {
    style: {
      minHeight: 170,
      padding: "20px 22px",
      background: "var(--paper)",
      border: "1px solid var(--line)",
      borderTop: `4px solid ${t.border}`,
      borderRadius: 8,
      backgroundImage: t.bgTint,
      fontFamily: "var(--font-sans)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "block",
      fontSize: 11,
      fontWeight: 800,
      letterSpacing: ".04em",
      textTransform: "uppercase",
      color: "#64757e"
    }
  }, label), /*#__PURE__*/React.createElement("strong", {
    style: {
      display: "block",
      marginTop: 12,
      fontSize: "clamp(27px,3vw,36px)",
      letterSpacing: "-.035em",
      color: t.strong
    }
  }, value), note && /*#__PURE__*/React.createElement("small", {
    style: {
      color: "#788991",
      fontSize: 11,
      fontWeight: 650
    }
  }, note));
}
Object.assign(__ds_scope, { MetricCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/cards/MetricCard.jsx", error: String((e && e.message) || e) }); }

// components/data/DataTable.jsx
try { (() => {
/** DataTable — sticky-header ledger table with zebra rows and hover feedback. Pass columns and rows. */
function DataTable({
  columns,
  rows
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      overflow: "auto",
      border: "1px solid #dfe6e9",
      borderRadius: 6
    }
  }, /*#__PURE__*/React.createElement("table", {
    style: {
      width: "100%",
      borderCollapse: "collapse",
      fontFamily: "var(--font-sans)",
      fontSize: 12
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, columns.map(c => /*#__PURE__*/React.createElement("th", {
    key: c.key,
    style: {
      position: "sticky",
      top: 0,
      padding: 12,
      color: "#52646d",
      background: "#eef3f4",
      borderBottom: "1px solid #cfdadd",
      fontSize: 10,
      letterSpacing: ".06em",
      textAlign: "left",
      textTransform: "uppercase"
    }
  }, c.label)))), /*#__PURE__*/React.createElement("tbody", null, rows.map((r, i) => /*#__PURE__*/React.createElement("tr", {
    key: i,
    style: {
      background: i % 2 === 1 ? "#fafbfb" : "transparent"
    }
  }, columns.map(c => /*#__PURE__*/React.createElement("td", {
    key: c.key,
    style: {
      padding: 12,
      borderBottom: "1px solid #e7edef",
      color: "var(--ink)"
    }
  }, r[c.key])))))));
}
Object.assign(__ds_scope, { DataTable });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/DataTable.jsx", error: String((e && e.message) || e) }); }

// components/feedback/StatusPill.jsx
try { (() => {
const tones = {
  submitted: {
    color: "#135e27",
    background: "#ddf2e2"
  },
  open: {
    color: "#47545b",
    background: "#ebeff1"
  },
  risk: {
    color: "var(--orange)",
    background: "var(--orange-soft)"
  },
  success: {
    color: "var(--green)",
    background: "var(--green-soft)"
  },
  info: {
    color: "var(--ura-deep)",
    background: "var(--ura-blue-soft)"
  }
};

/** StatusPill — small rounded status label. Never used as the sole status signal; always paired with text. */
function StatusPill({
  tone = "info",
  children
}) {
  const t = tones[tone] || tones.info;
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      padding: "4px 8px",
      borderRadius: 999,
      fontFamily: "var(--font-sans)",
      fontSize: 11,
      fontWeight: 850,
      letterSpacing: ".02em",
      color: t.color,
      background: t.background
    }
  }, children);
}
Object.assign(__ds_scope, { StatusPill });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/StatusPill.jsx", error: String((e && e.message) || e) }); }

// components/forms/FieldSelect.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** FieldSelect — labeled pill/rounded select or search input used across sidebar filters. */
function FieldSelect({
  label,
  children,
  compact = false,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: "grid",
      gap: 6,
      marginTop: compact ? 8 : 9,
      fontFamily: "var(--font-sans)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--muted)",
      fontSize: 10,
      fontWeight: 800,
      textTransform: "uppercase"
    }
  }, label), /*#__PURE__*/React.createElement("select", _extends({}, rest, {
    style: {
      width: "100%",
      minHeight: 36,
      padding: "0 12px",
      border: "1px solid var(--line)",
      borderRadius: "var(--radius-pill)",
      background: "var(--paper)",
      color: "var(--ink)",
      fontSize: 12,
      fontWeight: 700
    }
  }), children));
}
function FieldInput({
  label,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: "grid",
      gap: 6,
      marginTop: 9,
      fontFamily: "var(--font-sans)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--muted)",
      fontSize: 10,
      fontWeight: 800,
      textTransform: "uppercase"
    }
  }, label), /*#__PURE__*/React.createElement("input", _extends({}, rest, {
    style: {
      width: "100%",
      minHeight: 36,
      padding: "0 12px",
      border: "1px solid var(--line)",
      borderRadius: "var(--radius-pill)",
      background: "var(--paper)",
      color: "var(--ink)",
      fontSize: 12,
      fontWeight: 700
    }
  })));
}
Object.assign(__ds_scope, { FieldSelect, FieldInput });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/FieldSelect.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Legend.jsx
try { (() => {
/** Legend — map-key list of colored dot swatches with labels and optional counts. */
function Legend({
  items,
  title
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gap: 7,
      fontFamily: "var(--font-sans)"
    }
  }, title && /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--ura-deep)",
      fontSize: 10,
      fontWeight: 800,
      letterSpacing: ".05em",
      textTransform: "uppercase"
    }
  }, title), items.map((it, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: "grid",
      gridTemplateColumns: "12px minmax(0,1fr) auto",
      gap: 8,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 12,
      height: 12,
      borderRadius: 3,
      border: "1px solid rgba(17,24,32,.55)",
      background: it.color
    }
  }), /*#__PURE__*/React.createElement("strong", {
    style: {
      fontSize: 12,
      color: "var(--ink)",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    }
  }, it.label), it.count != null && /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--ink)",
      fontSize: 11,
      fontWeight: 800
    }
  }, it.count))));
}
Object.assign(__ds_scope, { Legend });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Legend.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Tabs.jsx
try { (() => {
/** Tabs — pill report-section tabs (KPI dashboard) or underline workspace tabs (contractor portal). */
function Tabs({
  items,
  activeId,
  onChange,
  variant = "pill"
}) {
  if (variant === "underline") {
    return /*#__PURE__*/React.createElement("nav", {
      role: "tablist",
      style: {
        display: "flex",
        gap: 8,
        overflowX: "auto",
        borderBottom: "1px solid var(--line)"
      }
    }, items.map(it => {
      const isActive = it.id === activeId;
      return /*#__PURE__*/React.createElement("button", {
        key: it.id,
        type: "button",
        role: "tab",
        "aria-selected": isActive,
        onClick: () => onChange && onChange(it.id),
        style: {
          minHeight: 40,
          padding: "0 14px",
          fontFamily: "var(--font-sans)",
          fontSize: 12,
          fontWeight: 750,
          color: isActive ? "var(--ura-deep)" : "var(--muted)",
          background: "transparent",
          border: 0,
          borderBottom: isActive ? "3px solid var(--ura-blue)" : "3px solid transparent",
          cursor: "pointer"
        }
      }, it.label);
    }));
  }
  return /*#__PURE__*/React.createElement("nav", {
    role: "tablist",
    style: {
      display: "flex",
      gap: 8,
      overflowX: "auto",
      padding: 4,
      background: "var(--paper)",
      border: "1px solid var(--line)",
      borderRadius: "var(--radius-pill)"
    }
  }, items.map(it => {
    const isActive = it.id === activeId;
    return /*#__PURE__*/React.createElement("button", {
      key: it.id,
      type: "button",
      role: "tab",
      "aria-selected": isActive,
      onClick: () => onChange && onChange(it.id),
      style: {
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
        cursor: "pointer"
      }
    }, it.label);
  }));
}
Object.assign(__ds_scope, { Tabs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Tabs.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Button = __ds_scope.Button;

__ds_ns.MetricCard = __ds_scope.MetricCard;

__ds_ns.DataTable = __ds_scope.DataTable;

__ds_ns.StatusPill = __ds_scope.StatusPill;

__ds_ns.FieldSelect = __ds_scope.FieldSelect;

__ds_ns.FieldInput = __ds_scope.FieldInput;

__ds_ns.Legend = __ds_scope.Legend;

__ds_ns.Tabs = __ds_scope.Tabs;

})();
