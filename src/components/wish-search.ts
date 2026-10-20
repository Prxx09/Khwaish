import { currentPrice, type Item } from "@/lib/types";

// Local, bounded concept matching. No private wishes leave the browser.
const concepts = [
  [
    "shoes",
    "shoe",
    "sneaker",
    "sneakers",
    "trainer",
    "trainers",
    "footwear",
    "boots",
    "sandals",
    "slippers",
    "loafers",
    "heels",
    "air force",
    "airforce",
    "air max",
    "airmax",
    "air jordan",
    "jordan 1",
    "dunk low",
    "dunk high",
    "pegasus",
    "vomero",
  ],
  [
    "headphones",
    "headphone",
    "headset",
    "earphones",
    "earphone",
    "earbuds",
    "earbud",
    "airpods",
  ],
  ["watch", "watches", "wristwatch", "timepiece"],
  ["phone", "phones", "smartphone", "smartphones", "iphone", "mobile"],
  ["laptop", "laptops", "notebook", "macbook"],
  ["television", "televisions", "tv", "tvs"],
  ["bag", "bags", "backpack", "backpacks", "rucksack", "handbag", "tote"],
  ["shirt", "shirts", "tshirt", "tee", "tees", "t shirt"],
  ["jacket", "jackets", "outerwear", "coat", "coats"],
  ["trousers", "pants", "jeans", "denim"],
  ["book", "books", "novel", "novels", "paperback", "hardcover"],
  ["sofa", "sofas", "couch", "couches"],
  ["perfume", "perfumes", "fragrance", "fragrances", "cologne"],
  ["grey", "gray"],
];
const filler = new Set(
  "show find search me my our the a an all wish wishes product products item items please for of with and".split(
    " ",
  ),
);
const normalize = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

function nearby(a: string, b: string) {
  if (a === b) return true;
  if (
    a.length < 4 ||
    b.length < 4 ||
    !/^[a-z]+$/.test(a + b) ||
    Math.abs(a.length - b.length) > 1
  )
    return false;
  if (a.length === b.length) {
    const different = [...a]
      .map((c, i) => (c === b[i] ? -1 : i))
      .filter((i) => i >= 0);
    return (
      different.length === 1 ||
      (different.length === 2 &&
        different[1] === different[0] + 1 &&
        a[different[0]] === b[different[1]] &&
        a[different[1]] === b[different[0]])
    );
  }
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  let i = 0;
  while (i < short.length && short[i] === long[i]) i++;
  return short.slice(i) === long.slice(i + 1);
}

function productText(item: Item) {
  const paths = [item.product_url, item.canonical_url].map((value) => {
    if (!value) return "";
    try {
      return decodeURIComponent(new URL(value).pathname);
    } catch {
      return "";
    }
  });
  return normalize(
    [
      item.product_name,
      item.brand,
      item.category,
      item.notes,
      item.retailer,
      item.variant,
      item.product_code,
      ...paths,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

/** Compile once per query, then apply only to the caller's already-authorized scope. */
export function createWishMatcher(
  query: string,
  smart = true,
): (item: Item) => boolean {
  const exact = normalize(query);
  if (!exact) return () => true;
  if (!smart) return (item) => productText(item).includes(exact);
  const budget = query
    .toLowerCase()
    .match(
      /\b(under|below|within|over|above)\s*(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d+)?)\s*(k|thousand|lakh)?\b/,
    );
  const limit = budget
    ? Number(budget[2].replaceAll(",", "")) *
      (budget[3] === "lakh" ? 100000 : budget[3] ? 1000 : 1)
    : null;
  const terms = normalize(budget ? query.replace(budget[0], " ") : query)
    .split(/\s+/)
    .filter((w) => w && !filler.has(w));
  const groups = terms.map((term) =>
    concepts.filter((group) =>
      group.some(
        (alias) =>
          alias === term ||
          (term.length >= 3 && alias.startsWith(term)) ||
          nearby(term, alias),
      ),
    ),
  );
  return (item) => {
    if (limit != null) {
      const price = currentPrice(item);
      if (
        item.currency.trim() !== "INR" ||
        price == null ||
        (/over|above/.test(budget![1]) ? price <= limit : price > limit)
      )
        return false;
    }
    const text = productText(item);
    const tokens = text.split(" ");
    const contains = (term: string, prefix = true) =>
      term.includes(" ")
        ? ` ${text} `.includes(` ${term} `)
        : tokens.some(
            (token) =>
              token === term ||
              (prefix && term.length >= 2 && token.startsWith(term)),
          );
    return terms.every((term, index) =>
      groups[index].length
        ? groups[index].some((group) =>
            group.some((alias) => contains(alias, false)),
          ) || tokens.includes(term)
        : contains(term) || tokens.some((token) => nearby(term, token)),
    );
  };
}
