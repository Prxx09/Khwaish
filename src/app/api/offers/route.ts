import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorized, apiError } from "@/lib/api";
import { safeUrl } from "@/lib/types";
export async function POST(request: NextRequest) {
  const auth = await authorized("offer_search");
  if (auth.response) return auth.response;
  try {
    const { query } = z
      .object({ query: z.string().trim().min(2).max(240) })
      .parse(await request.json());
    if (!process.env.SERPAPI_API_KEY)
      return NextResponse.json({
        configured: false,
        offers: [],
        message:
          "Open a store search below to compare the same model and variant. Live comparison cards are available when a shopping-data provider is connected.",
      });
    const params = new URLSearchParams({
      engine: "google_shopping",
      q: query,
      gl: "in",
      hl: "en",
      api_key: process.env.SERPAPI_API_KEY,
    });
    const response = await fetch(`https://serpapi.com/search.json?${params}`, {
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
    if (!response.ok)
      throw new Error(
        "Shopping search is temporarily unavailable. Use the store searches below.",
      );
    const body = await response.json();
    const offers = (
      Array.isArray(body.shopping_results) ? body.shopping_results : []
    )
      .slice(0, 10)
      .map((o: Record<string, unknown>) => ({
        title: String(o.title ?? ""),
        retailer: String(o.source ?? ""),
        price: typeof o.extracted_price === "number" ? o.extracted_price : null,
        url: safeUrl(String(o.product_link ?? o.link ?? "")),
        image: safeUrl(String(o.thumbnail ?? "")),
      }))
      .filter((o: { url: string | null }) => o.url);
    return NextResponse.json({
      configured: true,
      offers,
      checked_at: new Date().toISOString(),
      message:
        "Search matches may include different variants. Confirm model, size, seller, and delivery costs on the store page.",
    });
  } catch (error) {
    return apiError(error);
  }
}
