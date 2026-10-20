/* Reproducible UI-only review. No live writes: signed-in cases use explicit network fixtures. */
const fs = require("node:fs"),
  path = require("node:path"),
  { spawn } = require("node:child_process");
const { chromium } = require("playwright");
let serverProcess;
const out = process.env.UI_REVIEW_OUTPUT || "/tmp/khwaish-ui-review/final";
const baseline = process.env.UI_REVIEW_BASELINE === "1";
const root = process.env.UI_REVIEW_ROOT || process.cwd();
const origin = "http://127.0.0.1:3107";
const reports =
  process.env.UI_REVIEW_REFRESH && fs.existsSync(path.join(out, "report.json"))
    ? JSON.parse(fs.readFileSync(path.join(out, "report.json")))
    : {
        baseline,
        checks: [],
        screenshots: [],
        audit: [],
        errors: [],
      };
const seed = JSON.parse(
  fs.readFileSync(
    process.env.UI_REVIEW_SEED ||
      path.join(__dirname, "fixtures/ui-wishes.json"),
  ),
);
const uid = "10000000-0000-4000-8000-000000000001";
const ids = {
  "demo-personal": "20000000-0000-4000-8000-000000000001",
  "demo-shared": "20000000-0000-4000-8000-000000000002",
};
const signedLibraries = seed.libraries.map((l) => ({
  ...l,
  id: ids[l.id],
  owner_id: uid,
}));
const signedItems = seed.items.map((i, n) => ({
  ...i,
  id: `30000000-0000-4000-8000-${String(n + 1).padStart(12, "0")}`,
  library_id: ids[i.library_id],
  added_by: uid,
}));
const user = {
  id: uid,
  aud: "authenticated",
  role: "authenticated",
  email: "review@example.test",
  email_confirmed_at: new Date().toISOString(),
  user_metadata: { name: "Review account" },
  app_metadata: { provider: "email" },
  created_at: new Date().toISOString(),
};
const token = [
  Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url"),
  Buffer.from(
    JSON.stringify({
      sub: uid,
      role: "authenticated",
      aud: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ).toString("base64url"),
  "ui-fixture",
].join(".");
function record(name, pass, detail = "") {
  reports.checks.push({ name, pass, detail });
  if (!pass) console.log("FAIL", name, detail);
}
async function main() {
  fs.mkdirSync(out, { recursive: true });
  const server = (serverProcess = spawn(
    process.execPath,
    [
      path.join(process.cwd(), "node_modules/next/dist/bin/next"),
      "dev",
      root,
      ...(baseline ? ["--webpack"] : []),
      "--hostname",
      "127.0.0.1",
      "--port",
      "3107",
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  ));
  let logs = "";
  server.stdout.on("data", (b) => (logs += b));
  server.stderr.on("data", (b) => (logs += b));
  process.on("exit", () => server.kill());
  for (let i = 0; i < 150; i++) {
    try {
      await fetch(origin);
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 400));
    }
    if (i === 149) throw Error("Preview failed: " + logs.slice(-2000));
  }
  let launch = {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-zygote",
    ],
  };
  if (process.env.UI_REVIEW_BROWSER)
    launch.executablePath = process.env.UI_REVIEW_BROWSER;
  const browser = await chromium.launch(launch);
  async function context(width, theme, mode = "guest") {
    const c = await browser.newContext({
      viewport: {
        width,
        height:
          width === 1280
            ? 720
            : width === 1920
              ? 1080
              : width === 768
                ? 1024
                : 812,
      },
      reducedMotion: "reduce",
      permissions: ["clipboard-read", "clipboard-write"],
    });
    await c.addInitScript(
      ({ seed, theme, mode, token, user }) => {
        if (!localStorage.getItem("khwahish:theme"))
          localStorage.setItem("khwahish:theme", theme);
        if (!localStorage.getItem("khwahish:demo:v1"))
          localStorage.setItem(
            "khwahish:demo:v1",
            JSON.stringify(mode === "empty" ? [] : seed.items),
          );
        if (!localStorage.getItem("khwahish:demo-libraries:v1"))
          localStorage.setItem(
            "khwahish:demo-libraries:v1",
            JSON.stringify(
              mode === "empty"
                ? seed.libraries.filter((l) => l.kind === "personal")
                : seed.libraries,
            ),
          );
        if (["signed", "loading", "error"].includes(mode)) {
          const session = JSON.stringify({
            access_token: token,
            refresh_token: "review-refresh",
            expires_in: 3600,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            token_type: "bearer",
            user,
          });
          document.cookie =
            "sb-cujojmczwfgyjzpympby-auth-token=base64-" +
            btoa(session)
              .replaceAll("=", "")
              .replaceAll("+", "-")
              .replaceAll("/", "_") +
            "; path=/; SameSite=Lax";
        }
      },
      { seed, theme, mode, token, user },
    );
    await c.route("https://images.unsplash.com/**", (r) => r.abort());
    if (["signed", "loading", "error"].includes(mode)) {
      await c.route("**/api/ask", async (r) => {
        const q = r.request().postDataJSON();
        await new Promise((resolve) => setTimeout(resolve, 900));
        return r.fulfill(
          q.query.includes("cheaper")
            ? {
                status: 503,
                json: {
                  error:
                    "AI review fixture unavailable. Showing local matches.",
                },
              }
            : {
                json: {
                  intent: "find",
                  answer:
                    "Your Sony headphones are saved at ₹24,990, compared with the original ₹29,990. The related wish is attached below.",
                  ids: [signedItems[0].id],
                },
              },
        );
      });
      await c.route("**/api/prices", (r) => {
        const id = r.request().postDataJSON().itemId;
        return r.fulfill({
          json: {
            observation: {
              id: "review-new-price",
              wishlist_item_id: id,
              price: 24900,
              currency: "INR",
              availability: "in_stock",
              source: "product_page",
              source_url: "https://example.test/product",
              observed_at: new Date().toISOString(),
            },
          },
        });
      });
      await c.route("**/api/offers", (r) =>
        r.fulfill({
          json: {
            offers: [
              {
                title: "Review store match",
                retailer: "Review store",
                price: 24900,
                url: "https://example.test/product",
                image: null,
              },
            ],
            message: "UI review fixture. Verify model and delivery costs.",
          },
        }),
      );
      await c.route("**/api/status", (r) =>
        r.fulfill({
          json: { aiWishlist: true, comparison: true, scheduled: false },
        }),
      );
      await c.route("https://*.supabase.co/**", async (r) => {
        const req = r.request(),
          url = new URL(req.url()),
          body = req.postDataJSON?.() || {};
        let result = [];
        if (url.pathname.includes("/auth/v1/user")) result = user;
        else if (url.pathname.includes("/auth/v1/token"))
          result = {
            access_token: token,
            refresh_token: "review-refresh",
            expires_in: 3600,
            token_type: "bearer",
            user,
          };
        else if (url.pathname.includes("ensure_personal_library"))
          result = ids["demo-personal"];
        else if (url.pathname.includes("create_library_invite"))
          result = "review-invite-token";
        else if (url.pathname.includes("accept_library_invite"))
          result = ids["demo-shared"];
        else if (url.pathname.includes("/rest/v1/libraries")) {
          if (mode === "loading")
            await new Promise((resolve) => setTimeout(resolve, 5000));
          if (mode === "error")
            return r.fulfill({
              status: 503,
              json: {
                message: "Review fixture: spaces are temporarily unavailable.",
              },
            });
          result =
            req.method() === "GET"
              ? signedLibraries
              : [
                  {
                    ...signedLibraries[1],
                    name: body.name || signedLibraries[1].name,
                  },
                ];
        } else if (url.pathname.includes("/rest/v1/library_members")) {
          result = signedLibraries
            .map((l) => ({
              library_id: l.id,
              user_id: uid,
              role: "owner",
              joined_at: l.created_at,
            }))
            .concat([
              {
                library_id: ids["demo-shared"],
                user_id: "10000000-0000-4000-8000-000000000002",
                role: "viewer",
                joined_at: "2026-10-01T10:00:00Z",
              },
            ]);
          if (url.searchParams.get("library_id"))
            result = result.filter(
              (m) =>
                "eq." + m.library_id === url.searchParams.get("library_id"),
            );
          if (url.searchParams.get("user_id"))
            result = result.filter(
              (m) => "eq." + m.user_id === url.searchParams.get("user_id"),
            );
        } else if (url.pathname.includes("/rest/v1/profiles"))
          result = req.headers().accept?.includes("object")
            ? { id: uid, display_name: "Review account", avatar_path: null }
            : [
                { id: uid, display_name: "Review account", avatar_path: null },
                {
                  id: "10000000-0000-4000-8000-000000000002",
                  display_name: "Review friend",
                  avatar_path: null,
                },
              ];
        else if (url.pathname.includes("/rest/v1/wishlist_items"))
          result =
            req.method() === "GET" ? signedItems : { id: signedItems[0].id };
        else if (url.pathname.includes("/rest/v1/item_comments")) {
          const comment = {
            id: "40000000-0000-4000-8000-000000000001",
            wishlist_item_id: signedItems[0].id,
            user_id: uid,
            body: "Let’s wait for the next price drop.",
            created_at: "2026-10-19T10:00:00Z",
          };
          result =
            req.method() === "POST"
              ? {
                  ...comment,
                  ...body,
                  id: "40000000-0000-4000-8000-000000000002",
                }
              : req.method() === "DELETE"
                ? [
                    {
                      id:
                        url.searchParams.get("id")?.replace("eq.", "") ||
                        comment.id,
                    },
                  ]
                : [comment];
        } else if (url.pathname.includes("/rest/v1/library_invites"))
          result = [
            {
              id: "50000000-0000-4000-8000-000000000001",
              role: "editor",
              expires_at: "2026-10-27T10:00:00Z",
              accepted_at: null,
              revoked_at: null,
            },
          ];
        return r.fulfill({ status: 200, json: result });
      });
    }
    const p = await c.newPage();
    p.on("pageerror", (e) =>
      reports.errors.push({ width, theme, mode, message: e.message }),
    );
    p.on(
      "domcontentloaded",
      () => void p.addStyleTag({ content: "nextjs-portal { display: none; }" }),
    );
    return { c, p };
  }
  async function shot(p, width, theme, name) {
    await p.waitForTimeout(baseline ? 650 : 100);
    const file = `${width}-${theme}-${name}.png`;
    await p.screenshot({ path: path.join(out, file), animations: "disabled" });
    if (!reports.screenshots.includes(file)) reports.screenshots.push(file);
    const audit = await p.evaluate(() => {
      const visible = (e) =>
        e.getClientRects().length &&
        getComputedStyle(e).visibility !== "hidden";
      const small = [...document.querySelectorAll("body *")]
        .filter(
          (e) =>
            visible(e) &&
            [...e.childNodes].some(
              (n) => n.nodeType === 3 && n.textContent.trim(),
            ) &&
            parseFloat(getComputedStyle(e).fontSize) < 12,
        )
        .slice(0, 12)
        .map((e) => ({
          tag: e.tagName,
          text: e.textContent.slice(0, 80),
          size: getComputedStyle(e).fontSize,
        }));
      return {
        overflow: document.documentElement.scrollWidth > innerWidth,
        small,
        header: document.querySelector(".app-header")?.getBoundingClientRect()
          .height,
        firstProduct: document
          .querySelector(".product-card")
          ?.getBoundingClientRect().top,
      };
    });
    reports.audit = reports.audit.filter(
      (x) => !(x.width === width && x.theme === theme && x.name === name),
    );
    reports.audit.push({ width, theme, name, ...audit });
  }
  async function go(p, width, id) {
    await p
      .locator(
        `.${width < (baseline ? 761 : 1024) ? "mobile-nav" : baseline ? "main-nav" : "desktop-nav"} > button`,
      )
      .nth(id)
      .click();
  }
  const close = (p) =>
    p
      .locator("dialog[open]")
      .last()
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
  const account = async (p) => {
    if (baseline)
      await p.evaluate(() =>
        [...document.querySelectorAll("button")]
          .find((x) => x.textContent.includes("Settings & profile"))
          .click(),
      );
    else {
      await p
        .getByRole("button", { name: "Account menu", exact: true })
        .click();
      await p
        .getByRole("button", { name: "Profile & settings", exact: true })
        .click();
    }
  };
  for (const width of process.env.UI_REVIEW_SMOKE_ONLY
    ? []
    : [375, 768, 1280, 1920])
    for (const theme of ["dark", "light"]) {
      const { c, p } = await context(width, theme);
      await p.goto(origin);
      await p.waitForTimeout(1000);
      await p.locator(".product-card").first().waitFor();
      await shot(p, width, theme, "shelf");
      if (process.env.UI_REVIEW_REFRESH) {
        await go(p, width, 1);
        await shot(p, width, theme, "spaces");
        await go(p, width, 2);
        await shot(p, width, theme, "watch");
        if (!baseline)
          for (const segment of [
            "Dropped",
            "At or below target",
            "Above target",
            "No price",
          ]) {
            await p
              .getByRole("button", { name: new RegExp("^" + segment) })
              .click();
            await shot(
              p,
              width,
              theme,
              "watch-" + segment.toLowerCase().replaceAll(" ", "-"),
            );
          }
        await account(p);
        await shot(p, width, theme, "settings");
        await c.close();
        for (const mode of ["empty", "loading", "error"]) {
          const { c: stateContext, p: statePage } = await context(
            width,
            theme,
            mode,
          );
          await statePage.goto(origin);
          if (mode === "loading")
            await statePage.locator(".card-skeleton").first().waitFor();
          else if (mode === "error")
            await statePage.getByRole("alert").first().waitFor();
          else
            await statePage
              .getByRole("heading", {
                name: baseline
                  ? "Your next favourite belongs here."
                  : "Make room for your next favourite.",
                exact: true,
              })
              .waitFor();
          await shot(statePage, width, theme, mode + "-shelf");
          for (const [id, name] of [
            [1, "spaces"],
            [2, "watch"],
            [3, "ask"],
          ]) {
            await go(statePage, width, id);
            await shot(statePage, width, theme, mode + "-" + name);
          }
          await account(statePage);
          await shot(statePage, width, theme, mode + "-settings");
          await stateContext.close();
        }
        console.log(width, theme, "refreshed");
        continue;
      }
      if (!baseline) {
        const y = await p
          .locator(".product-card")
          .first()
          .evaluate((e) => e.getBoundingClientRect().top);
        if (width === 1280)
          record("Products start by 450px / " + theme, y <= 450, String(y));
        await p.getByRole("button", { name: "List view", exact: true }).click();
        await shot(p, width, theme, "shelf-list");
        await p.getByRole("button", { name: "Grid view", exact: true }).click();
        await p
          .getByLabel("Browsing", { exact: true })
          .selectOption("demo-shared");
        await shot(p, width, theme, "space-wishes");
        await go(p, width, 0);
      }
      await p.locator(".product-title").first().click();
      await shot(p, width, theme, "detail");
      for (const tab of ["Price history", "Compare", "Conversation"]) {
        await p.getByRole("tab", { name: tab, exact: true }).click();
        await shot(
          p,
          width,
          theme,
          "detail-" + tab.toLowerCase().replace(" ", "-"),
        );
      }
      await p.getByRole("tab", { name: "Details", exact: true }).click();
      await p
        .getByRole("button", { name: "Remove this wish", exact: true })
        .click();
      await shot(p, width, theme, "confirm-wish");
      if (baseline)
        await p.getByRole("button", { name: "Keep it", exact: true }).click();
      else
        await p
          .locator("dialog[open]")
          .last()
          .getByRole("button", { name: "Cancel", exact: true })
          .click();
      if (!baseline) {
        await p
          .locator("dialog[open]")
          .getByLabel("Product name", { exact: true })
          .fill("An edited wish");
        await shot(p, width, theme, "detail-dirty");
        await p.getByRole("button", { name: "Discard", exact: true }).click();
      }
      await close(p);
      await p.getByRole("button", { name: "Add a wish", exact: true }).click();
      await shot(p, width, theme, "capture-link");
      await p.getByRole("button", { name: "Screenshot", exact: true }).click();
      await shot(p, width, theme, "capture-screenshot");
      await p.locator('dialog[open] input[type="file"]').setInputFiles({
        name: "invalid.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("review"),
      });
      await shot(p, width, theme, "capture-error");
      await p
        .getByRole("button", { name: "Add manually", exact: true })
        .click();
      await shot(p, width, theme, "capture-manual");
      await close(p);
      await go(p, width, 1);
      await shot(p, width, theme, "spaces");
      if (!baseline) await p.locator(".space-overflow summary").first().click();
      await p
        .getByRole("button", { name: "Remove space", exact: true })
        .click();
      await shot(p, width, theme, "confirm-space");
      await close(p);
      await go(p, width, 2);
      await shot(p, width, theme, "watch");
      if (!baseline)
        for (const segment of [
          "Dropped",
          "At or below target",
          "Above target",
          "No price",
        ]) {
          await p
            .getByRole("button", { name: new RegExp("^" + segment) })
            .click();
          await shot(
            p,
            width,
            theme,
            "watch-" + segment.toLowerCase().replaceAll(" ", "-"),
          );
        }
      await go(p, width, 3);
      await shot(p, width, theme, "ask");
      await p.getByLabel("Ask your wishlist").fill("Show electronics");
      await p
        .getByRole("button", { name: "Ask question", exact: true })
        .click();
      await shot(p, width, theme, "ask-conversation");
      await account(p);
      await shot(p, width, theme, "settings");
      await p.getByRole("button", { name: "Create my account" }).click();
      await shot(p, width, theme, "auth-login");
      await p
        .locator("dialog[open]")
        .getByRole("button", { name: "Create an account", exact: true })
        .click();
      await shot(p, width, theme, "auth-signup");
      await p
        .locator("dialog[open]")
        .getByRole("button", { name: "Sign in", exact: true })
        .click();
      await p
        .getByRole("button", { name: "Forgot your password?", exact: true })
        .click();
      await shot(p, width, theme, "auth-reset");
      await close(p);
      await c.close();
      for (const mode of ["empty", "loading", "error"]) {
        const { c, p } = await context(width, theme, mode);
        await p.goto(origin);
        if (mode === "loading")
          await p.locator(".card-skeleton").first().waitFor();
        else if (mode === "error") await p.getByRole("alert").first().waitFor();
        else
          await p
            .getByRole("heading", {
              name: baseline
                ? "Your next favourite belongs here."
                : "Make room for your next favourite.",
            })
            .waitFor();
        await shot(p, width, theme, mode + "-shelf");
        for (const [id, name] of [
          [1, "spaces"],
          [2, "watch"],
          [3, "ask"],
        ]) {
          await go(p, width, id);
          await shot(p, width, theme, mode + "-" + name);
        }
        await account(p);
        await shot(p, width, theme, mode + "-settings");
        await c.close();
      }
      const { c: sc, p: sp } = await context(width, theme, "signed");
      await sp.goto(origin);
      await sp.locator(".product-card").first().waitFor();
      await go(sp, width, 1);
      await sp
        .locator(".space-card")
        .first()
        .getByRole("button", {
          name: baseline
            ? "Manage The apartment edit"
            : "People in The apartment edit",
          exact: true,
        })
        .click();
      await shot(sp, width, theme, "sharing-people");
      if (!baseline) {
        await sp
          .getByRole("button", { name: "Create link", exact: true })
          .click();
        await shot(sp, width, theme, "sharing-invite");
      }
      await close(sp);
      await sp
        .locator("main")
        .getByRole("button", { name: "Create a shared space", exact: true })
        .click();
      await shot(sp, width, theme, "sharing-create");
      await close(sp);
      await go(sp, width, 0);
      await sp.locator(".product-title").first().click();
      await sp.getByRole("tab", { name: "Conversation", exact: true }).click();
      await sp
        .getByRole("button", { name: "Clear my messages", exact: true })
        .waitFor();
      await shot(sp, width, theme, "conversation-messages");
      await sp
        .getByRole("button", { name: "Clear my messages", exact: true })
        .click();
      await shot(sp, width, theme, "confirm-messages");
      if (baseline)
        await sp.getByRole("button", { name: "Keep", exact: true }).click();
      else
        await sp
          .locator("dialog[open]")
          .last()
          .getByRole("button", { name: "Cancel", exact: true })
          .click();
      await close(sp);
      await sc.close();
      console.log(width, theme, "matrix complete");
    }
  if (!baseline && !process.env.UI_REVIEW_MATRIX_ONLY) {
    const { c, p } = await context(320, "dark");
    await p.goto(origin);
    await p.locator(".product-card").first().waitFor();
    record(
      "No horizontal page overflow at 320",
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await p.locator(".product-title").first().click();
    const tabs = p.getByRole("tab", { name: "Details", exact: true });
    await tabs.focus();
    await p.keyboard.press("ArrowRight");
    record(
      "Detail arrow-key navigation",
      (await p
        .getByRole("tab", { name: "Price history", exact: true })
        .getAttribute("aria-selected")) === "true",
    );
    await p.keyboard.press("Home");
    record(
      "Detail Home-key navigation",
      (await tabs.getAttribute("aria-selected")) === "true",
    );
    await p
      .locator("dialog[open]")
      .getByLabel("Status", { exact: true })
      .selectOption("considering");
    record(
      "Status stays local until Save",
      await p.evaluate(
        () =>
          JSON.parse(localStorage.getItem("khwahish:demo:v1"))[0].status ===
          "want",
      ),
    );
    await p.getByRole("button", { name: "Discard", exact: true }).click();
    record(
      "Discard restores status",
      (await p
        .locator("dialog[open]")
        .getByLabel("Status", { exact: true })
        .inputValue()) === "want",
    );
    await p
      .locator("dialog[open]")
      .getByLabel("Status", { exact: true })
      .selectOption("considering");
    await p.getByRole("button", { name: "Save changes", exact: true }).click();
    record(
      "Save persists status",
      await p.evaluate(
        () =>
          JSON.parse(localStorage.getItem("khwahish:demo:v1"))[0].status ===
          "considering",
      ),
    );
    await close(p);
    await p.getByRole("button", { name: "Add a wish", exact: true }).click();
    await p.getByRole("button", { name: "Add manually", exact: true }).click();
    await p
      .locator("dialog[open]")
      .getByLabel("Product name", { exact: true })
      .fill("QA wish created manually");
    await p
      .locator("dialog[open]")
      .getByRole("button", { name: "Add a wish", exact: true })
      .click();
    await p
      .getByRole("button", { name: "QA wish created manually", exact: true })
      .waitFor();
    record(
      "Manual add persists in guest storage",
      await p.evaluate(() =>
        JSON.parse(localStorage.getItem("khwahish:demo:v1")).some(
          (i) => i.product_name === "QA wish created manually",
        ),
      ),
    );
    await p.reload();
    await p
      .getByRole("button", { name: "QA wish created manually", exact: true })
      .waitFor();
    record("Guest wishes survive reload", true);
    await p.getByLabel("Search wishes", { exact: true }).fill("does-not-exist");
    record(
      "Search empty state",
      await p
        .getByRole("heading", {
          name: "No wishes match just yet.",
          exact: true,
        })
        .isVisible(),
    );
    await p
      .getByRole("button", { name: "Reset filters", exact: true })
      .last()
      .click();
    await go(p, 320, 3);
    await p.getByLabel("Ask your wishlist").fill("Show electronics");
    await p.getByRole("button", { name: "Ask question", exact: true }).click();
    record(
      "Local chat answers before attachments",
      (await p.locator(".chat-answer-text").first().isVisible()) &&
        (await p.locator(".chat-attachment").count()) > 0,
    );
    await p.locator(".chat-attachment").first().click();
    record(
      "Chat attachment opens wish",
      (await p.locator("dialog[open]").count()) === 1,
    );
    await close(p);
    await p.getByRole("button", { name: "Clear chat", exact: true }).click();
    record(
      "Clear chat removes turns",
      (await p.locator(".chat-turn").count()) === 0,
    );
    await p.getByLabel("Query shelf or space").selectOption("demo-shared");
    record(
      "Chat suggestions follow space",
      !(await p.locator(".query-prompts").innerText()).includes("electronics"),
    );
    const key = await p.evaluate(() => localStorage.getItem("khwahish:theme"));
    await p.getByRole("button", { name: /Switch to .* theme/ }).click();
    record(
      "Theme persists using unchanged key",
      (await p.evaluate(() => localStorage.getItem("khwahish:theme"))) !== key,
    );
    await shot(p, 320, "light", "smallest-width");
    await go(p, 320, 0);
    await p.locator(".save-heart").first().click();
    record(
      "Must-have heart persists",
      await p.evaluate(
        () =>
          JSON.parse(localStorage.getItem("khwahish:demo:v1"))[0].priority ===
          "high",
      ),
    );
    await p.locator(".filter-popover summary").click();
    await p.getByLabel("Filter priority", { exact: true }).selectOption("high");
    await p.locator(".filter-popover summary").click();
    record(
      "Priority filter applies",
      (await p.locator(".product-card").count()) ===
        (await p.evaluate(
          () =>
            JSON.parse(localStorage.getItem("khwahish:demo:v1")).filter(
              (i) => i.library_id === "demo-personal" && i.priority === "high",
            ).length,
        )),
    );
    await p.locator(".filter-popover summary").click();
    await p.getByLabel("Filter priority", { exact: true }).selectOption("all");
    await p.locator(".filter-popover summary").click();
    await p.getByRole("button", { name: "Electronics", exact: true }).click();
    record(
      "Category filter applies",
      await p
        .locator(".card-meta>span:first-child")
        .evaluateAll((es) => es.every((e) => e.textContent === "Electronics")),
    );
    await p.getByRole("button", { name: /^All wishes/ }).click();
    await p.getByLabel("Sort wishes").selectOption("price-low");
    record(
      "Sort orders prices",
      (await p.locator(".product-title").first().innerText()) ===
        "One more chapter",
    );
    const [download] = await Promise.all([
      p.waitForEvent("download"),
      p.getByRole("button", { name: "Export wishes as CSV" }).click(),
    ]);
    record(
      "CSV export uses Khwaish filename",
      download.suggestedFilename() === "Khwaish-wishlist.csv",
    );
    await p
      .getByRole("button", { name: "QA wish created manually", exact: true })
      .click();
    await p
      .getByRole("button", { name: "Remove this wish", exact: true })
      .click();
    await p
      .locator("dialog[open]")
      .last()
      .getByRole("button", { name: "Remove wish", exact: true })
      .click();
    record(
      "Delete wish persists",
      await p.evaluate(
        () =>
          !JSON.parse(localStorage.getItem("khwahish:demo:v1")).some(
            (i) => i.product_name === "QA wish created manually",
          ),
      ),
    );
    const trigger = p.getByRole("button", { name: "Add a wish", exact: true });
    await trigger.click();
    await p.keyboard.press("Tab");
    await p.keyboard.press("Shift+Tab");
    record(
      "Dialog contains keyboard focus",
      await p.evaluate(() => !!document.activeElement.closest("dialog[open]")),
    );
    await close(p);
    record(
      "Dialog returns focus",
      await trigger.evaluate((e) => e === document.activeElement),
    );
    await go(p, 320, 2);
    record(
      "Guest price checks are explained and disabled",
      (await p
        .getByText("Sign in to check live prices.", { exact: true })
        .count()) > 0 &&
        (await p
          .getByRole("button", { name: "Check price", exact: true })
          .first()
          .isDisabled()),
    );
    await go(p, 320, 1);
    await p
      .getByRole("button", { name: "Create a shared space", exact: true })
      .click();
    record(
      "Guest sharing opens sign in",
      (await p
        .locator("dialog[open]")
        .getByRole("button", { name: "Sign in", exact: true })
        .count()) > 0,
    );
    await close(p);
    await p.goto(origin + "/?invite=review-invite");
    await p
      .getByRole("button", { name: "Sign in to join", exact: true })
      .waitFor();
    record(
      "Invite banner persists token",
      await p.evaluate(
        () => sessionStorage.getItem("khwahish:invite") === "review-invite",
      ),
    );
    await p.getByRole("button", { name: "Dismiss invitation" }).click();
    record(
      "Dismiss invite clears token",
      await p.evaluate(
        () => sessionStorage.getItem("khwahish:invite") === null,
      ),
    );
    await c.close();
    const { c: sc, p: sp } = await context(1280, "dark", "signed");
    await sp.goto(origin);
    await sp.locator(".product-card").first().waitFor();
    await go(sp, 1280, 2);
    const priceRequest = sp.waitForRequest((r) =>
      r.url().endsWith("/api/prices"),
    );
    await sp
      .getByRole("button", { name: "Check price", exact: true })
      .first()
      .click();
    record(
      "Price check sends wish ID to existing API",
      Boolean((await priceRequest).postDataJSON().itemId),
    );
    await sp.locator(".toast-success").waitFor();
    record(
      "Price check shows success feedback",
      await sp.locator(".toast-success").isVisible(),
    );
    await sp.locator(".watch-name").first().click();
    await sp.getByRole("tab", { name: "Price history", exact: true }).click();
    record(
      "Price history remains available",
      (await sp.getByRole("img", { name: /Price history with/ }).count()) === 1,
    );
    await sp.getByRole("tab", { name: "Compare", exact: true }).click();
    await sp
      .getByRole("button", { name: "Find store matches", exact: true })
      .click();
    await sp.locator(".offer-card").waitFor();
    record(
      "Compare renders offers and store searches",
      (await sp.locator(".offer-card").count()) === 1 &&
        (await sp.locator(".retailer-searches>a").count()) === 4,
    );
    await sp.getByRole("tab", { name: "Conversation", exact: true }).click();
    await sp
      .getByRole("button", { name: "Clear my messages", exact: true })
      .waitFor();
    await sp
      .getByLabel("Comment", { exact: true })
      .fill("Review comment added");
    await sp.getByRole("button", { name: "Send comment", exact: true }).click();
    await sp.getByText("Review comment added", { exact: true }).waitFor();
    record("Signed-in comment add uses existing flow", true);
    await sp
      .locator(".comment")
      .filter({ hasText: "Review comment added" })
      .getByRole("button", { name: "Delete this message", exact: true })
      .click();
    await sp
      .locator("dialog[open]")
      .last()
      .getByRole("button", { name: "Delete message", exact: true })
      .click();
    await sp
      .getByText("Review comment added", { exact: true })
      .waitFor({ state: "detached" });
    record(
      "Own comment delete updates conversation",
      (await sp.getByText("Review comment added", { exact: true }).count()) ===
        0,
    );
    await sp
      .getByRole("button", { name: "Clear my messages", exact: true })
      .click();
    await sp
      .locator("dialog[open]")
      .last()
      .getByRole("button", { name: "Clear my messages", exact: true })
      .click();
    await sp.locator(".comment").first().waitFor({ state: "detached" });
    record(
      "Clear own messages updates conversation",
      (await sp.locator(".comment").count()) === 0,
    );
    await close(sp);
    await go(sp, 1280, 1);
    await sp
      .getByRole("button", {
        name: "People in The apartment edit",
        exact: true,
      })
      .click();
    await sp
      .getByRole("combobox", { name: "Access for Review friend", exact: true })
      .selectOption("editor");
    await sp.waitForFunction(
      () =>
        document.querySelector('[aria-label="Access for Review friend"]')
          ?.value === "editor",
    );
    record(
      "Member role control remains connected",
      (await sp
        .getByRole("combobox", {
          name: "Access for Review friend",
          exact: true,
        })
        .inputValue()) === "editor",
    );
    await sp.getByRole("button", { name: "Revoke", exact: true }).click();
    await sp
      .getByRole("button", { name: "Revoke", exact: true })
      .waitFor({ state: "detached" });
    record(
      "Revoke invitation updates pending list",
      (await sp
        .getByRole("button", { name: "Revoke", exact: true })
        .count()) === 0,
    );
    await sp.getByRole("button", { name: "Create link", exact: true }).click();
    await sp.getByLabel("Invitation link", { exact: true }).waitFor();
    record(
      "Invite generation displays returned link",
      (
        await sp.getByLabel("Invitation link", { exact: true }).inputValue()
      ).includes("review-invite-token"),
    );
    await sp
      .getByRole("button", { name: "Copy invitation link", exact: true })
      .click();
    record(
      "Copy invitation uses clipboard",
      (await sp.evaluate(() => navigator.clipboard.readText())).includes(
        "review-invite-token",
      ),
    );
    await sp
      .getByRole("combobox", { name: "Access for Review friend", exact: true })
      .selectOption("remove");
    await sp
      .getByRole("combobox", { name: "Access for Review friend", exact: true })
      .waitFor({ state: "detached" });
    record(
      "Remove member updates visible access",
      (await sp
        .getByRole("combobox", {
          name: "Access for Review friend",
          exact: true,
        })
        .count()) === 0,
    );
    await close(sp);
    await go(sp, 1280, 3);
    await sp.getByLabel("Ask your wishlist").fill("Show electronics");
    await sp.getByRole("button", { name: "Ask question", exact: true }).click();
    await shot(sp, 1280, "dark", "ask-ai-pending");
    await sp.locator(".chat-answer-text").waitFor();
    record(
      "AI response labels and attachments",
      (await sp.locator(".chat-speaker small").innerText()) === "AI" &&
        (await sp.locator(".chat-attachment").count()) === 1,
    );
    await shot(sp, 1280, "dark", "ask-ai-answer");
    await sp.getByLabel("Ask your wishlist").fill("What got cheaper?");
    await sp.getByRole("button", { name: "Ask question", exact: true }).click();
    await sp.locator(".toast-error").waitFor();
    record(
      "AI failure falls back with error feedback",
      (await sp.locator(".chat-speaker small").last().innerText()) ===
        "Local match",
    );
    await shot(sp, 1280, "dark", "ask-local-fallback");
    await sc.close();
  }
  await browser.close();
  server.kill();
  fs.writeFileSync(
    path.join(out, "report.json"),
    JSON.stringify(reports, null, 2),
  );
  console.log(
    JSON.stringify(
      {
        screenshots: reports.screenshots.length,
        checks: reports.checks,
        issues: reports.audit.filter((x) => x.overflow || x.small.length),
        errors: reports.errors,
      },
      null,
      2,
    ),
  );
  if (reports.checks.some((x) => !x.pass) || reports.errors.length)
    process.exitCode = 1;
}
main().catch((e) => {
  reports.errors.push({ message: e.stack });
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(
    path.join(out, "report.json"),
    JSON.stringify(reports, null, 2),
  );
  console.error(e);
  serverProcess?.kill();
  process.exit(1);
});
