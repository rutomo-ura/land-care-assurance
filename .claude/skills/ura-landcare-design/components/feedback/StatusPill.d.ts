import { ReactNode } from "react";

export interface StatusPillProps {
  tone?: "submitted" | "open" | "risk" | "success" | "info";
  children?: ReactNode;
}
