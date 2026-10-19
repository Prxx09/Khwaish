import test from "node:test";
import assert from "node:assert/strict";
import {
  extractProduct,
  isPublicAddress,
  parsePrice,
  validateProductUrl,
} from "../src/lib/product-metadata";
import { queryWishlist } from "../src/lib/query";
import { demoItems } from "../src/lib/demo-data";
import { safeUrl, latestPrice, priceDrop } from "../src/lib/types";

test("blocks private, loopback, link-local, IPv4-mapped loopback and credentials", () => {
  for (const ip of [
    "127.0.0.1",
    "10.0.0.1",
    "172.16.1.2",
    "192.168.0.1",
    "169.254.169.254",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "0.0.0.0",
  ])
    assert.equal(isPublicAddress(ip), false, ip);
  assert.equal(isPublicAddress("8.8.8.8"), true);
  assert.throws(() => validateProductUrl("file:///etc/passwd"));
  assert.throws(() => validateProductUrl("https://user:password@shop.example"));
  assert.throws(() => validateProductUrl("http://localhost/private"));
  assert.throws(() => validateProductUrl("https://shop.example:8080/p"));
  assert.equal(safeUrl("javascript:alert(1)"), null);
});
test("parses structured product data with SKU, currency and relative stock image", () => {
  const data = extractProduct(
    `<title>Some store</title><script type="application/ld+json">{"@graph":[{"@type":"Product","name":"Camera Model X","sku":"ABC123","brand":{"name":"Photo"},"image":["/camera.jpg"],"offers":{"price":"12,499.50","priceCurrency":"INR","availability":"https://schema.org/InStock"}}]}</script>`,
    "https://shop.example/product",
  );
  assert.equal(data.product_name, "Camera Model X");
  assert.equal(data.price, 12499.5);
  assert.equal(data.product_code, "ABC123");
  assert.equal(data.image_url, "https://shop.example/camera.jpg");
  assert.equal(data.availability, "in_stock");
});
test("OG metadata uses its published price; absent price stays unknown", () => {
  assert.equal(
    extractProduct(
      '<meta property="og:title" content="Lamp"><meta property="og:price:amount" content="799">',
      "https://shop.example",
    ).price,
    799,
  );
  assert.equal(
    extractProduct("<title>Lamp</title>", "https://shop.example").price,
    null,
  );
  assert.throws(() =>
    extractProduct("<title>Robot Check</title>", "https://shop.example"),
  );
  assert.equal(parsePrice("₹1,29,999.00"), 129999);
  assert.equal(parsePrice(""), null);
  assert.equal(parsePrice("-100"), null);
});
test("natural queries combine budget, category and priority without mutating items", () => {
  const items = demoItems();
  const original = items.map((i) => i.id);
  const query = queryWishlist(
    "Show high priority electronics under ₹30,000",
    items,
  );
  assert.equal(query.items.length, 1);
  assert.equal(query.items[0].id, "demo-sony");
  assert.deepEqual(
    items.map((i) => i.id),
    original,
  );
  assert.ok(
    queryWishlist("What got cheaper?", items).items.every(
      (i) => priceDrop(i) > 0,
    ),
  );
  assert.equal(
    queryWishlist("Show electronics under 5k", items).items[0].id,
    "demo-speaker",
  );
  assert.equal(
    queryWishlist("What is the total cost?", items).items.length,
    items.length,
  );
  assert.equal(queryWishlist("Sony under 30k", items).items[0].id, "demo-sony");
  assert.equal(queryWishlist("headphones under 5k", items).items.length, 0);
});
test("prices never compare different currencies", () => {
  const item = demoItems()[0];
  item.price_observations = [
    { ...item.price_observations[0], currency: "USD", price: 10 },
  ];
  assert.equal(latestPrice(item), undefined);
  assert.equal(priceDrop(item), 0);
});
