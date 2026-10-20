/** A lightweight, decorative sculpture. CSS keeps motion off the React render path. */
export function WishOrbit({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`wish-orbit${compact ? " compact" : ""}`}
      aria-hidden="true"
    >
      <div className="orbit-halo" />
      <div className="orbit-ring" />
      <div className="orbit-core" />
      <span className="orbit-spark" />
    </div>
  );
}
