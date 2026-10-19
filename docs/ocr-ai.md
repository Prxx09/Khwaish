# OCR followed by Gemini structuring

1. The browser preprocesses the uploaded screenshot and recognizes the full image locally with Tesseract. No heuristic-filtered text is sent in place of the original OCR output.
2. A visible toggle controls whether recognized text is sent to Google. Images are not sent to the LLM. Local-only mode remains available; signed-in users can retry structuring explicitly.
3. `/api/structure` authenticates the session and consumes the existing metadata request budget (40 requests per user/hour, shared with URL imports). It accepts 8–24,000 characters, calls the configured Gemini model with a strict output schema, no tools and no retries, and bounds the generation time.
4. The schema covers title, brand, retailer, category, price/currency, MRP, rating/review count, SKU, model, selected color/size/capacity, material, seller, stock and additional attributes. The model is instructed to leave unreadable or unsupported fields null. Title and selling-price quotes must occur in OCR text, price must appear numerically in its quote, ratings/EMI must not become prices, and additional attributes require supporting quotes. This reduces errors; it does not guarantee semantic accuracy.
5. Main fields fill the editable capture form; additional specifications fill Notes. The original OCR output stays available for inspection and is stored with the private screenshot on save. The saved price is a screenshot observation, not a live retailer price.

## Configuration

Set `GEMINI_API_KEY` and optionally `GEMINI_MODEL` in Vercel. The default model is `gemini-3.8-flash`. Keys stay server-only. Configure each environment independently and redeploy after changing them. Missing credentials, quota/model failures or timeouts return an explicit message and preserve local OCR results. The presence of a key is not proof of provider access.

## Verification

Schema/evidence tests cover invented titles/URLs, rating-as-price, amounts and response bounds. TypeScript and production builds cover the server integration. A successful live Gemini generation requires an authenticated application session and valid configured provider access; it has not been exercised from this workspace. Browser visual and OCR-device testing are unavailable here.

Chat deletion uses the existing author-only `item_comments` RLS policy, checked with transactional synthetic fixtures. Other members' messages are retained. Deleting messages is confirmed in the interface and cannot be undone.
