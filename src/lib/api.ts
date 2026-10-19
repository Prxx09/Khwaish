import { NextResponse } from "next/server";
import { createClient } from "./supabase/server";
export async function authorized(action: string) {
  const client = await createClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (!user || error)
    return {
      response: NextResponse.json(
        { error: "Please sign in to use this feature." },
        { status: 401 },
      ),
    };
  const budget = await client.rpc("consume_request_budget", {
    action_name: action,
  });
  if (budget.error) {
    console.error("Rate budget unavailable", budget.error.code);
    return {
      response: NextResponse.json(
        { error: "This feature is temporarily unavailable." },
        { status: 503 },
      ),
    };
  }
  if (!budget.data)
    return {
      response: NextResponse.json(
        { error: "You have reached the hourly limit. Please try again later." },
        { status: 429 },
      ),
    };
  return { client, user };
}
export function apiError(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
) {
  const message = error instanceof Error ? error.message : fallback;
  console.error("Request failed:", message.slice(0, 300));
  return NextResponse.json({ error: message }, { status: 422 });
}
