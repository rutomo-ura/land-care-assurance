Button renders LandCare's action, navigation-pill, segmented-toggle, or text-link controls.

```jsx
<Button variant="solid">Export Brief</Button>
<Button variant="pill" active>Map</Button>
<Button variant="segmented" active>LandCare Status</Button>
<Button variant="text">Show All</Button>
```

Variants: `solid` (filled dark-blue action button, 7px radius), `pill` (fully-rounded, used on the blue app header for page nav and inside white cards for report tabs), `segmented` (two-up bordered toggle group, e.g. Color Map By), `text` (bare blue link button, no border/background). Use `active` to mark the selected pill/segmented item. `disabled` drops opacity to .64 and disables pointer.
