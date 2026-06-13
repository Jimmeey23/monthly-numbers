---
name: Dashboard detailTiles function
description: detailTiles was missing from the dashboard codebase but called in many places
---

## Rule
`detailTiles(pairs)` must be defined before `let state = {` in `artifacts/dashboard/index.html`.

**Why:** The function was called by renderTrendSummary, renderFormatSummary, renderFunnel, and renderMixChart but was never defined — causing a runtime crash on page load.

**How to apply:** If ever re-migrating or re-editing the dashboard JS, ensure this snippet is present:
```js
function detailTiles(pairs){
  return pairs.map(([lbl,val])=>`<div class="chart-stat"><span>${lbl}</span><strong>${val}</strong></div>`).join('');
}
```
