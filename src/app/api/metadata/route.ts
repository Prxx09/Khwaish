import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorized, apiError } from "@/lib/api";
import { getProductMetadata } from "@/lib/product-metadata";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  const auth = await authorized("metadata");
  if (auth.response) return auth.response;
  try {
    const body = z
      .object({ url: z.url().max(3000) })
      .parse(await request.json());
    return NextResponse.json(await getProductMetadata(body.url), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
