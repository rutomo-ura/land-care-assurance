export interface DataTableColumn {
  key: string;
  label: string;
}

/**
 * @startingPoint section="Components" subtitle="Sticky-header ledger table with zebra rows" viewport="700x220"
 */
export interface DataTableProps {
  columns: DataTableColumn[];
  rows: Record<string, string | number>[];
}
