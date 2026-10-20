"use client";
import { useRef } from "react";
import { Search, Sparkles, X } from "lucide-react";

export default function SearchField({
  value,
  onChange,
  smart,
  onSmartChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  smart: boolean;
  onSmartChange: (value: boolean) => void;
  label: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div
      className="search-input wish-search"
      role="search"
      aria-label={`${label} controls`}
    >
      <Search size={19} aria-hidden="true" />
      <input
        ref={input}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        placeholder="Search your wishes…"
        autoComplete="off"
        spellCheck={false}
        maxLength={200}
      />
      {value && (
        <button
          className="search-clear"
          type="button"
          aria-label="Clear search"
          onClick={() => {
            onChange("");
            input.current?.focus();
          }}
        >
          <X size={17} />
        </button>
      )}
      <button
        className="search-mode"
        type="button"
        aria-pressed={smart}
        aria-label="Smart search"
        title={
          smart
            ? "Smart: related terms, partial words, typos and INR budgets. Click for exact text."
            : "Exact text. Click to include related terms and minor typos."
        }
        onClick={() => onSmartChange(!smart)}
      >
        <Sparkles size={15} aria-hidden="true" />
        <span>{smart ? "Smart" : "Exact"}</span>
      </button>
    </div>
  );
}
