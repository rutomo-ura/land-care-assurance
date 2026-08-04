Tabs switches between report sections or workspace panels.

```jsx
<Tabs variant="pill" items={[{id:"overview",label:"Overview"},{id:"budget",label:"Budget"}]} activeId="overview" onChange={setTab} />
```

Use `variant="pill"` for the KPI dashboard's report-section switcher (rounded active pill on a light card). Use `variant="underline"` for workspace-level tabs like the contractor portal's "Completion Overview / Submit Service" switch.
