# Khwahish ✦

A personal and shared wishlist for your next favourite thing. Responsive Next.js website with dark **After hours** and light **Daydream** themes, Supabase authentication and private storage.

## Implemented

- Email/password sign-up, sign-in, recovery callback, editable profile and password.
- Private personal shelf, multiple shared spaces, owner/editor/viewer roles.
- Single-use, seven-day invite links, revocation, member role changes and removal.
- Product link previews from public Schema.org/Open Graph metadata; editable review before saving.
- Browser-side full screenshot OCR with Tesseract.js, preprocessing and manual fallback. Optional Gemini structuring sends recognized text to Google after local OCR; the toggle explains this before upload. The screenshot and original OCR text are stored privately only when saving to an authenticated account. Unsupported fields stay unknown, and selling price/title evidence is checked against the recognized text.
- Manual capture, categories, priority, status, notes, size/color/variant, product code, target price and target date.
- Initial saved price preserved separately from timestamped price observations; on-demand store checks, history chart and price-drop totals.
- Bounded English natural-language wishlist queries (budget/category/store/priority/status/name, totals and recorded drops). Queries run locally on the user's authorized items, without sending wishlist content to a model.
- Shared item conversations, database-backed access checks and realtime item/comment updates.
- CSV export, grid/list views, responsive mobile navigation, keyboard-accessible native dialogs and reduced-motion support.
- Empty browser-only guest shelves; signing in opens a separate private account. Desktop navigation uses a top workspace bar; mobile retains its drawer and bottom navigation.
- Delete individual authored product comments or clear your own messages with confirmation. Ask Khwahish includes a clear-chat action.

## What needs an external integration

There is no universal free product/price API for all retailers. This app does **not** fabricate live offers or bypass retailer verification pages.

- **Link imports/current price:** use readable public metadata where the retailer provides it. If blocked or absent, preserve the saved item and offer manual entry.
- **Screenshots:** extract visible text/price locally. A screenshot alone cannot reliably identify an exact web listing or stock image; add its product URL to fetch retailer imagery, or configure the shopping search provider and review matches in Compare.
- **Cross-store cards:** optional `SERPAPI_API_KEY` enables Google Shopping search results. Without it, store search links remain available. Search matches are not automatically asserted to be the same model/variant.
- **Scheduled checks:** optional server-only Supabase key and `CRON_SECRET` enable the Vercel cron route. A bounded rotating batch of four opted-in items is checked per run, to stay within function execution limits. No per-product daily refresh promise is made. Without those keys, checks are on demand.
- Prices may vary by location, variant, seller, shipping, membership and coupons. The store confirms the final price. No retailer's full historical price archive is implied.

## Local setup (Windows, macOS, Linux)

Use Node.js 22 or later. No native OCR or admin installation is needed.

```sh
git clone https://github.com/Prxx09/Khwaish.git
cd Khwaish
npm ci
```

Copy `.env.example` to `.env.local` (Windows: `copy .env.example .env.local`) and fill the two required public Supabase values. Then:

```sh
npm run dev
```

Open http://localhost:3000. To verify the code:

```sh
npm run typecheck
npm test
npm run build
```

## Supabase setup

Project reference: `cujojmczwfgyjzpympby`. Application migrations have been applied to this project. The source-of-truth migration files under `supabase/migrations` mirror the remote history. `supabase/schema.sql` is the original foundation reference; it is not a replacement for all migrations.

For a fresh project, apply all migrations in version order with the Supabase CLI. Never run only the application-workflows migration on an empty database.

### Authentication URLs

In Supabase **Authentication → URL Configuration**:

- Set Site URL to the deployed Vercel URL.
- Allow `http://localhost:3000/auth/callback` for local development.
- Allow `https://<your-domain>/auth/callback` and `https://<your-domain>/auth/callback?recovery=1` for production.
- Add exact preview callback URLs only where preview sign-in is needed. Avoid broad untrusted redirect allowlists.

Email confirmation and password-recovery delivery depend on Supabase email/SMTP settings. Google/social login is not presented as configured.

### Policies and uploads

- Personal libraries are owner-only. Shared libraries use explicit membership.
- Viewer roles can browse and comment; editors can add/edit/remove wishes and their uploaded media.
- Screenshot paths use `<library-id>/<item-id>/<random-file>`. `wishlist-assets` is private, capped at 10 MB/file, and accepts JPEG/PNG/WebP.
- A consumed invitation cannot restore a removed member's access. Baseline price/currency/author/library are immutable on item updates.
- `supabase/policy-tests.sql` exercises privacy, roles, invitation reuse, historical baseline and request budgets in one rolled-back transaction; it sends no email and leaves no synthetic users.

## Vercel deployment

1. Add the **Prxx09** GitHub login connection in the Vercel account and ensure the GitHub integration can access `Prxx09/Khwaish`.
2. Import the repository as a Next.js project in the intended Vercel team.
3. Set the two required Supabase public variables for the needed environments.
4. Optionally set shopping/scheduled-check variables described in `.env.example` directly in Vercel secrets.
5. Deploy, then add its callback URL to Supabase Auth.

The database is in `ap-southeast-2`, so function region `syd1` keeps server-to-database traffic close. Change both deliberately if moving the data region.

## Verification boundaries

Build, TypeScript, domain tests and live database policy tests are recorded in `docs/verification.md`. Retailer-specific imports depend on current retailer behaviour. End-to-end email delivery and arbitrary store availability are not inferred from a successful build.

## Future scope only

Application-first/native clients, browser extensions, native Windows OCR, retailer affiliate partnerships, broader licensed catalog coverage, richer semantic search and notification delivery. The current deliverable is a website for desktop and mobile browsers.
