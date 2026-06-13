---
name: Dashboard CSS override placement
description: Override CSS must be at the very end of index.html, before </body>
---

## Rule
The light-theme CSS override block (id: `p57-light-redesign-override`) MUST be placed at the very end of `artifacts/dashboard/index.html`, right before `</body>`.

**Why:** Studio-specific `!important` rules appear in lines 2000-7500 of the file. Anything placed in `<head>` or earlier in `<body>` will be overridden by these rules.

**How to apply:** When adding new CSS overrides, always append them to the override block at end of file. For high-specificity selectors, use `html .dashboard` or `html body .class` patterns.

## Other sharp edges
- `discountAmount` is in `categories[]` sub-array, NOT in `summary` — must be computed as reduce sum per period
- `buyers` = unique members, `checkedIn` = visitors, `newMembers` = new visits, `churnedMemberships` = lapsed
- `.dashboard` max-width override must use `html .dashboard` for sufficient specificity (locked to 1720px)
