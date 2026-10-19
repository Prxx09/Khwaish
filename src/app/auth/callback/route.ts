import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error)
      return NextResponse.redirect(
        new URL(
          request.nextUrl.searchParams.get("recovery") === "1"
            ? "/?recovery=1"
            : "/?auth=complete",
          request.url,
        ),
      );
    console.error("Auth code exchange failed:", error.code);
  }
  return NextResponse.redirect(new URL("/?auth=error", request.url));
}
