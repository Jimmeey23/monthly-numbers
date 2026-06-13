---
name: Dashboard chart design decisions
description: Visual design choices for the Studio Performance trend chart and mix section
---

## Dark mode flash prevention
Added `data-theme="light"` directly on `<html lang="en" data-theme="light">` tag.
Also injected a blocking `<script>document.documentElement.setAttribute("data-theme","light");</script>` as the first child of `<head>` before any CSS can parse.
**Why:** JS setting the attribute after DOMContentLoaded causes a visible dark→light flash.

## Trend metric tabs (8 operational metrics)
Revenue · Earned Rev · Visits · New Visits · Conversion · Class Avg · Fill Rate · Lapsed
Field mapping: salesRev, sessionRev, checkedIn, newMembers, conversionRate, classAvg, fillRate, churnedMemberships
isPct: conversionRate, fillRate. isMoney: salesRev, sessionRev.

## Trend chart 3D effects (SVG only, no canvas)
- Shadow line: duplicate bezier path offset by DX=10/DY=7, lower opacity
- Glow: feGaussianBlur stdDeviation=3 on main line (stroke-width=8, opacity=0.12)
- Drop shadow filter on line and markers
- Triple-ring halo on each data point (3 concentric circles)

## 1-line metric explanations
DEFS object in renderTrendSummary: each key has {label, calc, trend}.
Auto-appends trend direction + period average.
Renders into #trendSummary above the chart.

## Per-metric colors
- Revenue: #10b981, Earned Rev: #6366f1, Visits: #0ea5e9, New Visits: #f59e0b
- Conversion: #ec4899, Class Avg: #14b8a6, Fill Rate: #8b5cf6, Lapsed: #ef4444

## Mix section tabs (demand/operational, NOT revenue mix)
6 tabs: Where from · Sessions · Fill Rate · Instructors · Time Slots · Retention

## Panel/container alignment
Cockpit + dashboard both constrained to width:90% / max-width:1400px / margin:auto.
All inner sections use 28px horizontal padding to match cockpit content start.
studio-analytics-panel: no side borders/radius, edge-to-edge strip.
