"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ArrowUpRight, ShoppingBag, Sparkles, X } from "lucide-react";
import { safeUrl } from "@/lib/types";
export function Brand({ small = false }: { small?: boolean }) {
  return (
    <div className={`brand ${small ? "small" : ""}`}>
      <span className="brand-mark">
        <span>k</span>
        <Sparkles size={12} />
      </span>
      {!small && (
        <span>
          khwahish<span className="brand-dot">.</span>
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
  const id = useId();
  useEffect(() => {
    const d = ref.current;
    if (open && !d?.open) d?.showModal();
    else if (!open && d?.open) d.close();
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
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-content">
        <div className="modal-head">
          <div>
            <h2 id={id}>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button
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
    <div className="product-grid">
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
      {children}
    </p>
  ) : null;
}
