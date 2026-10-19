import { currentPrice, priceDrop, type Item } from "./types";
export type QueryResult = {
  items: Item[];
  answer: string;
  filters: string[];
  total: number;
  savings: number;
};
/** Bounded natural-language filtering. It never generates SQL or sends private items to a model. */
export function queryWishlist(
  query: string,
  items: Item[],
  userId?: string,
): QueryResult {
  const q = query.toLowerCase().trim();
  const filters: string[] = [];
  let result = [...items];
  const amount = (raw: string) => Number(raw.replace(/,/g, ""));
  const under = q.match(
    /(?:under|below|less than|up to|within|budget(?: of)?)\s*(?:rs\.?|inr|₹)?\s*([\d,]+(?:\.\d+)?)\s*(k|thousand|lakh)?/,
  );
  const over = q.match(
    /(?:over|above|more than)\s*(?:rs\.?|inr|₹)?\s*([\d,]+(?:\.\d+)?)\s*(k|thousand|lakh)?/,
  );
  const scaled = (m: RegExpMatchArray) =>
    amount(m[1]) * (m[2] === "lakh" ? 100000 : m[2] ? 1000 : 1);
  if (under) {
    const n = scaled(under);
    result = result.filter(
      (i) =>
        i.currency.trim() === "INR" &&
        currentPrice(i) != null &&
        currentPrice(i)! <= n,
    );
    filters.push(`Under ₹${n.toLocaleString("en-IN")}`);
  }
  if (over) {
    const n = scaled(over);
    result = result.filter(
      (i) =>
        i.currency.trim() === "INR" &&
        currentPrice(i) != null &&
        currentPrice(i)! > n,
    );
    filters.push(`Over ₹${n.toLocaleString("en-IN")}`);
  }
  if (
    /price drop|got cheaper|dropped|cheaper than|discount|on sale|savings/.test(
      q,
    )
  ) {
    result = result.filter((i) => priceDrop(i) > 0);
    filters.push("Price dropped");
  }
  if (/high priority|must.?have|most want/.test(q)) {
    result = result.filter((i) => i.priority === "high");
    filters.push("High priority");
  } else if (/low priority/.test(q)) {
    result = result.filter((i) => i.priority === "low");
    filters.push("Low priority");
  }
  if (
    /purchased|already bought/.test(q) &&
    !/not purchased|haven.t purchased/.test(q)
  ) {
    result = result.filter((i) => i.status === "purchased");
    filters.push("Purchased");
  } else if (/not purchased|not bought|still want|haven.t purchased/.test(q)) {
    result = result.filter((i) => i.status !== "purchased");
    filters.push("Not purchased");
  }
  if (/considering/.test(q)) {
    result = result.filter((i) => i.status === "considering");
    filters.push("Considering");
  }
  if (/added by me|i added/.test(q) && userId) {
    result = result.filter((i) => i.added_by === userId);
    filters.push("Added by you");
  }
  if (/this month/.test(q)) {
    const now = new Date();
    result = result.filter(
      (i) =>
        new Date(i.created_at).getMonth() === now.getMonth() &&
        new Date(i.created_at).getFullYear() === now.getFullYear(),
    );
    filters.push("Saved this month");
  }
  const groups: Record<string, string[]> = {
    Electronics: [
      "electronics",
      "headphones",
      "earbuds",
      "earphones",
      "laptop",
      "phone",
      "camera",
      "speaker",
      "headset",
      "audio",
    ],
    Fashion: [
      "fashion",
      "shoes",
      "sneakers",
      "clothes",
      "clothing",
      "jacket",
      "dress",
      "shirt",
    ],
    "Home & living": ["home", "furniture", "decor", "lamp", "chair"],
    Beauty: ["beauty", "skincare", "makeup", "perfume"],
    Books: ["books", "book", "novel"],
    Gaming: ["gaming", "console", "controller"],
    Fitness: ["fitness", "gym", "yoga"],
  };
  let categoryMatched = false;
  for (const [category, words] of Object.entries(groups)) {
    if (words.some((w) => new RegExp(`\\b${w}\\b`).test(q))) {
      result = result.filter(
        (i) =>
          (i.category ?? "").toLowerCase() === category.toLowerCase() ||
          words.some((w) => i.product_name.toLowerCase().includes(w)),
      );
      filters.push(category);
      categoryMatched = true;
      break;
    }
  }
  const retailers = ["amazon", "flipkart", "myntra", "ajio", "nykaa", "croma"];
  for (const retailer of retailers)
    if (q.includes(retailer)) {
      result = result.filter((i) =>
        i.retailer?.toLowerCase().includes(retailer),
      );
      filters.push(retailer);
    }
  if (/cheapest|least expensive|lowest price/.test(q)) {
    result.sort(
      (a, b) => (currentPrice(a) ?? Infinity) - (currentPrice(b) ?? Infinity),
    );
    filters.push("Lowest price first");
  } else if (/most expensive|highest price/.test(q)) {
    result.sort((a, b) => (currentPrice(b) ?? -1) - (currentPrice(a) ?? -1));
    filters.push("Highest price first");
  } else if (/recent|newest|latest/.test(q))
    result.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  let remaining = q;
  for (const match of [under?.[0], over?.[0]])
    if (match) remaining = remaining.replace(match, " ");
  remaining = remaining.replace(
    /price drop(?:ped|s)?|got cheaper|cheaper than|high priority|low priority|must.?haves?|most want|not purchased|not bought|still want|haven.t purchased|already bought|added by me|i added|this month|on sale|lowest price|highest price|least expensive|most expensive/g,
    " ",
  );
  const generic = new Set([
    "show",
    "list",
    "what",
    "how",
    "give",
    "find",
    "all",
    "my",
    "our",
    "wishlist",
    "shelf",
    "items",
    "things",
    "products",
    "total",
    "cost",
    "budget",
    "much",
    "everything",
    "saved",
    "are",
    "is",
    "the",
    "in",
    "on",
    "of",
    "do",
    "i",
    "have",
    "and",
    "me",
    "you",
    "can",
    "please",
    "cheapest",
    "recent",
    "recently",
    "newest",
    "latest",
    "purchased",
    "considering",
    "discount",
    "savings",
    "price",
    "from",
    "that",
    "a",
    "an",
    "which",
    "has",
    "for",
    "than",
    "with",
    "been",
    "dropped",
    "drops",
  ]);
  const broadCategories = new Set([
    "electronics",
    "fashion",
    "home",
    "living",
    "beauty",
    "books",
    "gaming",
    "fitness",
  ]);
  const words = remaining
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter(
      (w) =>
        w.length > 1 &&
        !generic.has(w) &&
        !broadCategories.has(w) &&
        !retailers.includes(w),
    );
  if (words.length) {
    const aliases: Record<string, string[]> = {
      headphones: ["headphones", "headset", "earphones", "earbuds"],
      shoes: ["shoes", "shoe", "sneaker", "sneakers"],
      footwear: [
        "shoes",
        "shoe",
        "sneaker",
        "sneakers",
        "sandals",
        "boots",
        "slippers",
      ],
      sneakers: ["sneaker", "sneakers", "shoes"],
      book: ["book", "novel", "paperback"],
      speakers: ["speaker", "speakers"],
    };
    result = result.filter((i) =>
      words.every((w) => {
        const content =
          `${i.product_name} ${i.brand ?? ""} ${i.category ?? ""} ${i.notes}`.toLowerCase();
        return (aliases[w] ?? [w]).some((term) => content.includes(term));
      }),
    );
    filters.push(`Matching “${words.join(" ")}”`);
  }
  void categoryMatched;
  const inr = result.filter((i) => i.currency.trim() === "INR");
  const total = inr.reduce((sum, i) => sum + (currentPrice(i) ?? 0), 0);
  const savings = inr.reduce((sum, i) => sum + priceDrop(i), 0);
  const known = inr.filter((i) => currentPrice(i) != null).length;
  const isTotal = /total|cost|how much|budget/.test(q);
  const answer =
    result.length === 0
      ? "No matching wishes yet. Try a wider budget, a category, or a product name."
      : isTotal
        ? `${result.length} matching ${result.length === 1 ? "wish" : "wishes"}. The ${known} priced in INR total ₹${total.toLocaleString("en-IN")}.`
        : `Found ${result.length} ${result.length === 1 ? "wish" : "wishes"}${savings > 0 ? `, with ₹${savings.toLocaleString("en-IN")} in price drops since saving` : " on your shelf"}.`;
  return { items: result, answer, filters, total, savings };
}
