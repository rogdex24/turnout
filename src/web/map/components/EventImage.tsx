import { useEffect, useEffectEvent, useRef, useState } from "react";
import { LAYOUT } from "../layout.js";
import { hashStep } from "../model/format.js";
import type { MapEvent } from "../types.js";
import { CategoryIcon } from "./CategoryIcon.js";

/**
 * A cover or thumbnail in a fixed box with the placeholder always underneath, so a failed image shows it with no layout shift.
 * The image's own state lives here: `failed` removes it, `poster` switches a portrait cover to contain-over-blur.
 * An image can finish before React attaches its listeners (the server list loads first), so a mount check reads `complete`.
 */
export function EventImage({ event, kind }: { event: MapEvent; kind: "thumb" | "cover" }) {
  const url = event.imageUrl;
  const [failed, setFailed] = useState(false);
  const [poster, setPoster] = useState(false);
  const pic = useRef<HTMLImageElement>(null);

  const settle = (img: HTMLImageElement) => {
    if (!img.complete) return;
    if (img.naturalWidth === 0) setFailed(true);
    else if (img.naturalHeight > img.naturalWidth * 1.1) setPoster(true);
  };
  const settleMounted = useEffectEvent(() => {
    if (pic.current) settle(pic.current);
  });
  useEffect(() => {
    setFailed(false);
    setPoster(false);
    settleMounted();
  }, [url]);

  const size =
    kind === "thumb"
      ? { width: LAYOUT.image.thumb, height: LAYOUT.image.thumb }
      : { width: LAYOUT.image.coverWidth, height: LAYOUT.image.coverHeight };
  const show = url && !failed;
  return (
    <span className={`${kind}${poster ? " poster" : ""}`} style={{ "--ph": `var(--ph-${hashStep(event.id)})` } as React.CSSProperties}>
      <span className="ph">
        <CategoryIcon category={event.category} size={kind === "thumb" ? LAYOUT.categoryIcon.thumb : LAYOUT.categoryIcon.cover} />
      </span>
      {show && kind === "cover" ? (
        <img className="bg" src={url} alt="" aria-hidden="true" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
      ) : null}
      {show ? (
        <img
          ref={pic}
          className="pic"
          src={url}
          alt=""
          {...size}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          onLoad={(e) => settle(e.currentTarget)}
        />
      ) : null}
    </span>
  );
}
