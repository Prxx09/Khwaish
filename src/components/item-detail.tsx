"use client";
import { useEffect, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  ExternalLink,
  LoaderCircle,
  MessageCircle,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  currentPrice,
  latestPrice,
  money,
  priceDrop,
  STATUS_LABELS,
  type Comment,
  type Item,
  type Profile,
} from "@/lib/types";
import { Avatar, ErrorText, Modal, ProductImage, StoreLink } from "./ui";
type Offer = {
  title: string;
  retailer: string;
  price: number | null;
  url: string;
  image: string | null;
};
function HistoryChart({ item }: { item: Item }) {
  const observations = [...item.price_observations]
    .filter(
      (p) => p.price != null && p.currency.trim() === item.currency.trim(),
    )
    .sort((a, b) => Date.parse(a.observed_at) - Date.parse(b.observed_at));
  const values = [
    ...(item.initial_price != null
      ? [
          {
            price: item.initial_price,
            observed_at: item.initial_price_at ?? item.created_at,
          },
        ]
      : []),
    ...observations,
  ];
  if (!values.length)
    return (
      <p className="muted">
        Add a saved price or check the store to start your history.
      </p>
    );
  const min = Math.min(...values.map((p) => p.price!));
  const max = Math.max(...values.map((p) => p.price!));
  const range = max - min || Math.max(max * 0.1, 1);
  const points = values
    .map(
      (p, i) =>
        `${20 + (i / Math.max(values.length - 1, 1)) * 360},${130 - ((p.price! - min) / range) * 100}`,
    )
    .join(" ");
  return (
    <div className="chart-wrap">
      <div className="chart-scale">
        <span>{money(max, item.currency)}</span>
        <span>{money(min, item.currency)}</span>
      </div>
      <svg
        viewBox="0 0 400 160"
        role="img"
        aria-label={`Price history with ${values.length} observations, from ${money(values[0].price, item.currency)} to ${money(values[values.length - 1].price, item.currency)}`}
      >
        <defs>
          <linearGradient id="chartFade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity=".22" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d={`M ${points.split(" ").join(" L ")} L ${values.length > 1 ? 380 : 20} 155 L 20 155 Z`}
          fill="url(#chartFade)"
        />
        <polyline
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {values.map((p, i) => (
          <circle
            key={i}
            cx={20 + (i / Math.max(values.length - 1, 1)) * 360}
            cy={130 - ((p.price! - min) / range) * 100}
            r="4"
            fill="currentColor"
          />
        ))}
      </svg>
      <div className="chart-dates">
        <span>When saved</span>
        <span>Latest check</span>
      </div>
    </div>
  );
}
export default function ItemDetail({
  item,
  onClose,
  onUpdate,
  onDelete,
  onRefresh,
  canEdit,
  isDemo,
  userId,
  notify,
}: {
  item: Item;
  onClose: () => void;
  onUpdate: (patch: Partial<Item>) => Promise<boolean>;
  onDelete: () => Promise<void>;
  onRefresh: () => Promise<void>;
  canEdit: boolean;
  isDemo: boolean;
  userId: string;
  notify: (s: string) => void;
}) {
  const [tab, setTab] = useState("overview");
  const [notes, setNotes] = useState(item.notes);
  const [target, setTarget] = useState(item.target_price?.toString() ?? "");
  const [name, setName] = useState(item.product_name);
  const [variant, setVariant] = useState(item.variant ?? "");
  const [link, setLink] = useState(item.product_url ?? "");
  const [date, setDate] = useState(item.target_date ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [comment, setComment] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [offerMessage, setOfferMessage] = useState("");
  const [offerBusy, setOfferBusy] = useState(false);
  const latest = latestPrice(item);
  const drop = priceDrop(item);
  useEffect(() => {
    if (tab !== "notes" || isDemo) return;
    let cancelled = false;
    const client = createClient();
    async function load() {
      setCommentsLoading(true);
      const { data, error } = await client
        .from("item_comments")
        .select("*")
        .eq("wishlist_item_id", item.id)
        .order("created_at");
      if (error) {
        if (!cancelled) setError(error.message);
        return;
      }
      const ids = [...new Set((data ?? []).map((c) => c.user_id))];
      const profiles = ids.length
        ? ((await client.from("profiles").select("*").in("id", ids)).data ?? [])
        : [];
      if (!cancelled) {
        setComments(
          (data ?? []).map((c) => ({
            ...c,
            profile: profiles.find((p: Profile) => p.id === c.user_id),
          })),
        );
        setCommentsLoading(false);
      }
    }
    load();
    const channel = client
      .channel(`comments-${item.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "item_comments",
          filter: `wishlist_item_id=eq.${item.id}`,
        },
        load,
      )
      .subscribe();
    return () => {
      cancelled = true;
      client.removeChannel(channel);
    };
  }, [tab, item.id, isDemo]);
  async function save() {
    setBusy(true);
    setError("");
    try {
      if (
        await onUpdate({
          product_name: name,
          notes,
          target_price: target === "" ? null : Number(target),
          variant,
          product_url: link || null,
          target_date: date || null,
        })
      )
        notify("Details updated.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    setBusy(true);
    setError("");
    try {
      await onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not check this price.");
    } finally {
      setBusy(false);
    }
  }
  async function searchOffers() {
    setOfferBusy(true);
    setError("");
    try {
      if (isDemo) {
        setOfferMessage(
          "Demo prices are illustrative. Open a store below to search for this product.",
        );
        return;
      }
      const res = await fetch("/api/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: [
            item.brand,
            item.product_name,
            item.product_code,
            item.variant,
          ]
            .filter(Boolean)
            .join(" ")
            .slice(0, 240),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setOffers(data.offers);
      setOfferMessage(data.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Store search unavailable.");
    } finally {
      setOfferBusy(false);
    }
  }
  async function addComment() {
    if (!comment.trim()) return;
    setCommentBusy(true);
    setError("");
    try {
      if (isDemo) {
        setComments((c) => [
          ...c,
          {
            id: crypto.randomUUID(),
            wishlist_item_id: item.id,
            user_id: userId,
            body: comment.trim(),
            created_at: new Date().toISOString(),
            profile: { id: userId, display_name: "You", avatar_path: null },
          },
        ]);
      } else {
        const { data, error } = await createClient()
          .from("item_comments")
          .insert({
            wishlist_item_id: item.id,
            user_id: userId,
            body: comment.trim(),
          })
          .select()
          .single();
        if (error) throw error;
        setComments((c) =>
          c.some((x) => x.id === data.id)
            ? c
            : [
                ...c,
                {
                  ...data,
                  profile: {
                    id: userId,
                    display_name: "You",
                    avatar_path: null,
                  },
                },
              ],
        );
      }
      setComment("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add your comment.");
    } finally {
      setCommentBusy(false);
    }
  }
  async function remove() {
    setDeleting(true);
    try {
      await onDelete();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete the item.");
    } finally {
      setDeleting(false);
    }
  }
  const query = encodeURIComponent(
    [item.product_name, item.variant].filter(Boolean).join(" "),
  );
  return (
    <Modal
      open
      onClose={onClose}
      title="A closer look"
      subtitle={`${item.retailer || "Your find"} · Saved ${new Date(item.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`}
      sheet
    >
      <div className="detail-image">
        <ProductImage
          src={item.product_media?.[0]?.signed_url || item.image_url}
          name={item.product_name}
        />
        <span className="pill">{item.category || "Other"}</span>
      </div>
      <div className="detail-title">
        <h2>{item.product_name}</h2>
        <p>{[item.brand, item.variant].filter(Boolean).join(" · ")}</p>
      </div>
      <div className="detail-price">
        <div>
          <span className="eyebrow">
            {latest && !latest.source.startsWith("saved_")
              ? "LAST CHECKED PRICE"
              : "PRICE WHEN SAVED"}
          </span>
          <strong>{money(currentPrice(item), item.currency)}</strong>
        </div>
        {drop > 0 && (
          <span className="price-good">
            <ArrowDownRight size={18} /> {money(drop, item.currency)} less
          </span>
        )}
      </div>
      <p className="price-disclaimer">
        {isDemo
          ? "Illustrative demo price."
          : latest
            ? `${latest.source.startsWith("saved_") ? "Recorded" : "Checked"} ${new Date(latest.observed_at).toLocaleString("en-IN")} · ${latest.source.replaceAll("_", " ")}`
            : "No current price check yet."}{" "}
        Final price and availability are confirmed by the store.
      </p>
      <div className="detail-actions">
        <StoreLink url={item.product_url} label="Visit store" />
        <button
          className="btn primary"
          disabled={busy || !canEdit || isDemo || !item.product_url}
          onClick={refresh}
        >
          <RefreshCw size={16} className={busy ? "spin" : ""} />
          {busy ? "Checking…" : "Check price"}
        </button>
      </div>
      <div className="detail-tabs" role="tablist" aria-label="Product details">
        {[
          { id: "overview", label: "Details" },
          { id: "history", label: "Price history" },
          { id: "compare", label: "Compare" },
          { id: "notes", label: "Conversation" },
        ].map((t) => (
          <button
            role="tab"
            aria-selected={tab === t.id}
            key={t.id}
            className={tab === t.id ? "active" : ""}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <ErrorText>{error}</ErrorText>
      {tab === "overview" && (
        <div className="form-stack detail-form">
          <div className="form-row">
            <label>
              Status
              <select
                value={item.status}
                disabled={!canEdit}
                onChange={(e) =>
                  onUpdate({ status: e.target.value as Item["status"] })
                }
              >
                {Object.entries(STATUS_LABELS).map(([v, l]) => (
                  <option value={v} key={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Priority
              <select
                value={item.priority}
                disabled={!canEdit}
                onChange={(e) =>
                  onUpdate({ priority: e.target.value as Item["priority"] })
                }
              >
                <option value="high">Must have</option>
                <option value="medium">Would love</option>
                <option value="low">Someday</option>
              </select>
            </label>
          </div>
          <label>
            Product name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!canEdit}
              maxLength={240}
              required
            />
          </label>
          <label>
            Variant / size / color
            <input
              value={variant}
              onChange={(e) => setVariant(e.target.value)}
              disabled={!canEdit}
              maxLength={200}
            />
          </label>
          <label>
            Product link
            <input
              type="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              disabled={!canEdit}
            />
          </label>
          <div className="form-row">
            <label>
              My happy price ({item.currency})
              <input
                type="number"
                min="0"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                disabled={!canEdit}
                placeholder="Set a target"
              />
            </label>
            <label>
              Target date
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                disabled={!canEdit}
              />
            </label>
          </div>
          {item.target_price != null &&
            currentPrice(item) != null &&
            currentPrice(item)! <= item.target_price && (
              <p className="notice success">
                <Check size={16} />
                Your saved price is at or below your target.
              </p>
            )}
          <label className="watch-option">
            <input
              type="checkbox"
              checked={item.tracking_enabled ?? false}
              disabled={!canEdit || !item.product_url}
              onChange={(e) => onUpdate({ tracking_enabled: e.target.checked })}
            />
            <span>
              Include in scheduled price watch
              <small>
                Requires a configured tracking worker. On-demand checks are
                always available for supported pages.
              </small>
            </span>
          </label>
          <label>
            Little details
            <textarea
              rows={3}
              value={notes}
              maxLength={2000}
              onChange={(e) => setNotes(e.target.value)}
              disabled={!canEdit}
              placeholder="Why you love it, size, or a reminder…"
            />
          </label>
          {item.product_code && (
            <p className="form-footnote">Product code: {item.product_code}</p>
          )}
          {canEdit && (
            <button
              className="btn primary"
              onClick={save}
              disabled={busy || !name.trim() || Number(target) < 0}
            >
              Save changes
              <Check size={16} />
            </button>
          )}
          <p className="form-footnote">
            <ShieldCheck size={13} /> Source:{" "}
            {item.extraction_source?.replaceAll("_", " ") || "Manually added"}.
            Shared library members can see these details.
          </p>
          {canEdit && (
            <div className="danger-zone">
              {confirmDelete ? (
                <>
                  <p>Remove this wish and its price history?</p>
                  <button
                    className="btn danger"
                    disabled={deleting}
                    onClick={remove}
                  >
                    {deleting ? "Removing…" : "Yes, remove wish"}
                  </button>
                  <button
                    className="text-btn"
                    onClick={() => setConfirmDelete(false)}
                  >
                    Keep it
                  </button>
                </>
              ) : (
                <button
                  className="text-btn danger-text"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 size={15} />
                  Remove this wish
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {tab === "history" && (
        <div className="detail-section">
          <div className="section-heading">
            <div>
              <span className="eyebrow">THE LONG GAME</span>
              <h3>Good things come to those who watch.</h3>
            </div>
          </div>
          <div className="history-summary">
            <div>
              <span>When saved</span>
              <strong>{money(item.initial_price, item.currency)}</strong>
            </div>
            <div>
              <span>Change since saving</span>
              <strong className={drop > 0 ? "green-text" : ""}>
                {drop > 0
                  ? `−${money(drop, item.currency)}`
                  : "No recorded drop"}
              </strong>
            </div>
          </div>
          <HistoryChart item={item} />
          <div className="history-list">
            {[...item.price_observations]
              .sort(
                (a, b) => Date.parse(b.observed_at) - Date.parse(a.observed_at),
              )
              .map((p) => (
                <div key={p.id}>
                  <span>
                    {new Date(p.observed_at).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                    <small>
                      {p.source.replaceAll("_", " ")} ·{" "}
                      {p.availability.replaceAll("_", " ")}
                    </small>
                  </span>
                  <strong>{money(p.price, p.currency)}</strong>
                </div>
              ))}
          </div>
          <p className="notice">
            Tracking begins when you save a product. Prices are observations,
            not a guarantee of checkout price or historical retailer lows.
          </p>
        </div>
      )}
      {tab === "compare" && (
        <div className="detail-section">
          <span className="eyebrow">SAME WISH. MORE POSSIBILITIES.</span>
          <h3>Find it around the web.</h3>
          <p className="muted">
            Always compare the same model, color, size, seller, and delivery
            costs.
          </p>
          <button
            className="btn primary full"
            onClick={searchOffers}
            disabled={offerBusy}
          >
            {offerBusy ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <Sparkles size={16} />
            )}
            Find store matches
          </button>
          {offerMessage && <p className="notice">{offerMessage}</p>}
          {offers.map((o, i) => (
            <a
              key={i}
              href={o.url}
              target="_blank"
              rel="noopener noreferrer"
              className="offer-card"
            >
              <ProductImage src={o.image} name={o.title} />
              <div>
                <span>{o.retailer}</span>
                <strong>{o.title}</strong>
                <b>{o.price != null ? money(o.price) : "View store price"}</b>
              </div>
              <ExternalLink size={15} />
            </a>
          ))}
          <div className="retailer-searches">
            {[
              { name: "Amazon", url: `https://www.amazon.in/s?k=${query}` },
              {
                name: "Flipkart",
                url: `https://www.flipkart.com/search?q=${query}`,
              },
              {
                name: "Myntra",
                url: `https://www.myntra.com/${encodeURIComponent(item.product_name.replaceAll(" ", "-"))}`,
              },
              {
                name: "Google Shopping",
                url: `https://www.google.com/search?tbm=shop&q=${query}`,
              },
            ].map((s) => (
              <a
                key={s.name}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span>Search {s.name}</span>
                <ArrowUpRight size={17} />
              </a>
            ))}
          </div>
          <p className="form-footnote">
            Search links are discovery options, not confirmed offers or stock
            availability.
          </p>
        </div>
      )}
      {tab === "notes" && (
        <div className="detail-section">
          <div className="section-heading">
            <h3>
              <MessageCircle size={18} />
              Talk about this wish
            </h3>
          </div>
          <p className="muted">A little context for you and your people.</p>
          {commentsLoading ? (
            <p>Loading conversation…</p>
          ) : comments.length === 0 ? (
            <div className="comments-empty">
              No thoughts yet. Start the conversation.
            </div>
          ) : (
            comments.map((c) => (
              <div className="comment" key={c.id}>
                <Avatar
                  name={c.profile?.display_name || "Member"}
                  size="small"
                />
                <div>
                  <strong>{c.profile?.display_name || "Member"}</strong>
                  <small>
                    {new Date(c.created_at).toLocaleDateString("en-IN")}
                  </small>
                  <p>{c.body}</p>
                </div>
              </div>
            ))
          )}
          <form
            className="comment-form"
            onSubmit={(e) => {
              e.preventDefault();
              addComment();
            }}
          >
            <input
              maxLength={2000}
              placeholder="Love this one? Leave a thought…"
              aria-label="Comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <button
              className="icon-btn accent"
              type="submit"
              disabled={!comment.trim() || commentBusy}
              aria-label="Send comment"
            >
              <Send size={18} />
            </button>
          </form>
        </div>
      )}
    </Modal>
  );
}
