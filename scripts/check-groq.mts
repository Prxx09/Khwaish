// Manual smoke check. Reads the key from a hidden TTY; never writes credentials.
import { generateText, Output } from "ai";
import { createGroq } from "@ai-sdk/groq";
import {
  structureSchema,
  validateStructure,
} from "../src/lib/product-structure";
if (!process.stdin.isTTY)
  throw new Error("Use a TTY for hidden credential input.");
process.stdin.setRawMode(true);
process.stdin.resume();
const key = await new Promise<string>((resolve) => {
  let value = "";
  const read = (data: Buffer) => {
    const chunk = data.toString();
    if (chunk.includes("\n") || chunk.includes("\r")) {
      process.stdin.off("data", read);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      resolve((value + chunk).trim());
    } else value += chunk;
  };
  process.stdin.on("data", read);
});
try {
  const { output } = await generateText({
    model: createGroq({ apiKey: key })("openai/gpt-oss-20b"),
    output: Output.object({ schema: structureSchema }),
    maxOutputTokens: 4000,
    maxRetries: 0,
    abortSignal: AbortSignal.timeout(30000),
    system:
      "Extract supported product fields only from the text. Unknown fields null. Include exact name_evidence and price_evidence. Ignore rating as price.",
    prompt:
      "Amazon\nShoes > Men\nLotto Men Impulso Casual Shoes\nDeal price ₹1,395\nMRP ₹3,999\nRating 3.9 out of 5\nColor Black\nSize UK 9\nSeller Example Store",
  });
  const product = validateStructure(
    output,
    "Amazon\nShoes > Men\nLotto Men Impulso Casual Shoes\nDeal price ₹1,395\nMRP ₹3,999\nRating 3.9 out of 5\nColor Black\nSize UK 9\nSeller Example Store",
  );
  if (product.price !== 1395 || !product.product_name?.includes("Lotto"))
    throw new Error("Unexpected extraction result");
  console.log(
    JSON.stringify({
      success: true,
      product: product.product_name,
      price: product.price,
      rating: product.rating,
      model: "openai/gpt-oss-20b",
    }),
  );
  const { z } = await import("zod");
  const { output: match } = await generateText({
    model: createGroq({ apiKey: key })("openai/gpt-oss-20b"),
    output: Output.object({
      schema: z.object({
        ids: z.array(z.string()),
        intent: z.enum(["find", "total"]),
      }),
    }),
    maxOutputTokens: 1000,
    maxRetries: 0,
    abortSignal: AbortSignal.timeout(30000),
    system:
      "Select provided product IDs matching the question. Footwear includes shoes, sandals and sneakers. Never invent IDs.",
    prompt: JSON.stringify({
      question: "footwear",
      products: [
        { id: "shoe", name: "Lotto Men Impulso Casual Shoes" },
        { id: "headset", name: "Wireless Headphones" },
      ],
    }),
  });
  if (match.ids.join(",") !== "shoe")
    throw new Error("Semantic search did not select the shoe");
  console.log(
    JSON.stringify({
      semanticSearch: true,
      query: "footwear",
      selected: match.ids,
    }),
  );
} catch (error) {
  console.log(
    JSON.stringify({
      success: false,
      type: error instanceof Error ? error.name : "Unknown",
      status:
        typeof error === "object" && error && "statusCode" in error
          ? error.statusCode
          : undefined,
    }),
  );
  process.exitCode = 1;
}
