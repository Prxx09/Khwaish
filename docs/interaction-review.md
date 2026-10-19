# Interaction review — 19 October 2026

## Changes

- Auth initialization ignores stale getUser results after a newer auth event. Password recovery events open account settings. Client requests time out after 25 seconds. Client initialization failures are caught inside the sign-in submit handler.
- Sign-in and signup have pending guards, disabled mode switching during requests, visible provider errors and confirmation resend. Sign-out reports errors instead of claiming success.
- Dialog backdrop clicks only dismiss outside the dialog rectangle; clicking dialog padding does not dismiss it. Close buttons explicitly use type=button.
- Fixed mobile-only icon controls appearing on desktop due to CSS specificity.
- Increased navigation, forms, cards and explanatory text sizes; refined sidebar/profile styling, focus targets, card surface clicks and scroll entrance effects. Reduced-motion settings are respected.
- New guest shelves start empty. Existing sample product IDs are removed from guest state; user-created entries remain. Shared-space actions require login, guest comments no longer pretend to persist, and guest price tracking is disabled.
- Comment-load failures clear the spinner. Signing out closes stale account dialogs.

## Review coverage

Read handlers for navigation, themes, account forms, password reset, capture, local OCR, item editing/deletion, favorite priority, filtering/sorting, price refresh, comparison, sharing, invitation copy/revoke, member roles, comments and CSV export. Existing store comparison and price-refresh APIs report unavailable data rather than inventing prices. Store links remain search links, not verified product matches.

## Verification limits

TypeScript, domain tests and production build are run for this revision. Browser automation is unavailable in this workspace: no claim is made that every desktop/mobile interaction has been executed. The reported login failure could not be reproduced using the user's credentials; no password was requested or reset. Database inspection found one confirmed account and no recorded successful login. Email delivery and Supabase URL allowlist still require confirmation. Supabase's connector does not expose Auth URL configuration.

The sign-in/signup landing screen remains deferred as requested. Cross-store provider results and scheduled checks require configuration; this revision does not claim to enable them.
