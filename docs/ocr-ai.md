# OCR followed by Groq structuring

1. The browser preprocesses the uploaded screenshot and recognizes the full image locally with Tesseract. No heuristic-filtered text is sent in place of the original OCR output.
2. A visible toggle controls whether recognized text is sent to Groq. Images are not sent to the LLM. Local-only mode remains available; signed-in users can retry structuring explicitly.
3. `/api/structure` authenticates the session and consumes the existing metadata request budget (40 requests per user/hour, shared with URL imports and AI wishlist search). It accepts 8–24,000 characters, calls the configured Groq model with a strict output schema, no tools and no retries, and bounds the generation time.
4. The schema covers title, brand, retailer, category, price/currency, MRP, rating/review count, SKU, model, selected color/size/capacity, material, seller, stock and additional attributes. The model is instructed to leave unreadable or unsupported fields null. Title and selling-price quotes must occur in OCR text, price must appear numerically in its quote, ratings/EMI must not become prices, and additional attributes require supporting quotes. This reduces errors; it does not guarantee semantic accuracy.
5. Main fields fill the editable capture form; additional specifications fill Notes. The original OCR output stays available for inspection and is stored with the private screenshot on save. The saved price is a screenshot observation, not a live retailer price.

## Configuration

Set `GROQ_API_KEY` and optionally `GROQ_MODEL` in Vercel. The default model is `openai/gpt-oss-20b`, which supports strict structured output. Keys stay server-only. Configure each environment independently and redeploy after changing them. Missing credentials, quota/model failures or timeouts return an explicit message and preserve local OCR results.

## Verification

Schema/evidence tests cover invented titles/URLs, rating-as-price, amounts and response bounds. TypeScript and production builds cover the server integration. A live Groq call with synthetic OCR text successfully separated product title, selling price and rating. A complete authenticated browser flow and OCR-device testing remain unverified here.

Chat deletion uses the existing author-only `item_comments` RLS policy, checked with transactional synthetic fixtures. Other members' messages are retained. Deleting messages is confirmed in the interface and cannot be undone.

## Semantic wishlist search

`/api/ask` fetches up to 500 accessible items through the user's Supabase session and optional library filter. Groq selects IDs using product names, categories, variants, short notes and saved price metadata. Only IDs present in those fetched records are accepted. Totals and recorded savings are computed in code, never supplied by the model. Larger collections and API failures fall back to local matching with a visible message. Search uses saved observations, not current web prices.
