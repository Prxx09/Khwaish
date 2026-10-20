import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import ipaddr from "ipaddr.js";
import * as cheerio from "cheerio";
import type { ExtractedProduct } from "./types";

export function isPublicAddress(address: string) {
  try {
    return ipaddr.process(address).range() === "unicast";
  } catch {
    return false;
  }
}
export function validateProductUrl(value: string) {
  const url = new URL(value);
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !["80", "443"].includes(url.port))
  )
    throw new Error(
      "Please use a public shopping link with no login credentials.",
    );
  if (
    url.hostname === "localhost" ||
    url.hostname.endsWith(".localhost") ||
    url.hostname.endsWith(".local") ||
    url.hostname.endsWith(".internal")
  )
    throw new Error("Only public product pages are supported.");
  url.hash = "";
  return url;
}

/** Resolve and pin the public IP for every redirect, preventing DNS-rebinding SSRF. */
export async function fetchPublicPage(
  value: string,
  redirects = 0,
): Promise<{ html: string; url: string }> {
  if (redirects > 4)
    throw new Error(
      "This link redirected too many times. Paste the full product page URL.",
    );
  const url = validateProductUrl(value);
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = await lookup(hostname, { all: true });
  if (!addresses.length || addresses.some((a) => !isPublicAddress(a.address)))
    throw new Error("Only public product pages are supported.");
  const address = addresses[0];
  const result = await new Promise<{ html?: string; redirect?: string }>(
    (resolve, reject) => {
      const transport = url.protocol === "https:" ? https : http;
      const request = transport.request(
        url,
        {
          method: "GET",
          family: address.family,
          signal: AbortSignal.timeout(10_000),
          lookup: (_hostname, _options, callback) =>
            callback(null, address.address, address.family),
          headers: {
            "User-Agent": "Khwaish/1.0 (+wishlist product metadata preview)",
            Accept: "text/html,application/xhtml+xml",
            "Accept-Language": "en-IN,en;q=0.9",
            "Accept-Encoding": "identity",
          },
        },
        (response) => {
          if (
            response.statusCode &&
            response.statusCode >= 300 &&
            response.statusCode < 400 &&
            response.headers.location
          ) {
            response.resume();
            resolve({ redirect: new URL(response.headers.location, url).href });
            return;
          }
          if (!response.statusCode || response.statusCode >= 400) {
            response.resume();
            reject(
              new Error(
                "This store is not allowing a product preview right now. You can still save the link and fill in the details.",
              ),
            );
            return;
          }
          if (
            !/text\/html|application\/xhtml\+xml/i.test(
              response.headers["content-type"] ?? "",
            )
          ) {
            response.resume();
            reject(new Error("That link is not a product web page."));
            return;
          }
          let size = 0;
          const chunks: Buffer[] = [];
          response.on("data", (chunk: Buffer) => {
            size += chunk.length;
            if (size > 3_000_000) {
              request.destroy(
                new Error(
                  "The store page is too large to preview. Add the details manually.",
                ),
              );
            } else chunks.push(chunk);
          });
          response.on("end", () =>
            resolve({ html: Buffer.concat(chunks).toString("utf-8") }),
          );
          response.on("error", reject);
        },
      );
      request.setTimeout(10_000, () =>
        request.destroy(
          new Error(
            "The store took too long to respond. Try again or add the details manually.",
          ),
        ),
      );
      request.on("error", reject);
      request.end();
    },
  );
  if (result.redirect) return fetchPublicPage(result.redirect, redirects + 1);
  return { html: result.html ?? "", url: url.href };
}

