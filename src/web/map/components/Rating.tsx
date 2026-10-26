import { Star } from "lucide-react";
import { Icon } from "./Icon.js";

/** Specified in DESIGN.md, not shipped: renders nothing without a real rating (value in (0, 5], at least 5 ratings). */
export function Rating({ rating }: { rating: { value: number; count: number; source: string } | null | undefined }) {
  if (!rating || !(rating.count >= 5) || !(rating.value > 0 && rating.value <= 5)) return null;
  const filled = Math.round(rating.value);
  return (
    <span className="rating">
      <span className="stars" role="img" aria-label={`${rating.value.toFixed(1)} out of 5 from ${rating.count} ratings`}>
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className={i < filled ? "on" : undefined}>
            <Icon as={Star} size={14} />
          </span>
        ))}
      </span>{" "}
      {rating.value.toFixed(1)} <span className="muted">({rating.count})</span> <span className="muted">via {rating.source}</span>
    </span>
  );
}
