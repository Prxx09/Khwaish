"use client";
import { ArrowDownRight, ArrowUpRight, Check, Heart } from "lucide-react";
import { currentPrice, money, priceDrop, type Item } from "@/lib/types";
import { ProductImage } from "./ui";
export default function ProductCard({
  item,
  onSelect,
  onFavorite,
  canEdit,
  index = 0,
}: {
  item: Item;
  onSelect: () => void;
  onFavorite: () => void;
  canEdit: boolean;
  index?: number;
}) {
  const drop = priceDrop(item);
  const price = currentPrice(item);
  return (
    <article
      className="product-card"
      style={{ animationDelay: `${Math.min(index, 12) * 45}ms` }}
    >
      <div className={`product-image-wrap tone-${index % 4}`}>
        <button
          className="image-button"
          onClick={onSelect}
          aria-label={`View ${item.product_name}`}
        >
          <ProductImage
            src={item.product_media?.[0]?.signed_url || item.image_url}
            name={item.product_name}
          />
        </button>
        {drop > 0 && (
          <span className="drop-pill">
            <ArrowDownRight size={13} />
            {Math.round((drop / (item.initial_price || 1)) * 100)}% drop
          </span>
        )}
        {item.status === "purchased" && (
          <span className="purchased-pill">
            <Check size={12} />
            Got it!
          </span>
        )}
        <button
          className={`save-heart ${item.priority === "high" ? "saved" : ""}`}
          onClick={onFavorite}
          disabled={!canEdit}
          aria-label={
            item.priority === "high"
              ? `Remove ${item.product_name} from must-haves`
              : `Mark ${item.product_name} as a must-have`
          }
          aria-pressed={item.priority === "high"}
        >
          <Heart
            size={17}
            fill={item.priority === "high" ? "currentColor" : "none"}
          />
        </button>
      </div>
      <div className="product-card-body">
        <div className="card-meta">
          <span>{item.category || "Other"}</span>
          <span className="store-dot">{item.retailer || "Your find"}</span>
        </div>
        <button className="product-title" onClick={onSelect}>
          {item.product_name}
        </button>
        {item.variant && <p className="variant">{item.variant}</p>}
        <div className="product-card-bottom">
          <div>
            <strong>{money(price, item.currency)}</strong>
            {drop > 0 && <s>{money(item.initial_price, item.currency)}</s>}
          </div>
          <button
            className="card-open"
            onClick={onSelect}
            aria-label={`Open ${item.product_name}`}
          >
            <ArrowUpRight size={18} />
          </button>
        </div>
      </div>
    </article>
  );
}
