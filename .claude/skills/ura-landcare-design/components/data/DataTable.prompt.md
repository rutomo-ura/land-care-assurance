DataTable renders LandCare's operational ledger — a sticky-header table with restrained zebra rows and hover feedback.

```jsx
<DataTable
  columns={[{key:"supplier",label:"Supplier"},{key:"amount",label:"Amount"}]}
  rows={[{supplier:"Supplier Alpha",amount:"$280,000"}]}
/>
```

Keep semantic `table`/`th`/`td` markup (already handled internally). Use for invoice ledgers, monthly reconciliation, and parcel lists.
