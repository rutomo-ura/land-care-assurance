import { ReactNode, ButtonHTMLAttributes } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual treatment. solid = filled action button (export/clear filters). pill = rounded nav/tab button on colored bars. segmented = bordered toggle group item. text = bare link-style button. */
  variant?: "solid" | "pill" | "segmented" | "text";
  /** Marks the button as the selected item within a pill/segmented group. */
  active?: boolean;
  disabled?: boolean;
  children?: ReactNode;
}
