export type Library = {
  id: string;
  owner_id: string;
  name: string;
  kind: "personal" | "shared";
  created_at: string;
};
export type Profile = {
  id: string;
  display_name: string;
  avatar_path: string | null;
};
export type Member = {
  library_id: string;
  user_id: string;
  role: "owner" | "editor" | "viewer";
  joined_at: string;
  profile?: Profile;
};
export type Price = {
  id: string;
  wishlist_item_id: string;
  price: number | null;
  currency: string;
  availability: string;
  source: string;
  source_url: string | null;
  observed_at: string;
  retailer?: string | null;
};
export type Media = {
  id: string;
  storage_path: string;
  wishlist_item_id: string;
  signed_url?: string;
};
export type Item = {
  id: string;
  library_id: string;
  added_by: string;
  product_name: string;
  product_url: string | null;
  canonical_url: string | null;
  retailer: string | null;
  brand: string | null;
  category: string | null;
  image_url: string | null;
  currency: string;
  initial_price: number | null;
  initial_price_at: string | null;
  priority: "high" | "medium" | "low";
  status: "want" | "considering" | "purchased" | "not_now";
  target_date: string | null;
  target_price: number | null;
  notes: string;
  product_code: string | null;
  tracking_enabled?: boolean;
  last_price_check_at?: string | null;
  variant: string | null;
  extraction_source: string | null;
  created_at: string;
  updated_at: string;
  price_observations: Price[];
  product_media: Media[];
};
export type Comment = {
  id: string;
  wishlist_item_id: string;
  user_id: string;
  body: string;
  created_at: string;
  profile?: Profile;
};
export type ExtractedProduct = {
  product_name: string;
  product_url: string;
  image_url: string;
  price: number | null;
  currency: string;
  retailer: string;
  brand: string;
  category: string;
  product_code: string;
  variant: string;
  availability: string;
  source: string;
  confidence: number;
  checked_at: string;
  warning?: string;
};
export const CATEGORIES = [
  "Electronics",
  "Fashion",
  "Home & living",
  "Beauty",
  "Books",
  "Gaming",
  "Fitness",
  "Other",
];
export const STATUS_LABELS = {
  want: "Wishlisted",
  considering: "Considering",
  purchased: "Purchased",
  not_now: "On pause",
};
export function money(value: number | null | undefined, currency = "INR") {
  if (value == null) return "Price not set";
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString("en-IN")}`;
  }
}
export function latestPrice(item: Item): Price | undefined {
  return [...(item.price_observations ?? [])]
    .filter(
      (p) => p.price != null && p.currency.trim() === item.currency.trim(),
    )
    .sort((a, b) => Date.parse(b.observed_at) - Date.parse(a.observed_at))[0];
}
export function currentPrice(item: Item): number | null {
  return latestPrice(item)?.price ?? item.initial_price;
}
export function priceDrop(item: Item): number {
  const now = currentPrice(item);
  return now != null && item.initial_price != null
    ? Math.max(0, item.initial_price - now)
    : 0;
}
export function safeUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
