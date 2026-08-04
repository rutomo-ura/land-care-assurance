MetricCard shows one KPI figure with a label and short qualifier note.

```jsx
<MetricCard featured label="Annual run rate" value="$775K" note="Projected invoice pace" />
<MetricCard tone="risk" label="Open Queue" value="42" note="Needs action" />
```

Use exactly one `featured` card per metric band (the dominant signal), and tone-accented cards (`risk`/`info`/`finance`) for supporting metrics. Never use more than one featured card in the same band.
