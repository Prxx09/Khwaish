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
import {
  Avatar,
  ErrorText,
  Modal,
  ProductImage,
  StoreLink,
  ConfirmDialog,
} from "./ui";
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
  const [status, setStatus] = useState(item.status);
  const [priority, setPriority] = useState(item.priority);
  const [tracking, setTracking] = useState(item.tracking_enabled ?? false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const dirty =
    name !== item.product_name ||
    notes !== item.notes ||
    target !== (item.target_price?.toString() ?? "") ||
    variant !== (item.variant ?? "") ||
    link !== (item.product_url ?? "") ||
    date !== (item.target_date ?? "") ||
    status !== item.status ||
    priority !== item.priority ||
    tracking !== (item.tracking_enabled ?? false);
  function discard() {
    setName(item.product_name);
    setNotes(item.notes);
    setTarget(item.target_price?.toString() ?? "");
    setVariant(item.variant ?? "");
    setLink(item.product_url ?? "");
    setDate(item.target_date ?? "");
    setStatus(item.status);
    setPriority(item.priority);
    setTracking(item.tracking_enabled ?? false);
    setError("");
  }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [comment, setComment] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);
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
        if (!cancelled) {
          setError(error.message);
          setCommentsLoading(false);
        }
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
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "item_comments" },
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
          status,
          priority,
          tracking_enabled: tracking,
        })
      ) {
        notify("Details updated.");
      } else
        setError(
          "Your changes were not saved. Review the notification and try again.",
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  async function removeMessages() {
    if (!deleteMessage || commentBusy || isDemo) return;
    setCommentBusy(true);
    setError("");
    try {
      let request = createClient()
        .from("item_comments")
        .delete()
        .eq("wishlist_item_id", item.id)
        .eq("user_id", userId);
      if (deleteMessage !== "all") request = request.eq("id", deleteMessage);
      const { data, error } = await request.select("id");
      if (error) throw error;
      const removed = new Set((data ?? []).map((row) => row.id));
      setComments((rows) => rows.filter((row) => !removed.has(row.id)));
      setDeleteMessage(null);
      notify(
        removed.size ? "Your messages were deleted." : "No messages to delete.",
      );
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not delete messages.",
      );
    } finally {
      setCommentBusy(false);
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
          "Sign in to request store matches. You can open the retailer searches below now.",
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
        throw new Error(
          "Sign in to save comments. Guest comments are not stored.",
        );
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
      onClose={() => {
        if (dirty) setConfirmDiscard(true);
        else onClose();
      }}
      title={item.product_name}
      subtitle={`${item.retailer || "Saved wish"} · Saved ${new Date(item.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`}
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
          ? "Price entered on this device. Sign in for live checks."
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
      {(isDemo || !canEdit || !item.product_url) && (
        <p className="form-footnote">
          {isDemo
            ? "Sign in to check live prices and enable scheduled tracking."
            : !canEdit
              ? "You can browse and comment. Only editors can change this wish or check prices."
              : "Add a product link in Details to check prices."}
        </p>
      )}
      <div className="detail-tabs" role="tablist" aria-label="Product details">
        {[
          { id: "overview", label: "Details" },
          { id: "history", label: "Price history" },
          { id: "compare", label: "Compare" },
          { id: "notes", label: "Conversation" },
        ].map((t) => (
          <button
            role="tab"
            id={`wish-tab-${item.id}-${t.id}`}
            aria-controls={`wish-panel-${item.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            aria-selected={tab === t.id}
            key={t.id}
            className={tab === t.id ? "active" : ""}
            onClick={() => setTab(t.id)}
            onKeyDown={(event) => {
              if (
                !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
              )
                return;
              event.preventDefault();
              const buttons = Array.from(
                event.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>(
                  '[role="tab"]',
                ),
              );
              const current = buttons.indexOf(event.currentTarget);
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? buttons.length - 1
                    : (current +
                        (event.key === "ArrowRight" ? 1 : -1) +
                        buttons.length) %
                      buttons.length;
              buttons[next].click();
              buttons[next].focus();
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`wish-panel-${item.id}`}
        aria-labelledby={`wish-tab-${item.id}-${tab}`}
        tabIndex={0}
      >
        <ErrorText>{error}</ErrorText>
        {tab === "overview" && (
          <form
            className="form-stack detail-form"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <div className="form-row">
              <label>
                Status
                <select
                  aria-label="Status"
                  value={status}
                  disabled={!canEdit}
                  onChange={(e) => setStatus(e.target.value as Item["status"])}
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
                  aria-label="Priority"
                  value={priority}
                  disabled={!canEdit}
                  onChange={(e) =>
                    setPriority(e.target.value as Item["priority"])
                  }
                >
                  <option value="high">Must-have</option>
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
                checked={tracking}
                disabled={isDemo || !canEdit || !item.product_url}
                onChange={(e) => setTracking(e.target.checked)}
              />
              <span>
                Include in scheduled price watch
                <small>
                  {isDemo
                    ? "Sign in to enable scheduled tracking."
                    : !item.product_url
                      ? "Add a product link to enable tracking."
                      : !canEdit
                        ? "Only editors can change tracking."
                        : "Requires a configured tracking worker. On-demand checks remain available for supported pages."}
                </small>
              </span>
            </label>
            <label>
              Notes
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
            <p className="form-footnote">
              <ShieldCheck size={13} /> Source:{" "}
              {item.extraction_source?.startsWith("on_device_ocr")
                ? "Screenshot OCR"
                : item.extraction_source?.replaceAll("_", " ") ||
                  "Manually added"}
              . Only people with access can see these details.
            </p>
            {canEdit && (
              <div className="danger-zone">
                <button
                  type="button"
                  className="text-btn danger-text"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 size={16} />
                  Remove this wish
                </button>
              </div>
            )}
            {canEdit && dirty && (
              <div className="save-bar">
                <span>Unsaved changes</span>
                <button
                  type="button"
                  className="btn secondary"
                  disabled={busy}
                  onClick={discard}
                >
                  Discard
                </button>
                <button
                  type="submit"
                  className="btn primary"
                  disabled={busy || !name.trim() || Number(target) < 0}
                >
                  {busy ? "Saving…" : "Save changes"}
                  <Check size={16} />
                </button>
              </div>
            )}
          </form>
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
                  (a, b) =>
                    Date.parse(b.observed_at) - Date.parse(a.observed_at),
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
              {comments.some((message) => message.user_id === userId) && (
                <button
                  type="button"
                  className="text-btn"
                  onClick={() => setDeleteMessage("all")}
                >
                  <Trash2 size={15} />
                  Clear my messages
                </button>
              )}
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
                    {c.user_id === userId && (
                      <button
                        className="text-btn"
                        type="button"
                        aria-label="Delete this message"
                        onClick={() => setDeleteMessage(c.id)}
                      >
                        <Trash2 size={14} />
                        Delete
                      </button>
                    )}
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
                disabled={isDemo}
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
            {isDemo && (
              <p className="form-footnote">
                Sign in to add and save messages. Guest conversations are not
                stored.
              </p>
            )}
          </div>
        )}
      </div>
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        title="Remove this wish?"
        description="This removes the wish, its recorded prices, screenshots, and conversation. This cannot be undone."
        confirmLabel="Remove wish"
        busy={deleting}
      />
      <ConfirmDialog
        open={Boolean(deleteMessage)}
        onClose={() => setDeleteMessage(null)}
        onConfirm={removeMessages}
        title={
          deleteMessage === "all"
            ? "Clear your messages?"
            : "Delete this message?"
        }
        description={
          deleteMessage === "all"
            ? "Only your messages in this wish’s conversation will be deleted. This cannot be undone."
            : "This message will be deleted permanently."
        }
        confirmLabel={
          deleteMessage === "all" ? "Clear my messages" : "Delete message"
        }
        busy={commentBusy}
      />
      <ConfirmDialog
        open={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        onConfirm={() => {
          discard();
          setConfirmDiscard(false);
          onClose();
        }}
        title="Discard unsaved changes?"
        description="Your edits to this wish haven’t been saved."
        confirmLabel="Discard changes"
      />
    </Modal>
  );
}
