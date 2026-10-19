import { NextResponse } from "next/server";
export async function GET() {
  return NextResponse.json(
    {
      comparison: Boolean(process.env.SERPAPI_API_KEY),
      scheduled: Boolean(
        process.env.CRON_SECRET && process.env.SUPABASE_SECRET_KEY,
      ),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
