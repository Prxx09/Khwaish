import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorized, apiError } from "@/lib/api";
import { getProductMetadata } from "@/lib/product-metadata";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  const auth = await authorized("price_refresh");
  if (auth.response) return auth.response;
  try {
    const { itemId } = z
      .object({ itemId: z.uuid() })
      .parse(await request.json());
    const { data: item, error } = await auth.client
      .from("wishlist_items")
      .select("id,product_url,currency,product_code")
      .eq("id", itemId)
      .single();
    if (error || !item)
      return NextResponse.json(
        { error: "Item not found or you do not have access." },
        { status: 404 },
      );
    if (!item.product_url)
      throw new Error("Add a product link before checking its current price.");
    const metadata = await getProductMetadata(item.product_url);
    if (metadata.price == null)
      throw new Error(
        "The store is not providing a readable current price. Your saved price has been kept.",
      );
    if (metadata.currency !== item.currency.trim())
      throw new Error(
        "The store returned a different currency. The saved comparison has not been changed.",
      );
    if (
      item.product_code &&
      metadata.product_code &&
      item.product_code.toLowerCase() !== metadata.product_code.toLowerCase()
    )
      throw new Error(
        "The product code changed. Review the product page before comparing prices.",
      );
    const { data, error: insertError } = await auth.client
      .from("price_observations")
      .insert({
        wishlist_item_id: itemId,
        price: metadata.price,
        currency: metadata.currency,
        availability: metadata.availability,
        source: metadata.source,
        source_url: metadata.product_url,
        observed_at: metadata.checked_at,
        created_by: auth.user.id,
      })
      .select()
      .single();
    if (insertError)
      throw new Error("You need editor access to record a price check.");
    return NextResponse.json(
      { observation: data, metadata },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
