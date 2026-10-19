import test from "node:test";
import assert from "node:assert/strict";
import { parseOcrProduct } from "../src/lib/ocr-product";

test("OCR excludes breadcrumbs and ratings from title and price", () => {
  const result = parseOcrProduct(
    "Amazon\nShoes & Handbags > Shoes > Men's Shoes > Casual Shoes\nLotto Men Impulso Casual Shoes\n3.9 out of 5 stars\n₹3.9 ratings\n₹1,395\nMRP ₹3,999\nDelivery ₹40",
  );
  assert.equal(result.productName, "Lotto Men Impulso Casual Shoes");
  assert.equal(result.price, "1395");
  assert.equal(result.category, "Fashion");
});
test("OCR leaves multiple unlabelled prices unresolved", () => {
  const result = parseOcrProduct(
    "Sony Wireless Headphones\n₹2,999\n₹1,999\nSave ₹100\nEMI ₹300 per month",
  );
  assert.equal(result.price, "");
  assert.deepEqual(result.priceCandidates, [2999, 1999]);
});
test("OCR prefers an explicitly labelled sale price and keeps cheap products valid", () => {
  assert.equal(
    parseOcrProduct("Cotton Shirt White\n₹899\nDeal price: ₹599").price,
    "599",
  );
  assert.equal(parseOcrProduct("Decorative Paper Stars\n₹3.90").price, "3.9");
});
test("OCR does not invent a product from navigation or bare digits", () => {
  const result = parseOcrProduct(
    "Home > Electronics\nSearch Amazon\n4.5 out of 5 stars\n256 GB\n12999\nFree delivery",
  );
  assert.equal(result.productName, "");
  assert.equal(result.price, "");
});

test("Repeated amounts retain their strongest selling-price evidence", () => {
  assert.equal(parseOcrProduct("Wireless Headphones\nDeal price ₹599\n₹599\n₹899").price, "599");
});
