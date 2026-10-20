"use client";
import { useState } from "react";
import { RefreshCw, Search, Download, ArrowUpRight } from "lucide-react";
import {
  currentPrice,
  latestPrice,
  money,
  priceDrop,
  type Item,
  STATUS_LABELS,
} from "@/lib/types";
import { ProductImage, EmptyState, ErrorText, Skeletons } from "./ui";
const segments = [
  "All",
  "Dropped",
  "At or below target",
  "Above target",
  "No price",
] as const;
export default function PriceWatch({
  items,
  isDemo,
  canEdit,
  onSelect,
  onRefresh,
  onExport,
  loading,
  error,
}: {
  items: Item[];
  isDemo: boolean;
  canEdit: (item: Item) => boolean;
  onSelect: (item: Item) => void;
  onRefresh: (item: Item) => Promise<void>;
  onExport: () => void;
  loading: boolean;
  error: string;
}) {
  const [segment, setSegment] = useState<string>("All");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [priority, setPriority] = useState("all");
  const [sort, setSort] = useState("drop");
  const [busy, setBusy] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const matches = (item: Item, key: string) => {
    const price = currentPrice(item);
    return key === "Dropped"
      ? priceDrop(item) > 0
      : key === "At or below target"
        ? price != null &&
          item.target_price != null &&
          price <= item.target_price
        : key === "Above target"
          ? price != null &&
            item.target_price != null &&
            price > item.target_price
          : key === "No price"
            ? price == null
            : true;
  };
  const shown = items
    .filter(
      (i) =>
        matches(i, segment) &&
        (status === "all" || i.status === status) &&
        (priority === "all" || i.priority === priority) &&
        i.product_name.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "newest"
        ? Date.parse(b.created_at) - Date.parse(a.created_at)
        : sort === "price-low"
          ? a.currency.localeCompare(b.currency) ||
            (currentPrice(a) ?? Infinity) - (currentPrice(b) ?? Infinity)
          : priceDrop(b) - priceDrop(a),
    );
  const drops = items.filter((i) => priceDrop(i) > 0);
  const savings = items
    .filter((i) => i.currency.trim() === "INR")
    .reduce((n, i) => n + priceDrop(i), 0);
  async function check(item: Item) {
    if (busy.includes(item.id)) return;
    setBusy((v) => [...v, item.id]);
    setErrors((v) => ({ ...v, [item.id]: "" }));
    try {
      await onRefresh(item);
    } catch (e) {
      setErrors((v) => ({
        ...v,
        [item.id]:
          e instanceof Error ? e.message : "Could not check this price.",
      }));
    } finally {
      setBusy((v) => v.filter((id) => id !== item.id));
    }
  }
  return (
    <>
      <section className="page-heading">
        <div>
          <span className="eyebrow">ACROSS ALL YOUR SPACES</span>
          <h1>
            Same wish. <em>Better price.</em>
          </h1>
          <p>
            Monitor active wishes on your shelf and in every space. Purchased
            and paused wishes are excluded.
          </p>
        </div>
        <button className="btn secondary" onClick={onExport}>
          <Download size={18} />
          Export
        </button>
      </section>
      <div
        className="stats-strip"
        aria-label="Price monitoring across all your spaces"
      >
        <span>
          <strong>{items.length}</strong> active wishes
        </span>
        <span>
          <strong>{drops.length}</strong> recorded drops
        </span>
        {savings > 0 && (
          <span>
            <strong>{money(savings)}</strong> recorded savings · INR
          </span>
        )}
      </div>
      <div className="filter-bar">
        <div className="search-input">
          <Search size={18} />
          <input
            aria-label="Search monitored wishes"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search monitored wishes…"
          />
        </div>
        <details className="filter-popover">
          <summary>Filters</summary>
          <div className="filter-menu">
            <label>
              Status
              <select
                aria-label="Watch status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="all">All active statuses</option>
                {Object.entries(STATUS_LABELS)
                  .filter(([v]) => v === "want" || v === "considering")
                  .map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Priority
              <select
                aria-label="Watch priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              >
                <option value="all">All priorities</option>
                <option value="high">Must-have</option>
                <option value="medium">Would love</option>
                <option value="low">Someday</option>
              </select>
            </label>
            <button
              className="text-btn"
              onClick={() => {
                setStatus("all");
                setPriority("all");
              }}
            >
              Reset filters
            </button>
          </div>
        </details>
        <select
          aria-label="Sort monitored wishes"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="drop">Biggest price drops</option>
          <option value="newest">Recently added</option>
          <option value="price-low">Price: low to high</option>
        </select>
      </div>
      <div className="watch-segments" aria-label="Price segments">
        {segments.map((key) => (
          <button
            key={key}
            aria-pressed={segment === key}
            className={segment === key ? "active" : ""}
            onClick={() => setSegment(key)}
          >
            {key}
            <span className="nav-count">
              {items.filter((i) => matches(i, key)).length}
            </span>
          </button>
        ))}
      </div>
      {loading ? (
        <Skeletons />
      ) : error ? (
        <EmptyState
          title="Price watch couldn’t load."
          body="Use Try again above to reconnect."
        />
      ) : shown.length ? (
        <div className="watch-list">
          {shown.map((item) => {
            const current = currentPrice(item),
              saved = item.initial_price,
              latest = latestPrice(item);
            const percent =
              current != null && saved != null && saved > 0
                ? ((current - saved) / saved) * 100
                : null;
            const reason = isDemo
              ? "Sign in to check live prices."
              : !canEdit(item)
                ? "Only editors can check prices."
                : !item.product_url
                  ? "Add a product link in Details to check its price."
                  : "";
            const checked =
              item.last_price_check_at ||
              (latest && !latest.source.startsWith("saved_")
                ? latest.observed_at
                : null);
            return (
              <article className="watch-row" key={item.id}>
                <button
                  className="watch-thumb"
                  onClick={() => onSelect(item)}
                  aria-label={`Open ${item.product_name}`}
                >
                  <ProductImage
                    src={item.product_media?.[0]?.signed_url || item.image_url}
                    name={item.product_name}
                  />
                </button>
                <div>
                  <button className="watch-name" onClick={() => onSelect(item)}>
                    {item.product_name}
                    <ArrowUpRight size={16} />
                  </button>
                  <p className="watch-meta">
                    {item.retailer || item.category} ·{" "}
                    {checked
                      ? `Last checked ${new Date(checked).toLocaleDateString("en-IN")}`
                      : "Not checked yet"}
                  </p>
                </div>
                <div className="watch-prices">
                  <div>
                    <span>Saved price</span>
                    <strong>{money(saved, item.currency)}</strong>
                  </div>
                  <div>
                    <span>Latest recorded</span>
                    <strong>{money(current, item.currency)}</strong>
                  </div>
                  <div>
                    <span>Since saving</span>
                    <strong
                      className={
                        percent != null && percent < 0 ? "green-text" : ""
                      }
                    >
                      {percent == null
                        ? "Not available"
                        : `${percent > 0 ? "+" : ""}${percent.toFixed(1)}%`}
                    </strong>
                  </div>
                </div>
                <div className="watch-target">
                  <span>
                    Target ·{" "}
                    {item.target_price != null
                      ? money(item.target_price, item.currency)
                      : "Not set"}
                  </span>
                  {item.target_price != null && current != null && (
                    <>
                      <progress
                        max="100"
                        value={
                          current <= item.target_price
                            ? 100
                            : Math.min(
                                99,
                                Math.max(
                                  0,
                                  (item.target_price / Math.max(current, 1)) *
                                    100,
                                ),
                              )
                        }
                        aria-label={`Progress toward target price for ${item.product_name}`}
                      />
                      <span>
                        {current <= item.target_price
                          ? "At or below your target"
                          : `${money(current - item.target_price, item.currency)} above target`}
                      </span>
                    </>
                  )}
                </div>
                <button
                  className="btn secondary"
                  disabled={Boolean(reason) || busy.includes(item.id)}
                  onClick={() => check(item)}
                  title={reason || "Request a fresh price check"}
                >
                  <RefreshCw
                    size={16}
                    className={busy.includes(item.id) ? "spin" : ""}
                  />
                  {busy.includes(item.id) ? "Checking…" : "Check price"}
                </button>
                {reason && <p className="watch-check-note">{reason}</p>}
                {errors[item.id] && (
                  <div className="watch-check-note">
                    <ErrorText>{errors[item.id]}</ErrorText>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title={
            items.length
              ? "No wishes in this segment."
              : "Nothing to monitor yet."
          }
          body={
            items.length
              ? "Try All or reset the search and filters."
              : "Add a wish with a price to start watching."
          }
        />
      )}
    </>
  );
}
