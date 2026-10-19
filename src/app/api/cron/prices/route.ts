import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getProductMetadata } from "@/lib/product-metadata";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (
    !expected ||
    Buffer.byteLength(header) !== Buffer.byteLength(`Bearer ${expected}`) ||
    !timingSafeEqual(Buffer.from(header), Buffer.from(`Bearer ${expected}`))
  )
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.SUPABASE_SECRET_KEY)
    return NextResponse.json(
      { error: "Scheduled tracking needs a server-only Supabase key." },
      { status: 503 },
    );
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY,
    { auth: { persistSession: false } },
  );
  // A bounded rotating batch; no request attempts to refresh an entire catalog.
  const { data: items, error } = await supabase
    .from("wishlist_items")
    .select("id,product_url,currency,product_code,last_price_check_at")
    .eq("tracking_enabled", true)
    .not("product_url", "is", null)
    .order("last_price_check_at", { ascending: true, nullsFirst: true })
    .limit(4);
  if (error) {
    console.error("Scheduled price query failed", error.code);
    return NextResponse.json(
      { error: "Tracking query failed" },
      { status: 500 },
    );
  }
  let checked = 0;
  await Promise.all(
    (items ?? []).map(async (item) => {
      try {
        const result = await getProductMetadata(item.product_url);
        if (
          result.price != null &&
          result.currency === item.currency.trim() &&
          (!item.product_code ||
            !result.product_code ||
            result.product_code.toLowerCase() ===
              item.product_code.toLowerCase())
        ) {
          const { error: writeError } = await supabase
            .from("price_observations")
            .insert({
              wishlist_item_id: item.id,
              price: result.price,
              currency: result.currency,
              availability: result.availability,
              source: result.source,
              source_url: result.product_url,
              observed_at: result.checked_at,
            });
          if (!writeError) checked++;
        }
      } catch {
        console.info("Scheduled store fetch unavailable for item", item.id);
      }
      await supabase
        .from("wishlist_items")
        .update({ last_price_check_at: new Date().toISOString() })
        .eq("id", item.id);
    }),
  );
  return NextResponse.json({ checked, attempted: items?.length ?? 0 });
}
