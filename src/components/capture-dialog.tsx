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
import { parseOcrProduct, prepareOcrImage } from "@/lib/ocr-product";
import {
  structureNotes,
  type StructuredProduct,
} from "@/lib/product-structure";
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
  raw_ocr_text?: string;
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
  const [ocrText, setOcrText] = useState("");
  const [priceCandidates, setPriceCandidates] = useState<number[]>([]);
  const [useAi, setUseAi] = useState(true);
  const [aiBusy, setAiBusy] = useState(false);
  const [clipboardBusy, setClipboardBusy] = useState(false);
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
      setOcrText("");
      setPriceCandidates([]);
      setAiBusy(false);
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
  useEffect(() => {
    if (!open || tab !== "screenshot") return;
    const paste = (event: ClipboardEvent) => {
      if (busy || aiBusy || saving) return;
      const image = Array.from(event.clipboardData?.items ?? [])
        .find((item) => item.kind === "file" && item.type.startsWith("image/"))
        ?.getAsFile();
      if (!image) return;
      event.preventDefault();
      void readScreenshot(image);
    };
    window.addEventListener("paste", paste);
    return () => window.removeEventListener("paste", paste);
  }, [open, tab, busy, aiBusy, saving, useAi, isDemo]);
  async function pasteFromClipboard() {
    if (busy || aiBusy || saving || clipboardBusy) return;
    const version = generation.current;
    setError("");
    if (!navigator.clipboard?.read) {
      setError(
        "Press Ctrl+V (⌘V on Mac) to paste a copied screenshot, or choose an image file.",
      );
      return;
    }
    setClipboardBusy(true);
    try {
      const items = await navigator.clipboard.read();
      const item = items.find((item) =>
        item.types.some((type) =>
          ["image/png", "image/jpeg", "image/webp"].includes(type),
        ),
      );
      const type = item?.types.find((type) =>
        ["image/png", "image/jpeg", "image/webp"].includes(type),
      );
      if (!item || !type) {
        setError(
          "No screenshot found on the clipboard. Copy an image first, then paste it here.",
        );
        return;
      }
      const blob = await item.getType(type);
      if (version !== generation.current) return;
      await readScreenshot(
        new File([blob], `clipboard-${Date.now()}.${type.split("/")[1]}`, {
          type,
        }),
      );
    } catch {
      setError(
        "Clipboard access wasn't available. Press Ctrl+V (⌘V on Mac), or choose an image file.",
      );
    } finally {
      setClipboardBusy(false);
    }
  }
  function field<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }
  async function structureText(text: string, version = generation.current) {
    setAiBusy(true);
    try {
      const response = await fetch("/api/structure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(45000),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "AI structuring unavailable.");
      if (version !== generation.current) return;
      const product = body.product as StructuredProduct;
      const extraNotes = structureNotes(product);
      setDraft((draft) => ({
        ...draft,
        product_name: product.product_name ?? "",
        price: product.price == null ? "" : String(product.price),
        brand: product.brand ?? "",
        retailer: product.retailer ?? "",
        category: product.category,
        product_code: product.product_code ?? "",
        product_url: product.product_url ?? draft.product_url,
        variant: [product.model, product.color, product.size, product.capacity]
          .filter(Boolean)
          .join(" · ")
          .slice(0, 200),
        currency: product.currency ?? draft.currency,
        availability: product.availability,
        notes: extraNotes,
        source: "on_device_ocr_groq",
        raw_ocr_text: text,
      }));
      setNotice(
        [
          "AI structured the OCR text. Review all fields; extra details are in Notes.",
          ...product.warnings,
        ].join(" "),
      );
    } catch (error) {
      if (version === generation.current)
        setNotice(
          `${error instanceof Error ? error.message : "AI structuring failed."} Local OCR results are still available for review.`,
        );
    } finally {
      if (version === generation.current) setAiBusy(false);
    }
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
    if (!selected || busy || aiBusy) return;
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
    setOcrText("");
    setPriceCandidates([]);
    const current = ++generation.current;
    let worker:
      | Awaited<ReturnType<(typeof import("tesseract.js"))["createWorker"]>>
      | undefined;
    try {
      const { createWorker, PSM } = await import("tesseract.js");
      worker = await createWorker("eng", 1, {
        logger: (m) => {
          if (m.status === "recognizing text" && current === generation.current)
            setProgress(Math.round(m.progress * 100));
        },
      });
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SPARSE_TEXT,
        preserve_interword_spaces: "1",
        user_defined_dpi: "300",
      });
      const prepared = await prepareOcrImage(selected).catch(() => selected);
      if (current !== generation.current) return;
      const { data } = await worker.recognize(prepared);
      if (current !== generation.current) return;
      const extracted = parseOcrProduct(data.text);
      const lowConfidence = data.confidence < 40;
      setOcrText(data.text);
      setPriceCandidates(extracted.priceCandidates);
      setDraft((d) => ({
        ...d,
        product_name: lowConfidence ? "" : extracted.productName,
        price: lowConfidence ? "" : extracted.price,
        product_url: extracted.url,
        retailer: extracted.retailer,
        category: extracted.category,
        source: "on_device_ocr",
        confidence: data.confidence / 100,
        raw_ocr_text: data.text,
      }));
      setReady(true);
      setNotice(
        lowConfidence
          ? "The screenshot text is unclear. Crop around the product title and price, then upload again, or enter the details below."
          : [
              "Read on your device. Review the title and selling price before saving.",
              ...extracted.warnings,
            ].join(" "),
      );
      if (useAi && !isDemo && data.text.trim().length >= 8)
        await structureText(data.text, current);
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
    if (busy || aiBusy || saving) return;
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
      title="Add a wish"
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
            disabled={busy || aiBusy || saving}
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
            className={ready ? "btn secondary" : "btn primary"}
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
          <label className="ai-consent">
            <input
              type="checkbox"
              checked={useAi && !isDemo}
              disabled={busy || aiBusy || isDemo}
              onChange={(event) => setUseAi(event.target.checked)}
            />
            <span>
              Use AI to fill the product fields
              <p>
                The image is read on your device. Recognized text is sent to the
                AI service to fill product fields.{" "}
                {isDemo
                  ? "Sign in to enable AI."
                  : "Turn off for local-only extraction."}
              </p>
            </span>
          </label>
          <input
            ref={input}
            className="visually-hidden"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              void readScreenshot(file);
            }}
          />
          <button
            className="dropzone"
            disabled={busy || aiBusy}
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
              {aiBusy
                ? "Structuring product details with AI…"
                : busy
                  ? `Reading on your device… ${progress}%`
                  : "Drop a screenshot, or tap to choose"}
            </strong>
            <span>JPG, PNG, WebP · up to 10 MB · local OCR first</span>
            {busy && (
              <div
                className="progress"
                role="progressbar"
                aria-label="Recognizing screenshot text"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <span style={{ width: `${progress}%` }} />
              </div>
            )}
          </button>
          <div className="clipboard-actions">
            <button
              type="button"
              className="btn secondary"
              disabled={busy || aiBusy || saving || clipboardBusy}
              onClick={pasteFromClipboard}
            >
              <ImagePlus size={17} />
              {clipboardBusy && !busy
                ? "Reading clipboard…"
                : "Paste image from clipboard"}
            </button>
            <span>
              Or press <kbd>Ctrl</kbd> + <kbd>V</kbd> · <kbd>⌘V</kbd> on Mac
            </span>
          </div>
        </>
      )}
      <ErrorText>{error}</ErrorText>
      {tab === "screenshot" && ocrText && !isDemo && !busy && (
        <button
          type="button"
          className="btn secondary"
          disabled={aiBusy || saving}
          onClick={() => structureText(ocrText)}
        >
          <Sparkles size={16} />
          {aiBusy ? "Structuring…" : "Structure OCR text with AI"}
        </button>
      )}
      {notice && (
        <p className="notice" role="status">
          <Check size={16} />
          {notice}
        </p>
      )}
      {tab === "screenshot" && priceCandidates.length > 0 && (
        <div className="ocr-candidates" aria-label="Detected price candidates">
          <p>Detected amounts · choose only the product’s selling price</p>
          {priceCandidates.map((price) => (
            <button
              key={price}
              type="button"
              className="btn secondary"
              aria-pressed={draft.price === String(price)}
              onClick={() => field("price", String(price))}
            >
              ₹{price.toLocaleString("en-IN")}
            </button>
          ))}
        </div>
      )}
      {tab === "screenshot" && ocrText && (
        <details className="ocr-evidence">
          <summary>Check the text read from your screenshot</summary>
          <pre>{ocrText}</pre>
        </details>
      )}
      {ready && (
        <form className="capture-form" onSubmit={submit}>
          <div className="capture-preview">
            <ProductImage
              src={draft.image_url || preview}
              name={draft.product_name || "Product preview"}
            />
            <span className="pill">
              {draft.source.startsWith("on_device_ocr") ? (
                <ScanText size={12} />
              ) : (
                <ImagePlus size={12} />
              )}{" "}
              {draft.source.startsWith("on_device_ocr")
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
                      {l.kind === "personal" ? "My shelf" : l.name}
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
                  <option value="high">Must-have</option>
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
            <button
              className="btn primary full"
              disabled={saving || busy || aiBusy}
            >
              {saving ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <Sparkles size={17} />
              )}{" "}
              {saving ? "Saving your wish…" : "Add a wish"}
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
