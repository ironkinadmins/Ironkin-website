# Ironkin V5 Design System

The site-wide premium layer is intentionally centralized:

- `styles.css` — legacy/base components and feature-specific styles.
- `premium-v5.css` — current visual tokens, typography, surfaces, navigation, profile, trophy, visualization, footer, motion, responsive behavior.
- `premium-v5.js` — progressive enhancement only: active navigation, universal footer, reveal motion, badge polish, and data-visualization helpers.
- `nav.html` — shared application navigation.
- `/assets/ironkin-emblem.png` — canonical browser tab/favicon and brand emblem.

New visual work should use the `--ik-*` tokens in `premium-v5.css` instead of adding new hard-coded orange borders, shadows, radii, or font stacks to individual pages.