export function parsePrice(value: unknown): number | null {
  if (typeof value === "number")
    return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value !== "string" || /-\s*[\d.,]/.test(value)) return null;
  const clean = value.replace(/[^\d.,]/g, "").replace(/,/g, "");
  const number = Number(clean);
  return clean && Number.isFinite(number) && number >= 0 ? number : null;
}
type Json = Record<string, unknown>;
function findProduct(value: unknown, depth = 0): Json | null {
  if (!value || depth > 12) return null;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const result = findProduct(entry, depth + 1);
      if (result) return result;
    }
    return null;
  }
  if (typeof value !== "object") return null;
  const record = value as Json;
  if ([record["@type"]].flat().includes("Product")) return record;
  for (const key of ["@graph", "mainEntity", "itemListElement", "item"]) {
    const result = findProduct(record[key], depth + 1);
    if (result) return result;
  }
  return null;
}
function string(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 2000) : "";
}
function absoluteImage(value: string, base: string) {
  try {
    const url = new URL(value, base);
    return ["https:", "http:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}
export function extractProduct(html: string, url: string): ExtractedProduct {
  const $ = cheerio.load(html);
  const meta = (key: string) =>
    $(`meta[property="${key}"], meta[name="${key}"]`)
      .first()
      .attr("content")
      ?.trim() ?? "";
  let product: Json | null = null;
  $('script[type="application/ld+json"]').each((_i, el) => {
    if (product) return;
    try {
      product = findProduct(JSON.parse($(el).text()));
    } catch {
      /* Invalid retailer metadata is ignored. */
    }
  });
  const p = (product ?? {}) as Json;
  const offers = Array.isArray(p.offers)
    ? p.offers
    : p.offers
      ? [p.offers]
      : [];
  const offer = (offers[0] ?? {}) as Json;
  const priceSpec = (offer.priceSpecification ?? {}) as Json;
  const price = parsePrice(
    offer.price ??
      priceSpec.price ??
      (meta("product:price:amount") || meta("og:price:amount")),
  );
  const images = Array.isArray(p.image) ? p.image : p.image ? [p.image] : [];
  const image = images[0];
  const brand =
    typeof p.brand === "object" && p.brand
      ? string((p.brand as Json).name)
      : string(p.brand);
  const name = (string(p.name) || meta("og:title") || $("title").text()).slice(
    0,
    240,
  );
  if (
    !name ||
    /captcha|robot check|access denied|sign in|just a moment/i.test(name)
  )
    throw new Error(
      "This store is showing a verification page. Add the details manually or use a screenshot.",
    );
  const host = new URL(url).hostname.replace(/^www\./, "");
  const retailer = host.includes("amazon.")
    ? "Amazon"
    : host.includes("flipkart.")
      ? "Flipkart"
      : host.includes("myntra.")
        ? "Myntra"
        : host;
  const rawAvailability = string(offer.availability);
  const currency = (
    string(offer.priceCurrency) ||
    meta("product:price:currency") ||
    "INR"
  ).toUpperCase();
  return {
    product_name: name,
    product_url: url,
    image_url: absoluteImage(
      typeof image === "object" && image
        ? string((image as Json).url)
        : string(image) || meta("og:image"),
      url,
    ),
    price,
    currency: /^[A-Z]{3}$/.test(currency) ? currency : "INR",
    retailer,
    brand,
    category: string(p.category),
    product_code:
      string(p.sku) ||
      string(p.mpn) ||
      string(p.gtin13) ||
      url.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i)?.[1] ||
      new URL(url).searchParams.get("pid") ||
      "",
    variant: [string(p.color), string(p.size)].filter(Boolean).join(" · "),
    availability: /OutOfStock|Discontinued|SoldOut/i.test(rawAvailability)
      ? "out_of_stock"
      : /InStock|LimitedAvailability/i.test(rawAvailability)
        ? "in_stock"
        : "unknown",
    source: product ? "structured_product_data" : "page_metadata",
    confidence: product ? 0.94 : 0.65,
    checked_at: new Date().toISOString(),
    ...(price == null
      ? {
          warning:
            "The store did not publish a readable price. You can enter one before saving.",
        }
      : {}),
  };
}
export async function getProductMetadata(url: string) {
  const page = await fetchPublicPage(url);
  return extractProduct(page.html, page.url);
}
