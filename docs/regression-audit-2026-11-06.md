# Khwaish regression audit — 6 November 2026

## Live desktop checks

| Workflow | Observed result |
| --- | --- |
| Account session | Signed-in account visible and retained after reload |
| Shelf search | Nike query reduced results to the matching shoe, Clear restored the shelf |
| Grid/list | Both selected states changed correctly |
| Product dialog | Opened with image, saved price, source and editing fields |
| Details/Compare/Conversation | Tabs switched and exposed their corresponding panels |
| Shared spaces | Existing space and People dialog opened |
| AI total query | Returned 12 matches and INR total 755754 before adding the QA item |
| Invalid product URL | Failed with raw validation JSON |
| Manual recovery | Invalid URL persisted in collapsed extra fields and blocked saving |
| Manual creation | QA regression test — 6 Nov saved with INR 123 |
| Persistence | QA wish remained after reload |
| Item editing | QA variant updated to QA verified edit |
| Unsaved changes | Escape opened confirmation and Discard returned to shelf |
| Live price | Flipkart iPhone check returned INR 154900 with a fresh Bright Data timestamp |
| Scrolling | Price Watch scrolled to window.scrollY 1663, document height 2599 and viewport 936 |
| Themes | After hours and Daydream switched successfully, Daydream restored |
| Settings | Profile and integration status displayed |

## Improvements

1. Fixed invalid URL feedback before the metadata request. Invalid input now stays in the link field.
2. Fixed raw schema-validation errors being exposed as JSON.
3. Fixed collapsed invalid fields preventing discoverable recovery. Validation expands the containing details section.
4. Added category editing. Existing imported phone was classified as Fashion and lacked a correction control.
5. Remaining UX issue — shared busy state temporarily labels Check price as Checking while saving unrelated details.
6. Remaining integration work — verify Amazon, Myntra and other retailer imports separately.
7. Remaining coverage — mobile/tablet, OCR uploads, export contents, role enforcement with a second account, invitation acceptance/revocation, comments writes, deletion, logout/relogin, keyboard-only traversal and reduced motion.

This is a partial live regression audit. Passing unit tests and compilation do not cover the outstanding browser checks.

## Data written

Created one explicitly named QA wish with price INR 123 and variant QA verified edit. It remains in the personal shelf for review. One existing Flipkart product received a fresh price observation through Check price.
