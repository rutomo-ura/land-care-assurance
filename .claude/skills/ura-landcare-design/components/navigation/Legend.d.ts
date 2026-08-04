export interface LegendItem {
  color: string;
  label: string;
  count?: number | string;
}

/**
 * @startingPoint section="Components" subtitle="Map-key swatch list with labels and counts" viewport="700x150"
 */
export interface LegendProps {
  items: LegendItem[];
  title?: string;
}
