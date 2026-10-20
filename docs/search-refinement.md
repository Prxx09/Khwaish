# Smart wish search and input refinement

## Behavior

Shelf and Price Watch now share a search field with **Smart** matching enabled by default. The toggle switches to **Exact** text matching.

Smart matching is a bounded local concept/synonym matcher, not an embedding model or an LLM call. It recognizes related terms such as shoes / sneakers / trainers / footwear and known product model names such as Nike Air Force, Air Max, and Dunk Low. It handles partial product words, one-letter typos/transpositions, and INR budget phrases such as “Nike shoes under ₹5k”. Every meaningful term must match, so brand constraints remain useful. A shoe query does not match all Fashion wishes or incidental words such as “shown” in screenshot notes.

Search indexes the already-loaded product name, brand, category, notes, retailer, variant, product code, and decoded product URL paths. Query strings are excluded to avoid matching unrelated recommendation parameters. It does not infer an unidentified product's type from its brand alone. Exact mode uses normalized literal text without synonym expansion or typo tolerance.

Shelf search remains inside the selected shelf/space and respects existing category, status, priority, and sort controls. Price Watch keeps its existing active-wish scope and segments. No extra queries, remote search calls, API keys, migrations, or changes to protected backend/lib files are needed.

## Input design

- One shared, 52px-high search control with matching padding and typography.
- A single contiguous focus border on the parent; embedded inputs no longer draw a second outline.
- Consistent focus treatment for Ask Khwaish and embedded capture/auth input fields.
- Accessible Smart toggle, 44px controls, native searchbox semantics, and clear-button focus return.
- Both themes and narrow-screen layouts retained.

## Verification

- `npm run typecheck` and production build pass.
- `npm test`: 18 tests pass, including five new search tests. Existing `tests/**` files are unchanged.
- Targeted production-browser checks pass at 320 / 375 / 768 / 1280 / 1920px in both themes: partials, synonyms, model names, typo/budget queries, Exact mode, clear/focus behavior, shared-space scope, Price Watch and chat focus. 30 screenshots captured, no runtime errors or page overflow.
- Existing browser regression: all 40 interaction checks pass. Signed-in service responses remain fixtures; no live account mutations or external extraction calls were made.
- Existing contrast audit: all 80 role combinations pass.

Reproduce the focused browser review after building:

```sh
UI_REVIEW_BROWSER=/path/to/chromium node scripts/search-ui-review.cjs
```
