# Khwahish architecture

## MVP structure

- **Web:** Next.js App Router, TypeScript, responsive layouts for desktop and mobile browsers.
- **Identity:** Supabase Auth with cookie-backed sessions in server-rendered routes.
- **Database:** Supabase Postgres with Row Level Security on every user-facing table.
- **Media:** Private Supabase Storage bucket for uploaded screenshots and user-supplied images.
- **Hosting:** Vercel.
- **Extraction:** retailer page metadata and structured product data when available; browser-side OCR for screenshots; users review and correct every import before saving.
- **Price tracking:** source adapters write timestamped price observations. A missing or stale observation is shown as unknown, never as a live price.

## Data boundaries

A library belongs to one owner and can have members. Private libraries contain only their owner. Shared-library access is granted through explicit membership. Wishlist items belong to a library; price observations and uploaded media inherit that item's or library's access boundary.

Database policies check membership and ownership. The browser uses only the Supabase publishable key. Any privileged key stays in server-only deployment secrets and is not required for the first schema setup.

## Initial data model

- `profiles`: display name and avatar metadata for an authenticated user.
- `libraries`: personal or shared library and its owner.
- `library_members`: membership and role.
- `wishlist_items`: product details, source URL, initial price, priority, status, notes, and target date.
- `price_observations`: timestamped price and availability observations with source and confidence.
- `product_media`: private uploaded screenshot/image metadata and optional OCR result.

## Import workflow

1. Validate and normalize a product URL or accept a screenshot.
2. For screenshots, run OCR in the browser where supported; do not upload the image to an OCR provider by default.
3. Extract available metadata and source attribution.
4. Show a review form with confidence or missing-field hints.
5. On user confirmation, save the item, initial price, and any media metadata.
6. Create a price observation only when the value has a known source and check time.

## Security and reliability

- RLS is enabled on all exposed tables.
- Shared rows are visible only to active library members.
- Uploaded media uses a private bucket and library membership checks.
- Validate URL schemes and block private/internal network destinations in server-side fetches to reduce SSRF risk.
- Do not scrape around retailer access controls or describe unsupported prices as current.
- Keep source, checked-at time, and availability with each price.
- Natural-language search will first translate into a bounded set of filters and text terms; database access remains governed by RLS.

## Initial setup sequence

1. Keep the GitHub repository as the source of truth and commit the schema and environment example.
2. Apply the SQL to the intended Supabase project and verify RLS and storage policies.
3. Add the project URL and publishable key to local and Vercel environments.
4. Scaffold the Next.js app, connect deployments, and verify sign-in and library isolation before adding imports.
