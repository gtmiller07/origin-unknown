'use client';

/**
 * Thumbnail — a thumbnail <img> with graceful fallback. Artifact previews live on arbitrary external
 * hosts (YouTube, Civitai, Mastodon/Bluesky CDNs) that frequently hotlink-block or expire; on load
 * error we swap to the same museum-archive placeholder used when no thumbnail exists, so the corpus
 * and adjacency grids never show a broken-image glyph. Plain <img> is deliberate — these hosts are
 * not next/image-optimizable.
 */
import { useState } from 'react';

export function Thumbnail({
  src,
  alt,
  imgClassName,
  emptyClassName,
  emptyLabel,
}: {
  src: string | null;
  alt: string;
  imgClassName: string;
  emptyClassName: string;
  emptyLabel: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return <div className={emptyClassName}>{emptyLabel}</div>;
  }
  return (
    <img
      className={imgClassName}
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
