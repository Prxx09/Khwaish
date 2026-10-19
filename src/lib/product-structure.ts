import { z } from "zod";
import { CATEGORIES, safeUrl } from "./types";
const text = z.string().max(500).nullable();
const amount = z.number().min(0).max(100000000).nullable();
export const structureSchema = z.object({
  product_name: text,
  name_evidence: z.string().max(700),
  brand: text,
  retailer: text,
  category: z.enum(CATEGORIES as [string, ...string[]]),
  price: amount,
  price_evidence: z.string().max(700),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .nullable(),
  mrp: amount,
  rating: z.number().min(0).max(5).nullable(),
  review_count: z.number().int().min(0).nullable(),
  product_code: text,
  model: text,
  color: text,
  size: text,
  material: text,
  capacity: text,
  seller: text,
  availability: z.enum(["in_stock", "out_of_stock", "unknown"]),
  product_url: text,
  attributes: z
    .array(
      z.object({
        label: z.string().max(80),
        value: z.string().max(500),
        evidence: z.string().max(700),
      }),
    )
    .max(25),
  warnings: z.array(z.string().max(300)).max(8),
});
export type StructuredProduct = z.infer<typeof structureSchema>;
const normalize = (value: string) =>
  value.replace(/\s+/g, " ").trim().toLowerCase();
/** Discard invented key evidence; an LLM response alone never verifies a price. */
export function validateStructure(product: StructuredProduct, ocr: string) {
  const input = normalize(ocr);
  const hasEvidence = (quote: string) =>
    !!quote.trim() && input.includes(normalize(quote));
  const warnings = [...product.warnings];
  let name = product.product_name;
  if (!hasEvidence(product.name_evidence)) {
    name = null;
    warnings.push("Product title needs manual confirmation.");
  }
  let price = product.price;
  const numbers = (
    product.price_evidence.match(/\d[\d,]*(?:\.\d+)?/g) ?? []
  ).map((value) => Number(value.replaceAll(",", "")));
  if (
    !hasEvidence(product.price_evidence) ||
    price == null ||
    !numbers.includes(price) ||
    /\b(?:ratings?|stars?|out of 5|emi|per month|cashback|delivery fee|shipping fee)\b/i.test(
      product.price_evidence,
    )
  ) {
    price = null;
    warnings.push("Selling price needs manual confirmation.");
  }
  const url =
    product.product_url && input.includes(normalize(product.product_url))
      ? safeUrl(product.product_url)
      : null;
  const attributes = product.attributes.filter((attribute) =>
    hasEvidence(attribute.evidence),
  );
  return {
    ...product,
    product_name: name,
    price,
    product_url: url,
    attributes,
    warnings,
  };
}

export function structureNotes(product: StructuredProduct) {
  const details: [string, unknown][] = [
    ["MRP", product.mrp],
    ["Rating / 5", product.rating],
    ["Review count", product.review_count],
    ["Seller", product.seller],
    ["Material", product.material],
    ...product.attributes.map((a): [string, unknown] => [a.label, a.value]),
  ];
  return [
    ...new Set(
      details
        .filter(([, value]) => value != null && value !== "")
        .map(([label, value]) => `${label}: ${value}`),
    ),
  ].join("\n");
}
