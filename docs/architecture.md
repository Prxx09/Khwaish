# Khwahish architecture

## Runtime

- Next.js App Router with TypeScript on Vercel; Node.js API routes.
- Responsive React client with CSS theme tokens, native dialogs and reduced-motion styles.
- Supabase Auth and SSR cookies, with signature-checked claims in the proxy and server `getUser()` verification before external fetches.
- Supabase Postgres, RLS and private Storage. No service credential is used in the browser.

## User-facing workflows

1. **Capture:** product link → authenticated/rate-limited metadata route → public-IP-pinned fetch with bounded redirects/response size/time → structured metadata → editable review → item, saved baseline and private screenshot upload.
2. **Screenshot:** lazy-loaded browser OCR → editable extracted name/visible price → optional product link → save. No screenshot is sent to an OCR/LLM provider by default.
3. **Share:** owner creates shared library → one-use token (hash stored) → signed-in recipient accepts → editor/viewer membership. Removed users cannot reuse consumed invitations.
4. **Query:** load only RLS-authorized records → bounded natural-language filter/aggregation over those records → matching products and explained filters. No generated SQL and no external model disclosure.
5. **Check price:** authorized item → original source page → code/currency checks → timestamped observation. Baseline remains unchanged.
6. **Compare:** optional shopping-data provider returns candidate cards. Store searches always remain available. Matches require human variant/seller confirmation.
7. **Track:** optional Vercel cron, authenticated with a timing-safe secret check, uses a server-only key to refresh a bounded rotating batch of opted-in products.

## Tables

`profiles`, `libraries`, `library_members`, `wishlist_items`, `price_observations`, `product_media`, `library_invites`, `item_comments`.

`private.request_budgets` is deliberately inaccessible directly. Privileged helper implementations live in the unexposed `private` schema. Public RPC wrappers have explicit execution grants and use current-user checks.

## Data boundaries

- Personal libraries cannot accept non-owner members.
- Shared viewers can read/comment; editors can mutate products; owners manage membership/invites.
- Media metadata is tied to the same item/library; bucket access checks current library membership.
- Original item author, baseline, currency and library cannot be rewritten through item updates.
- User-supplied names/notes are React text, never executable HTML. External product URLs reject credentials/private addresses, pin DNS for each request and revalidate redirects.

## Operational dependencies

Required: Supabase public project configuration, correct Auth redirects, Vercel GitHub connection.

Optional: SerpApi shopping-data key; server-only Supabase key plus cron secret for unattended tracking. Without optional credentials, the UI explicitly shows store searches and on-demand checks.

The website is the current product. Native/application-first work remains future scope.
