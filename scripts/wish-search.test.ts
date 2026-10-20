import assert from "node:assert/strict";
import test from "node:test";
import { createWishMatcher } from "../src/components/wish-search";
import type { Item } from "../src/lib/types";

const wish = (data: Partial<Item>): Item =>
  ({
    product_name: "",
    notes: "",
    currency: "INR",
    price_observations: [],
    initial_price: 4999,
    ...data,
  }) as Item;
const nike = wish({
  product_name: "Nike Air Force 1 '07",
  brand: "Nike",
  category: "Fashion",
});
const sneaker = wish({
  product_name: "Everyday sneaker",
  variant: "University red · UK 9",
});
const shirt = wish({
  product_name: "Nike cotton shirt",
  brand: "Nike",
  category: "Fashion",
});

test("shoe concept finds Nike model names and sneakers without including every Fashion wish", () => {
  for (const query of [
    "shoes",
    "shoe",
    "sho",
    "footwear",
    "trainers",
    "snekaers",
    "show my shoes",
  ]) {
    const match = createWishMatcher(query);
    assert.equal(match(nike), true, query);
    assert.equal(match(sneaker), true, query);
    assert.equal(match(shirt), false, query);
    assert.equal(
      match(wish({ product_name: "Cotton shirt", notes: "Size as shown" })),
      false,
      query,
    );
  }
});
test("multiple concepts and brand constraints are ANDed; minor typos are bounded", () => {
  assert.equal(createWishMatcher("nike shoes")(nike), true);
  assert.equal(createWishMatcher("adidas shoes")(nike), false);
  assert.equal(createWishMatcher("nik shoes")(nike), true);
  assert.equal(createWishMatcher("nkie shoes")(nike), true);
  assert.equal(createWishMatcher("unrelatedxyz")(nike), false);
  assert.equal(createWishMatcher("xyz")(nike), false);
});
test("search uses saved URL paths, retailer, variant and product code", () => {
  const hidden = wish({
    product_name: "Saved product",
    product_url:
      "https://shop.example/men%2Frunning-shoes?recommendation=watch",
    retailer: "Myntra",
    variant: "Blue · UK 9",
    product_code: "AB-123",
  });
  for (const query of ["shoes", "myntra", "blue", "AB-123"])
    assert.equal(createWishMatcher(query)(hidden), true);
  assert.equal(createWishMatcher("watch")(hidden), false);
  assert.equal(
    createWishMatcher("shoes")(
      wish({ product_name: "Unknown", product_url: "not a url" }),
    ),
    false,
  );
});
test("exact mode, whitespace, punctuation, case and accents stay predictable", () => {
  assert.equal(createWishMatcher("shoes", false)(nike), false);
  assert.equal(createWishMatcher("NIKE AIR FORCE", false)(nike), true);
  assert.equal(createWishMatcher("   ")(nike), true);
  assert.equal(
    createWishMatcher("cafe")(wish({ product_name: "Café chair" })),
    true,
  );
});
test("natural budgets use latest matching INR prices and exclude unknown/other currencies", () => {
  assert.equal(createWishMatcher("shoes under ₹5k")(nike), true);
  assert.equal(createWishMatcher("shoes below 4,000")(nike), false);
  assert.equal(createWishMatcher("shoes above 5k")(nike), false);
  assert.equal(
    createWishMatcher("shoes under 5k")({ ...nike, currency: "USD" }),
    false,
  );
  assert.equal(
    createWishMatcher("shoes under 5k")({ ...nike, initial_price: null }),
    false,
  );
  assert.equal(
    createWishMatcher("shoes under 5k")({
      ...nike,
      price_observations: [
        {
          price: 6000,
          currency: "INR",
          observed_at: "2026-10-20",
        } as Item["price_observations"][number],
      ],
    }),
    false,
  );
});
