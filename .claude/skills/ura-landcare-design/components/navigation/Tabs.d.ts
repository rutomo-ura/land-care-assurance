import { ReactNode } from "react";

export interface TabItem {
  id: string;
  label: string;
}

/**
 * @startingPoint section="Components" subtitle="Pill report tabs and underline workspace tabs" viewport="700x120"
 */
export interface TabsProps {
  items: TabItem[];
  activeId: string;
  onChange?: (id: string) => void;
  /** pill = rounded active-pill tabs (KPI report sections). underline = 3px bottom-border tabs (contractor portal workspaces). */
  variant?: "pill" | "underline";
}
