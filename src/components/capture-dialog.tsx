"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Check,
  ImagePlus,
  Link2,
  LoaderCircle,
  PenLine,
  ScanText,
  Sparkles,
  Upload,
} from "lucide-react";
import { CATEGORIES, type ExtractedProduct, type Library } from "@/lib/types";
import { ErrorText, Modal, ProductImage } from "./ui";
export type Draft = {
  product_name: string;
  product_url: string;
  image_url: string;
  price: string;
  brand: string;
  category: string;
  retailer: string;
  product_code: string;
  variant: string;
  priority: "high" | "medium" | "low";
  notes: string;
  target_price: string;
  target_date: string;
  currency: string;
  library_id: string;
  source: string;
  confidence: number;
  availability: string;
};
const initial = (libraryId: string): Draft => ({
  product_name: "",
  product_url: "",
  image_url: "",
  price: "",
  brand: "",
  category: "Other",
  retailer: "",
  product_code: "",
  variant: "",
  priority: "medium",
  notes: "",
  target_price: "",
  target_date: "",
  currency: "INR",
  library_id: libraryId,
  source: "manual",
  confidence: 1,
  availability: "unknown",
});
export default function CaptureDialog({
  open,
  onClose,
  libraries,
  libraryId,
  onSave,
  isDemo,
}: {
  open: boolean;
  onClose: () => void;
  libraries: Library[];
  libraryId: string;
  onSave: (draft: Draft, file: File | null) => Promise<boolean>;
  isDemo: boolean;
}) {
  const [tab, setTab] = useState<"link" | "screenshot" | "manual">("link");
  const [draft, setDraft] = useState<Draft>(initial(libraryId));
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [ready, setReady] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  useEffect(() => {
    if (open) {
      setDraft(initial(libraryId));
      setReady(false);
      setFile(null);
      setUrl("");
      setError("");
      setNotice("");
      setProgress(0);
      setBusy(false);
      setTab("link");
    }
    generation.current++;
  }, [open, libraryId]);
  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  function field<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }
  async function extractLink() {
    setError("");
    setNotice("");
    if (isDemo) {
      setDraft((d) => ({ ...d, product_url: url }));
      setReady(true);
      setNotice(
        "Sign in to fetch product details. You can save a manual entry to this device now. Guest screenshots last only until you reload.",
      );
      return;
    }
    setBusy(true);
    const current = generation.current;
    try {
      const res = await fetch("/api/metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (current !== generation.current) return;
      const p = data as ExtractedProduct;
      setDraft((d) => ({
        ...d,
        product_name: p.product_name,
        product_url: p.product_url,
        image_url: p.image_url,
        price: p.price == null ? "" : String(p.price),
        currency: p.currency,
        brand: p.brand,
        category: CATEGORIES.includes(p.category) ? p.category : "Other",
        retailer: p.retailer,
        product_code: p.product_code,
        variant: p.variant,
        source: p.source,
        confidence: p.confidence,
        availability: p.availability,
      }));
      setReady(true);
      setNotice(
        p.warning ??
          "Details found. Check the model, variant, image, and price before saving.",
      );
    } catch (e) {
      if (current === generation.current) {
        setError(
          e instanceof Error ? e.message : "Could not preview this link.",
        );
        setDraft((d) => ({ ...d, product_url: url }));
        setReady(true);
      }
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  async function readScreenshot(selected: File | undefined) {
    if (!selected) return;
    setError("");
    setNotice("");
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(selected.type) ||
      selected.size > 10 * 1024 * 1024
    ) {
      setError("Use a JPG, PNG, or WebP screenshot under 10 MB.");
      return;
    }
    setFile(selected);
    setBusy(true);
    setProgress(0);
    const current = generation.current;
    let worker:
      | Awaited<ReturnType<(typeof import("tesseract.js"))["createWorker"]>>
      | undefined;
    try {
      const { createWorker } = await import("tesseract.js");
      worker = await createWorker("eng", 1, {
        logger: (m) => {
          if (m.status === "recognizing text" && current === generation.current)
            setProgress(Math.round(m.progress * 100));
        },
      });
      const { data } = await worker.recognize(selected);
      if (current !== generation.current) return;
      const lines = data.text
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      const name =
        lines.find(
          (l) =>
            l.length > 18 &&
            !/amazon|flipkart|myntra|add to|buy now|delivery|search|wishlist|sign in|free shipping/i.test(
              l,
            ),
        ) ?? "";
      const prices = [
        ...data.text.matchAll(/(?:₹|Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)/gi),
      ];
      const detectedUrl = data.text.match(/https?:\/\/[^\s]+/)?.[0] ?? "";
      setDraft((d) => ({
        ...d,
        product_name: name.slice(0, 240),
        price: prices[0]?.[1].replace(/,/g, "") ?? "",
        product_url: detectedUrl,
        retailer: /amazon/i.test(data.text)
          ? "Amazon"
          : /flipkart/i.test(data.text)
            ? "Flipkart"
            : /myntra/i.test(data.text)
              ? "Myntra"
              : "",
        source: "on_device_ocr",
        confidence: data.confidence / 100,
      }));
      setReady(true);
      setNotice(
        "Read on your device. OCR can mix up names and sale prices—review the details below. Add a store link to fetch a stock image and check future prices.",
      );
    } catch {
      if (current === generation.current) {
        setReady(true);
        setError(
          "OCR could not finish on this device. The screenshot is still attached; enter the details manually.",
        );
      }
    } finally {
      await worker?.terminate();
      if (current === generation.current) setBusy(false);
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (await onSave(draft, file)) onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the product.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal
      open={open}
      onClose={() => {
        if (!saving) onClose();
      }}
      title="Found something you love?"
      subtitle="Drop it here. Your future self will thank you."
      wide
    >
      <div className="capture-tabs">
        {(
          [
            { id: "link", label: "Paste a link", Icon: Link2 },
            { id: "screenshot", label: "Screenshot", Icon: ScanText },
            { id: "manual", label: "Add manually", Icon: PenLine },
          ] as const
        ).map(({ id, label, Icon }) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            onClick={() => {
              setTab(id);
              if (id === "manual") setReady(true);
            }}
          >
            <Icon size={17} />
            {label}
          </button>
        ))}
      </div>
      {tab === "link" && (
        <div className="capture-link">
          <div className="input-icon">
            <Link2 size={18} />
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste an Amazon, Flipkart, Myntra, or any product link…"
              aria-label="Product link"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !busy && url) extractLink();
              }}
            />
          </div>
          <button
            className="btn primary"
            disabled={!url || busy}
            onClick={extractLink}
          >
            {busy ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <Sparkles size={17} />
            )}
            Find details
          </button>
        </div>
      )}
      {tab === "screenshot" && (
        <>
          <input
            ref={input}
            className="visually-hidden"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => readScreenshot(e.target.files?.[0])}
          />
          <button
            className="dropzone"
            disabled={busy}
            onClick={() => input.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (!busy) readScreenshot(e.dataTransfer.files[0]);
            }}
          >
            <span className="upload-icon">
              {busy ? <LoaderCircle className="spin" /> : <Upload />}
            </span>
            <strong>
              {busy
                ? `Reading on your device… ${progress}%`
                : "Drop a screenshot, or tap to choose"}
            </strong>
            <span>JPG, PNG, WebP · up to 10 MB · OCR stays on your device</span>
            {busy && (
              <div className="progress">
                <span style={{ width: `${progress}%` }} />
              </div>
            )}
          </button>
        </>
      )}
      <ErrorText>{error}</ErrorText>
      {notice && (
        <p className="notice" role="status">
          <Check size={16} />
          {notice}
        </p>
      )}
      {ready && (
        <form className="capture-form" onSubmit={submit}>
          <div className="capture-preview">
            <ProductImage
              src={draft.image_url || preview}
              name={draft.product_name || "Product preview"}
            />
            <span className="pill">
              {draft.source === "on_device_ocr" ? (
                <ScanText size={12} />
              ) : (
                <ImagePlus size={12} />
              )}{" "}
              {draft.source === "on_device_ocr"
                ? "Screenshot attached"
                : "Product preview"}
            </span>
          </div>
          <div className="form-stack">
            <label>
              Product name
              <input
                required
                maxLength={240}
                value={draft.product_name}
                onChange={(e) => field("product_name", e.target.value)}
                placeholder="Give your wish a name"
              />
            </label>
            <div className="form-row">
              <label>
                Price ({draft.currency})
                <input
                  type="number"
                  min="0"
                  max="9999999999"
                  step="0.01"
                  value={draft.price}
                  onChange={(e) => field("price", e.target.value)}
                  placeholder="Optional"
                />
              </label>
              <label>
                Save to
                <select
                  value={draft.library_id}
                  onChange={(e) => field("library_id", e.target.value)}
                >
                  {libraries.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="form-row">
              <label>
                Category
                <select
                  value={draft.category}
                  onChange={(e) => field("category", e.target.value)}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                Priority
                <select
                  value={draft.priority}
                  onChange={(e) =>
                    field("priority", e.target.value as Draft["priority"])
                  }
                >
                  <option value="high">Must have</option>
                  <option value="medium">Would love</option>
                  <option value="low">Someday</option>
                </select>
              </label>
            </div>
            <details className="extra-fields">
              <summary>More details, variants & goals</summary>
              <div className="form-stack">
                <label>
                  Product link
                  <input
                    type="url"
                    value={draft.product_url}
                    onChange={(e) => field("product_url", e.target.value)}
                    placeholder="https://…"
                  />
                </label>
                <label>
                  Image URL
                  <input
                    type="url"
                    value={draft.image_url}
                    onChange={(e) => field("image_url", e.target.value)}
                    placeholder="Optional stock image link"
                  />
                </label>
                <div className="form-row">
                  <label>
                    Brand
                    <input
                      value={draft.brand}
                      maxLength={120}
                      onChange={(e) => field("brand", e.target.value)}
                    />
                  </label>
                  <label>
                    Store
                    <input
                      value={draft.retailer}
                      maxLength={120}
                      onChange={(e) => field("retailer", e.target.value)}
                    />
                  </label>
                </div>
                <div className="form-row">
                  <label>
                    Product code / SKU
                    <input
                      value={draft.product_code}
                      maxLength={120}
                      onChange={(e) => field("product_code", e.target.value)}
                    />
                  </label>
                  <label>
                    Variant / size / color
                    <input
                      value={draft.variant}
                      maxLength={200}
                      onChange={(e) => field("variant", e.target.value)}
                    />
                  </label>
                </div>
                <div className="form-row">
                  <label>
                    Target price
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={draft.target_price}
                      onChange={(e) => field("target_price", e.target.value)}
                      placeholder="My happy price"
                    />
                  </label>
                  <label>
                    Target date
                    <input
                      type="date"
                      value={draft.target_date}
                      onChange={(e) => field("target_date", e.target.value)}
                    />
                  </label>
                </div>
                <label>
                  Notes
                  <textarea
                    value={draft.notes}
                    maxLength={2000}
                    onChange={(e) => field("notes", e.target.value)}
                    placeholder="Color, size, a reason to love it…"
                    rows={2}
                  />
                </label>
              </div>
            </details>
            <button className="btn primary full" disabled={saving || busy}>
              {saving ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <Sparkles size={17} />
              )}{" "}
              {saving ? "Saving your wish…" : "Add to my wishlist"}
              <ArrowRight size={16} />
            </button>
          </div>
        </form>
      )}
      {!ready && tab === "link" && (
        <div className="capture-hint">
          <span>ONE SHELF. EVERY STORE.</span>
          <div>
            {["Amazon", "Flipkart", "Myntra", "+ any link"].map((s) => (
              <b key={s}>{s}</b>
            ))}
          </div>
          <p>Import what the page shares. Keep full control of the details.</p>
        </div>
      )}
    </Modal>
  );
}
