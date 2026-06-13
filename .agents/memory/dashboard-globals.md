---
name: Dashboard APP/state globals
description: Main inline script uses const/let which are not window-accessible; fix required for override scripts
---

The main dashboard inline `<script>` (the large blob at the end of index.html, closing at physical line ~8800) uses:
- `const APP = {...}` — NOT accessible as `window.APP` from external scripts
- `let state = {...}` — NOT accessible as `window.state` from external scripts
- `function render(){}` — IS accessible as `window.render` (function declaration)

**Why:** `const` and `let` at top-level script scope are not added to `window` in modern browsers. Only `var` and function declarations become window properties.

**How to apply:** Any override script added after the main `<script>` block must first expose these globals. Add this line just before the main script's closing `</script>` tag:
```javascript
window.APP = APP; window.state = state;
```

**Key physical line:** The `document.addEventListener('DOMContentLoaded', init);` line is at physical line ~8799, followed by `window.APP = APP; window.state = state;` on line 8800, then `</script>` on line 8801.

**Override script timing:** Use `setTimeout(fn, 160)` inside DOMContentLoaded in the override script to ensure the main `init()` runs first before the enhancement code executes.
