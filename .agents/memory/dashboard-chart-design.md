---
name: Dashboard chart design decisions
description: Visual design choices for the Studio Performance trend chart and mix section
---

## Chart background
Pure white (#ffffff), 1px solid #e2e8f0 border, no backdrop-filter/blur.
**Why:** User explicitly rejected dark and glassmorphic backgrounds; wants clean white.

## Trend chart line colors (per metric)
NOT tied to up/down direction — each metric has a fixed color:
- Revenue (salesRev): #00c853 neon green
- ATV (atv): #7c3aed purple
- AUV (auv): #1d4ed8 indigo
- Transactions (transactions): #0891b2 teal
- Members (buyers): #2563eb blue
- Units (salesItems): #d97706 amber
- Discounts (discountValue): #dc2626 red

## Trend metric tabs (7 commercial metrics)
Revenue · ATV · AUV · Transactions · Members · Units · Discounts
Each tab has a colored `<i class="tdot">` dot indicator.
discountValue is computed from categories[].discountAmount reduce sum (not in summary).

## Summary stat tiles
4 tiles: This month / vs. prior month / Period average / Period best
Prior month delta uses vals[vals.length-2] (second-to-last period value).

## Mix section tabs (demand/operational, NOT revenue mix)
6 tabs: Where from (sources by newMembers) · Sessions (classes by attendance) · Fill Rate (formats by fill) · Instructors (by session count) · Time Slots (dayparts by sessions or revenue fallback) · Retention (lapsedTypes by lapsed count)
**Why:** User wanted demand/operational focus, not revenue breakdown.

## Panel width
executive-zone uses negative margins (-22px each side) to break out of .dashboard padding.
studio-analytics-panel: border-radius 0, no left/right border.
