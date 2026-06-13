---
name: Dashboard chart design decisions
description: Visual design choices for the Studio Performance trend chart
---

## Chart background
Pure white (#ffffff), 1px solid #e2e8f0 border, no backdrop-filter/blur.
**Why:** User explicitly rejected dark and glassmorphic backgrounds; wants clean white.

## Line colors
Per-metric neon — NOT tied to up/down direction:
- Revenue (salesRev): #00c853 neon green
- Members (buyers): #1565c0 neon dark blue
- Conversion (conversionRate): #e65100 neon orange
- Cancellations (churnedMemberships): #b71c1c neon red

## Line style
No glow filters, no shadow layers, no tube effects.
Crisp 2.5px stroke, solid markers with white ring border for contrast.

## Tabs shown
4 sales metrics only: Revenue, Members, Conversion, Cancellations.
Removed: Discounts, Visitors, First Timers.

## Panel width
executive-zone uses negative margins (-22px each side) to break out of .dashboard padding,
matching the cockpit topbar full-bleed width.
studio-analytics-panel: border-radius 0, no left/right border.
