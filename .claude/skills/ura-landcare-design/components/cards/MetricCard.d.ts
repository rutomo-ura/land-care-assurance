import { ReactNode } from "react";

export interface MetricCardProps {
  label: string;
  value: string | number;
  note?: string;
  /** Top-border accent for a non-featured card. risk=orange, info=blue, finance=green, neutral=none. */
  tone?: "neutral" | "risk" | "info" | "finance";
  /** Renders the dark navy→blue gradient hero treatment used for the one dominant metric per band. */
  featured?: boolean;
}
