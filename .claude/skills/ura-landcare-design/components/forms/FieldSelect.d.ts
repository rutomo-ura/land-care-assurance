import { ReactNode, SelectHTMLAttributes, InputHTMLAttributes } from "react";

export interface FieldSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  compact?: boolean;
  children?: ReactNode;
}

export interface FieldInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}
