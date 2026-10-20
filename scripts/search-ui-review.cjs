/* Guest-only production-browser review; no live account or database writes. */
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const out = process.env.SEARCH_REVIEW_OUTPUT || "/tmp/khwaish-search/review";
const seed = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures/ui-wishes.json")),
);
const report = { contexts: [], errors: [] };
let server, browser;
const origin = "http://127.0.0.1:3111";
async function main() {
  fs.mkdirSync(out, { recursive: true });
  server = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3111",
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  let logs = "";
  server.stderr.on("data", (b) => (logs += b));
  server.stdout.on("data", (b) => (logs += b));
  for (let n = 0; n < 100; n++) {
    try {
      await fetch(origin);
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
    if (n === 99) throw new Error(logs);
  }
  browser = await chromium.launch({
    executablePath: process.env.UI_REVIEW_BROWSER,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-zygote",
    ],
  });
  for (const width of [320, 375, 768, 1280, 1920])
    for (const theme of ["dark", "light"]) {
      const context = await browser.newContext({
        viewport: { width, height: width < 640 ? 812 : 900 },
        reducedMotion: "reduce",
      });
      await context.route("https://images.unsplash.com/**", (r) => r.abort());
      await context.addInitScript(
        ({ seed, theme }) => {
          localStorage.setItem("khwahish:theme", theme);
          const items = structuredClone(seed.items);
          Object.assign(items[0], {
            product_name: "Nike Air Force 1 '07",
            brand: "Nike",
            category: "Fashion",
            notes: "",
            variant: "White · UK 9",
            product_url: "https://shop.example/air-force-1-07",
            canonical_url: null,
            initial_price: 4999,
            price_observations: [],
            image_url: null,
          });
          Object.assign(items[1], {
            product_name: "Nike cotton shirt",
            brand: "Nike",
            category: "Fashion",
            notes: "",
            variant: "Blue",
            product_url: null,
            canonical_url: null,
          });
          Object.assign(items[6], {
            library_id: "demo-shared",
            product_name: "Nike Dunk Low",
            brand: "Nike",
            category: "Fashion",
            notes: "",
            product_url: "https://shop.example/dunk-low",
            canonical_url: null,
            initial_price: 4599,
            price_observations: [],
            status: "want",
          });
          localStorage.setItem("khwahish:demo:v1", JSON.stringify(items));
          localStorage.setItem(
            "khwahish:demo-libraries:v1",
            JSON.stringify(seed.libraries),
          );
        },
        { seed, theme },
      );
      const page = await context.newPage();
      page.on("pageerror", (e) =>
        report.errors.push({ width, theme, message: e.message }),
      );
      await page.goto(origin);
      const input = page.getByRole("searchbox", {
        name: "Search wishes",
        exact: true,
      });
      await input.fill("sho");
      await page.waitForFunction(
        () => document.querySelectorAll(".product-card").length === 1,
      );
      await page
        .getByRole("button", { name: "Nike Air Force 1 '07", exact: true })
        .waitFor();
      assert.equal(await page.locator(".product-card").count(), 1);
      for (const query of ["shoes", "snekaers", "nike shoes under ₹5k"]) {
        await input.fill(query);
        await page.waitForFunction(
          () => document.querySelectorAll(".product-card").length === 1,
        );
        assert.equal(await page.locator(".product-card").count(), 1, query);
      }
      await input.fill("shoes");
      const mode = page.getByRole("button", {
        name: "Smart search",
        exact: true,
      });
      await mode.click();
      await page
        .getByRole("heading", {
          name: "No wishes match just yet.",
          exact: true,
        })
        .waitFor();
      assert.equal(await mode.getAttribute("aria-pressed"), "false");
      await mode.click();
      await page
        .getByRole("button", { name: "Nike Air Force 1 '07", exact: true })
        .waitFor();
      await input.focus();
      const focus = await input.evaluate((el) => ({
        input: getComputedStyle(el).outlineStyle,
        parent: getComputedStyle(el.parentElement).outlineStyle,
        height: el.parentElement.getBoundingClientRect().height,
      }));
      assert.equal(focus.input, "none");
      assert.equal(focus.parent, "solid");
      assert.ok(focus.height >= 44);
      await page.screenshot({
        path: path.join(out, `${width}-${theme}-shelf-focused.png`),
        animations: "disabled",
      });
      await page
        .getByRole("button", { name: "Clear search", exact: true })
        .click();
      assert.equal(await input.inputValue(), "");
      assert.equal(
        await input.evaluate((el) => document.activeElement === el),
        true,
      );
      await page.locator("#shelf-scope").selectOption("demo-shared");
      await input.fill("shoes");
      await page
        .getByRole("button", { name: "Nike Dunk Low", exact: true })
        .waitFor();
      await page.waitForFunction(
        () => document.querySelectorAll(".product-card").length === 1,
      );
      assert.equal(await page.locator(".product-card").count(), 1);
      const nav = page.locator(
        width < 1024 ? ".mobile-nav > button" : ".desktop-nav > button",
      );
      await nav.nth(2).click();
      const watchInput = page.getByRole("searchbox", {
        name: "Search monitored wishes",
        exact: true,
      });
      await watchInput.fill("shoes");
      await page.locator(".watch-row").first().waitFor();
      await page.waitForFunction(
        () => document.querySelectorAll(".watch-row").length === 2,
      );
      assert.equal(await page.locator(".watch-row").count(), 2);
      await watchInput.focus();
      await page.screenshot({
        path: path.join(out, `${width}-${theme}-watch-focused.png`),
        animations: "disabled",
      });
      await nav.nth(3).click();
      const chat = page.getByLabel("Ask your wishlist", { exact: true });
      await chat.focus();
      assert.equal(
        await chat.evaluate((el) => getComputedStyle(el).outlineStyle),
        "none",
      );
      assert.equal(
        await chat.evaluate(
          (el) => getComputedStyle(el.parentElement).outlineStyle,
        ),
        "solid",
      );
      await page.screenshot({
        path: path.join(out, `${width}-${theme}-chat-focused.png`),
        animations: "disabled",
      });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      report.contexts.push({ width, theme, passed: true, focus });
      await context.close();
    }
  assert.equal(report.errors.length, 0);
}
main()
  .then(() => console.log(JSON.stringify(report, null, 2)))
  .catch((e) => {
    console.error(e);
    report.errors.push({ message: e.stack });
    process.exitCode = 1;
  })
  .finally(async () => {
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(
      path.join(out, "report.json"),
      JSON.stringify(report, null, 2),
    );
    await browser?.close();
    server?.kill();
  });
