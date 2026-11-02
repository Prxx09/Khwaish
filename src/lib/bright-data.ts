import type { ExtractedProduct } from "./types";

type Json = Record<string, unknown>;

const AMAZON_DATASET_ID = "gd_l7q7dkf244hwjntr0";

function text(value: unknown, max = 2000): string {
  if (typeof value === "string") return value.trim().slice(0, max);
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  return "";
}

function first(record: Json, keys: string[]) {
  for (const key of keys)
    if (record[key] != null && record[key] !== "") return record[key];
  return undefined;
}

function amount(value: unknown): number | null {
  if (typeof value === "number")
    return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value !== "string" || /-\s*[\d.,]/.test(value)) return null;
  const cleaned = value.replace(/[^\d.,]/g, "").replace(/,/g, "");
  const parsed = Number(cleaned);
  return cleaned && Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function imageUrl(value: unknown): string {
  const candidates = Array.isArray(value) ? value : [value];
  for (const candidate of candidates) {
    const raw =
      typeof candidate === "object" && candidate
        ? first(candidate as Json, ["url", "src", "image_url"])
        : candidate;
    const value = text(raw);
    try {
      const parsed = new URL(value);
      if (["https:", "http:"].includes(parsed.protocol)) return parsed.href;
    } catch {}
  }
  return "";
}

function classifyCategory(value: string) {
  const category = value.toLowerCase();
  if (/phone|laptop|camera|audio|electronic|headphone|speaker|gaming/.test(category))
    return category.includes("gaming") ? "Gaming" : "Electronics";
  if (/fashion|clothing|shoe|apparel|dress|shirt|accessor/.test(category))
    return "Fashion";
  if (/beauty|skin|makeup|perfume|cosmetic/.test(category)) return "Beauty";
  if (/book|novel/.test(category)) return "Books";
  if (/fitness|gym|sport|yoga/.test(category)) return "Fitness";
  if (/home|furniture|decor|kitchen|living/.test(category))
    return "Home & living";
  return "Other";
}

function retailerFor(hostname: string) {
  if (hostname.includes("amazon.")) return "Amazon";
  if (hostname.includes("flipkart.")) return "Flipkart";
  if (hostname.includes("myntra.")) return "Myntra";
  return hostname.replace(/^www\./, "");
}

function datasetFor(hostname: string) {
  if (hostname.includes("amazon."))
    return process.env.BRIGHT_DATA_AMAZON_DATASET_ID || AMAZON_DATASET_ID;
  if (hostname.includes("flipkart."))
    return process.env.BRIGHT_DATA_FLIPKART_DATASET_ID || "";
  if (hostname.includes("myntra."))
    return process.env.BRIGHT_DATA_MYNTRA_DATASET_ID || "";
  return process.env.BRIGHT_DATA_PRODUCT_DATASET_ID || "";
}

function details(record: Json): string {
  const lines: string[] = [];
  const add = (label: string, value: unknown) => {
    const content = text(value, 1200);
    if (content) lines.push(`${label}: ${content}`);
  };
  add("Description", first(record, ["description", "product_description"]));
  add("Seller", first(record, ["seller_name", "seller", "store_name"]));
  add("Rating", first(record, ["rating", "rating_value", "stars"]));
  add(
    "Ratings count",
    first(record, ["ratings_count", "rating_count", "reviews_count", "review_count"]),
  );
  add(
    "Original price",
    first(record, ["initial_price", "original_price", "mrp", "list_price"]),
  );
  add("Discount", first(record, ["discount", "discount_percentage"]));
  const features = first(record, [
    "features",
    "feature_bullets",
    "product_overview",
    "highlights",
  ]);
  if (Array.isArray(features))
    add("Features", features.map((item) => text(item, 300)).filter(Boolean).join("; "));
  else add("Features", features);
  const specs = first(record, ["specifications", "product_details", "attributes"]);
  if (specs && typeof specs === "object" && !Array.isArray(specs))
    add(
      "Specifications",
      Object.entries(specs as Json)
        .map(([key, value]) => `${key}: ${text(value, 300)}`)
        .filter((entry) => !entry.endsWith(": "))
        .join("; "),
    );
  else if (Array.isArray(specs))
    add(
      "Specifications",
      specs
        .map((item) =>
          typeof item === "object" && item
            ? Object.entries(item as Json)
                .map(([key, value]) => `${key}: ${text(value, 200)}`)
                .join(", ")
            : text(item, 300),
        )
        .filter(Boolean)
        .join("; "),
    );
  return lines.join("\n").slice(0, 2000);
}

