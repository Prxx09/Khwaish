import test from "node:test";
import assert from "node:assert/strict";
import {
  structureSchema,
  validateStructure,
  structureNotes,
} from "../src/lib/product-structure";
const candidate = () =>
  structureSchema.parse({
    product_name: "Lotto Men Impulso Casual Shoes",
    name_evidence: "Lotto Men Impulso Casual Shoes",
    brand: "Lotto",
    retailer: "Amazon",
    category: "Fashion",
    price: 1395,
    price_evidence: "Price ₹1,395",
    currency: "INR",
    mrp: 3999,
    rating: 3.9,
    review_count: null,
    product_code: null,
    model: "Impulso",
    color: null,
    size: null,
    material: null,
    capacity: null,
    seller: null,
    availability: "unknown",
    product_url: "https://invented.example/product",
    attributes: [
      { label: "Closure", value: "Lace-up", evidence: "Closure Lace-up" },
    ],
    warnings: [],
  });
test("AI extraction keeps grounded title and price, drops invented URLs and unsupported attributes", () => {
  const product = validateStructure(
    candidate(),
    "Lotto Men Impulso Casual Shoes\nPrice ₹1,395\nRating 3.9\nMRP ₹3,999",
  );
  assert.equal(product.price, 1395);
  assert.ok(product.product_name);
  assert.equal(product.product_url, null);
  assert.deepEqual(product.attributes, []);
  assert.match(structureNotes(product), /Rating \/ 5: 3.9/);
});
test("AI extraction rejects unsupported title and rating as a selling price", () => {
  const product = validateStructure(
    { ...candidate(), price: 3.9, price_evidence: "Rating 3.9 out of 5" },
    "Rating 3.9 out of 5",
  );
  assert.equal(product.product_name, null);
  assert.equal(product.price, null);
  assert.ok(product.warnings.length >= 2);
});
test("AI extraction bounds response fields and rejects invalid monetary values", () => {
  assert.throws(() => structureSchema.parse({ ...candidate(), price: -1 }));
  assert.throws(() =>
    structureSchema.parse({ ...candidate(), currency: "invalid" }),
  );
});
