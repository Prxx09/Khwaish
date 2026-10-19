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
        answer: z.string(),
      }),
    }),
    maxOutputTokens: 1000,
    maxRetries: 0,
    abortSignal: AbortSignal.timeout(30000),
    system:
      "Answer the question in friendly plain text using only saved facts, then select relevant product IDs for attachments. A rating is not a price. State when ratings are missing. Never invent IDs.",
    prompt: JSON.stringify({
      question: "Which is the top rated footwear item? Explain why.",
      products: [
        {
          id: "shoe",
          name: "Lotto Men Impulso Casual Shoes",
          notes: "Rating / 5: 4.4",
        },
        {
          id: "headset",
          name: "Wireless Headphones",
          notes: "Rating / 5: 4.8",
        },
      ],
    }),
  });
  if (match.ids.join(",") !== "shoe")
    throw new Error("Semantic search did not select the shoe");
  if (!match.answer.includes("4.4"))
    throw new Error("Answer omitted the saved shoe rating");
  console.log(
    JSON.stringify({
      semanticSearch: true,
      query: "top rated footwear",
      answer: match.answer,
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