function recordFrom(payload: unknown): Json | null {
  if (Array.isArray(payload))
    return (payload.find((item) => item && typeof item === "object") as Json) ?? null;
  if (!payload || typeof payload !== "object") return null;
  const object = payload as Json;
  for (const key of ["results", "data", "items"]) {
    const nested = recordFrom(object[key]);
    if (nested) return nested;
  }
  return object;
}

export function normalizeBrightDataProduct(
  payload: unknown,
  requestedUrl: string,
): ExtractedProduct | null {
  const record = recordFrom(payload);
  if (!record || record.error) return null;
  const productName = text(
    first(record, ["title", "product_name", "name"]),
    240,
  );
  if (!productName) return null;
  const url = new URL(requestedUrl);
  const categoryRaw = text(
    first(record, ["category", "product_category", "category_tree", "category_path"]),
  );
  const colors = first(record, ["color", "colors"]);
  const sizes = first(record, ["size", "sizes"]);
  const models = first(record, ["model", "models", "style"]);
  const variant = [models, colors, sizes]
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .map((value) => text(value, 100))
    .filter(Boolean)
    .join(" · ")
    .slice(0, 200);
  const availability = first(record, ["availability", "in_stock", "is_available"]);
  const availabilityText = text(availability).toLowerCase();
  const currency = text(first(record, ["currency", "currency_code"]), 3).toUpperCase();
  return {
    product_name: productName,
    product_url:
      text(first(record, ["url", "product_url", "origin_url"]), 3000) ||
      requestedUrl,
    image_url: imageUrl(
      first(record, ["images", "image_urls", "image_url", "thumbnail"]),
    ),
    price: amount(
      first(record, [
        "final_price",
        "current_price",
        "price",
        "selling_price",
        "discounted_price",
      ]),
    ),
    currency: /^[A-Z]{3}$/.test(currency) ? currency : "INR",
    retailer: retailerFor(url.hostname),
    brand: text(first(record, ["brand", "product_brand"]), 120),
    category: classifyCategory(categoryRaw),
    product_code: text(
      first(record, [
        "asin",
        "product_id",
        "item_id",
        "variant_id",
        "sku",
        "model_number",
      ]),
      120,
    ),
    variant,
    availability:
      availability === true || /in.stock|available/.test(availabilityText)
        ? "in_stock"
        : availability === false ||
            /out.of.stock|unavailable|sold.out/.test(availabilityText)
          ? "out_of_stock"
          : "unknown",
    notes: details(record),
    source: "bright_data",
    confidence: 0.97,
    checked_at: new Date().toISOString(),
    warning:
      "Details were imported from Bright Data. Confirm the selected variant, seller, delivery location, and final checkout price.",
  };
}

export async function getBrightDataProduct(
  requestedUrl: string,
): Promise<ExtractedProduct | null> {
  const apiKey = process.env.BRIGHT_DATA_API_KEY;
  if (!apiKey) return null;
  const url = new URL(requestedUrl);
  const datasetId = datasetFor(url.hostname);
  if (!datasetId) return null;
  const asin =
    requestedUrl.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i)?.[1] ?? "";
  const input: Json = { url: requestedUrl };
  if (url.hostname.includes("amazon.")) {
    input.asin = asin;
    input.origin_url = requestedUrl;
    input.zipcode = process.env.BRIGHT_DATA_POSTCODE || "";
    input.language = "";
  }
  const endpoint = new URL("https://api.brightdata.com/datasets/v3/scrape");
  endpoint.searchParams.set("dataset_id", datasetId);
  endpoint.searchParams.set("include_errors", "true");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([input]),
    cache: "no-store",
    signal: AbortSignal.timeout(55_000),
  });
  if (response.status === 202)
    throw new Error("Bright Data is still processing this product.");
  if (!response.ok)
    throw new Error(`Bright Data returned HTTP ${response.status}.`);
  return normalizeBrightDataProduct(await response.json(), requestedUrl);
}
