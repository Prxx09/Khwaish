"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  ShoppingBag,
  Sparkles,
  X,
  CircleCheck,
  CircleAlert,
  Info,
  LoaderCircle,
} from "lucide-react";
import { safeUrl } from "@/lib/types";
export function presentMessage(message: string) {
  return message
    .replace(/\bGroq\b/gi, "AI")
    .replace(/\blibraries\b/gi, "spaces")
    .replace(/\blibrary\b/gi, "space");
}
export function Brand({ small = false }: { small?: boolean }) {
  return (
    <div className={`brand ${small ? "small" : ""}`}>
      <span className="brand-mark">
        <span>k</span>
        <Sparkles size={12} />
      </span>
      {!small && (
        <span>
          Khwaish<span className="brand-dot">.</span>
        </span>
      )}
    </div>
  );
}
export function Avatar({
  name,
  size = "normal",
}: {
  name: string;
  size?: "normal" | "small";
}) {
  return (
    <span className={`avatar ${size}`} aria-label={name}>
      {name.trim().slice(0, 2).toUpperCase() || "K"}
    </span>
  );
}
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  sheet = false,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  sheet?: boolean;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const id = useId();
  useEffect(() => {
    const d = ref.current;
    if (open && !d?.open) {
      returnFocus.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      d?.showModal();
    } else if (!open && d?.open) {
      d.close();
      returnFocus.current?.focus();
    }
    return () => {
      if (d?.open) {
        d.close();
        if (returnFocus.current?.isConnected) returnFocus.current.focus();
      }
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = old;
    };
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`${sheet ? "sheet" : "modal"} ${wide ? "wide" : ""}`}
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target !== e.currentTarget) return;
        const rect = e.currentTarget.getBoundingClientRect();
        if (
          e.clientX < rect.left ||
          e.clientX > rect.right ||
          e.clientY < rect.top ||
          e.clientY > rect.bottom
        )
          onClose();
      }}
    >
      <div className="modal-content">
        <div className="modal-head">
          <div>
            <h2 id={id}>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={20} />
          </button>
        </div>
        {open && children}
      </div>
    </dialog>
  );
}
export function ProductImage({
  src,
  name,
  className = "",
}: {
  src?: string | null;
  name: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const source = src?.startsWith("blob:") ? src : safeUrl(src);
  return source && !failed ? (
    <img
      src={source}
      alt={name}
      className={className}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  ) : (
    <div className={`image-placeholder ${className}`}>
      <ShoppingBag size={38} strokeWidth={1} />
      <span>Your next favourite</span>
    </div>
  );
}
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-orbit">
        <Sparkles size={30} />
      </span>
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}
export function StoreLink({
  url,
  label,
}: {
  url: string | null;
  label: string;
}) {
  const safe = safeUrl(url);
  return safe ? (
    <a
      className="btn secondary"
      href={safe}
      target="_blank"
      rel="noopener noreferrer"
    >
      {label}
      <ArrowUpRight size={16} />
    </a>
  ) : null;
}
export function Skeletons() {
  return (
    <div className="product-grid" role="status" aria-label="Loading wishes">
      {Array.from({ length: 6 }, (_, i) => (
        <div className="card-skeleton" key={i}>
          <div />
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}
export function ErrorText({ children }: { children: ReactNode }) {
  return children ? (
    <p className="inline-error" role="alert">
      {typeof children === "string" ? presentMessage(children) : children}
    </p>
  ) : null;
}

export type ToastKind = "success" | "error" | "info";
export function Toast({
  message,
  kind,
  onClose,
}: {
  message: string;
  kind: ToastKind;
  onClose: () => void;
}) {
  const [paused, setPaused] = useState(false);
  const remaining = useRef(5000);
  const started = useRef(0);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (paused) return;
    started.current = Date.now();
    const timer = setTimeout(() => closeRef.current(), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(
        0,
        remaining.current - (Date.now() - started.current),
      );
    };
  }, [paused]);
  const Icon =
    kind === "error" ? CircleAlert : kind === "success" ? CircleCheck : Info;
  return (
    <div
      className={`toast toast-${kind}`}
      role={kind === "error" ? "alert" : "status"}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setPaused(false);
      }}
    >
      <Icon size={20} />
      <p>{presentMessage(message)}</p>
      <button
        className="mini-icon"
        type="button"
        onClick={onClose}
        aria-label="Dismiss notification"
      >
        <X size={18} />
      </button>
    </div>
  );
}
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Remove",
  busy = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description: string;
  confirmLabel?: string;
  busy?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      title={title}
    >
      <p className="confirm-description">{description}</p>
      <div className="dialog-footer">
        <button
          type="button"
          className="btn secondary"
          autoFocus
          disabled={busy}
          onClick={onClose}
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn danger"
          disabled={busy}
          onClick={() => void onConfirm()}
        >
          {busy ? <LoaderCircle size={18} className="spin" /> : null}
          {busy ? "Working…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
