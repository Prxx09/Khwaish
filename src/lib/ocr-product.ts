/** Conservative local interpretation: missing evidence stays unknown. */
export function parseOcrProduct(text: string) {
  const lines = text
    .normalize("NFKC")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const navigation =
    /[>›»]|\b(home|cart|wishlist|sign in|search|customer reviews|ratings?|delivery|shipping|cashback|coupon|bank offer|add to|buy now|visit the|about this item|frequently bought|sponsored|recommend|similar items)\b/i;
  const productWords =
    /\b(shoes?|sneakers?|headphones?|earbuds?|phone|iphone|galaxy|laptop|watch|shirt|dress|camera|chair|bag|impulso|running|casual|wireless|cotton|leather)\b/i;
  const names = lines
    .map((line, index) => {
      let score = 0;
      if (
        line.length < 8 ||
        line.length > 240 ||
        navigation.test(line) ||
        /https?:|www\.|₹|\b(?:rs\.?|inr|mrp|price|off|save)\b|\d\s*%/i.test(
          line,
        )
      )
        return { line, score: -100 };
      if ((line.match(/[a-z]/gi)?.length ?? 0) < 6)
        return { line, score: -100 };
      score += line.split(" ").length >= 3 ? 3 : 1;
      if (productWords.test(line)) score += 4;
      if (/\b(?:gb|tb|wh-\w+|[a-z]+\d{2,})\b/i.test(line)) score += 2;
      if (/\b(?:men|women|unisex|black|white|blue|red)\b/i.test(line)) score++;
      if (
        /\b(?:inclusive|tax|available|select|size chart|details|description|return|order|payment|bestseller)\b/i.test(
          line,
        )
      )
        score -= 6;
      score -= index / Math.max(lines.length, 1);
      return { line, score };
    })
    .filter((candidate) => candidate.score >= 3)
    .sort((a, b) => b.score - a.score);

  const prices: { value: number; score: number }[] = [];
  for (const line of lines) {
    // A currency marker is required. Bare ratings, sizes and model numbers are never prices.
    for (const match of line.matchAll(
      /(?:₹|\bRs\.?|\bINR)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)(?![0-9.])/gi,
    )) {
      const value = Number(match[1].replaceAll(",", ""));
      const after = line.slice((match.index ?? 0) + match[0].length).trim();
      if (
        !Number.isFinite(value) ||
        value <= 0 ||
        value > 100000000 ||
        /^%|^(?:out of|stars?|ratings?)\b/i.test(after)
      )
        continue;
      if (
        /\b(?:delivery|shipping|cashback|coupon|emi|per month|bank offer|save|savings|off|mrp|m\.?r\.?p\.?|list price|original price)\b/i.test(
          line,
        )
      )
        continue;
      const score =
        /\b(?:sale price|deal price|our price|offer price|price|now)\b/i.test(
          line,
        )
          ? 3
          : 1;
      prices.push({ value, score });
    }
  }
  const unique = [
    ...new Map(
      prices.sort((a, b) => a.score - b.score).map((p) => [p.value, p]),
    ).values(),
  ].sort((a, b) => b.score - a.score);
  const chosen =
    unique.length === 1 || (unique[0]?.score ?? 0) > (unique[1]?.score ?? 0)
      ? unique[0]?.value
      : undefined;
  const warnings: string[] = [];
  if (!names.length)
    warnings.push("Product title could not be identified safely.");
  if (chosen === undefined)
    warnings.push(
      unique.length
        ? "Several prices were found. Choose the selling price."
        : "No reliable selling price found. Enter it manually.",
    );
  const retailer = /amazon/i.test(text)
    ? "Amazon"
    : /flipkart/i.test(text)
      ? "Flipkart"
      : /myntra/i.test(text)
        ? "Myntra"
        : "";
  const productName = names[0]?.line ?? "";
  const category =
    /\b(shoes?|sneakers?|shirt|dress|cotton|leather|handbags?)\b/i.test(
      productName,
    )
      ? "Fashion"
      : /\b(phone|iphone|galaxy|headphones?|earbuds?|laptop|camera)\b/i.test(
            productName,
          )
        ? "Electronics"
        : "Other";
  return {
    productName,
    price: chosen === undefined ? "" : String(chosen),
    priceCandidates: unique.map((p) => p.value),
    retailer,
    category,
    url: text.match(/https?:\/\/[^\s<>]+/)?.[0] ?? "",
    warnings,
  };
}

/** Upscale small text while bounding memory use on phones. No image leaves the browser. */
export async function prepareOcrImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(
      2,
      Math.sqrt(6_000_000 / (bitmap.width * bitmap.height)),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve) =>
      canvas.toBlob((blob) => resolve(blob ?? file), "image/png"),
    );
  } finally {
    bitmap.close();
  }
}
