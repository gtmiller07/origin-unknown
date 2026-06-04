'use client';

/**
 * MediaRenderer — the Phase 4 centerpiece. One component renders every artifact, branching by
 * media_type (Section 8): YouTube via youtube-nocookie with click-to-play + IntersectionObserver
 * lazy-mount, direct HTML5 <video>, TikTok thumbnail fallback, full-res image with click-to-zoom
 * lightbox + ESC, HTML5 <audio>, and Source-Serif blockquote for text/posts. Reading mode (and the
 * low-priority adjacency variant) collapse rich embeds to thumbnail + caption + external link, so
 * the focus shifts to context and scoring rather than the artifact itself.
 *
 * Thumbnails use a plain <img>: artifact media lives on arbitrary external hosts (YouTube, Civitai,
 * Mastodon CDNs, …) that next/image cannot optimize, so the native element is deliberate.
 */
import { type ReactNode, useEffect, useRef, useState } from 'react';
import styles from './evidence.module.css';

export interface MediaArtifact {
  mediaType: string | null;
  contentUrl: string | null;
  thumbnailUrl: string | null;
  title: string | null;
  description: string | null;
  altText: string | null;
  isAiGenerated: boolean | null;
  sourceName: string | null;
  publishedAt: string | null;
}

function youtubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/);
  return m ? m[1] : null;
}
function isDirectVideo(url: string): boolean {
  return /\.(mp4|webm|ogg|mov)(\?|$)/i.test(url);
}
function isTikTok(url: string): boolean {
  return /tiktok\.com/i.test(url);
}
function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}
function firstWords(s: string, n: number): string {
  const words = s.trim().split(/\s+/);
  return words.length <= n ? s : `${words.slice(0, n).join(' ')}…`;
}

function Thumb({
  src,
  alt,
  caption,
  link,
}: {
  src: string | null;
  alt: string;
  caption?: string;
  link?: ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div>
      <div className={styles.frame}>
        {src && !failed ? (
          <img
            src={src}
            alt={alt}
            loading="lazy"
            onError={() => setFailed(true)}
            style={{
              width: '100%',
              aspectRatio: '16 / 9',
              objectFit: 'cover',
              display: 'block',
              background: '#171717',
            }}
          />
        ) : (
          <div className={styles.adjThumbEmpty} style={{ aspectRatio: '16 / 9' }}>
            no preview
          </div>
        )}
      </div>
      {(caption || link) && (
        <p className={styles.caption}>
          {caption}
          {caption && link ? ' · ' : ''}
          {link}
        </p>
      )}
    </div>
  );
}

function YouTube({ id, poster, title }: { id: string; poster: string | null; title: string }) {
  const [playing, setPlaying] = useState(false);
  const [inView, setInView] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setInView(true);
            io.disconnect();
          }
        }
      },
      { rootMargin: '200px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div className={`${styles.frame} ${styles.frameVideo}`} ref={ref}>
      {playing && inView ? (
        <iframe
          className={styles.ytIframe}
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <>
          {poster ? (
            <img className={styles.poster} src={poster} alt={title} />
          ) : (
            <div className={styles.poster} style={{ background: '#171717' }} />
          )}
          <button
            type="button"
            className={styles.playBtn}
            onClick={() => setPlaying(true)}
            aria-label="Play video"
          >
            <span className={styles.playGlyph}>▶ Play</span>
          </button>
        </>
      )}
    </div>
  );
}

function Zoomable({
  src,
  full,
  alt,
  aiBadge,
}: {
  src: string | null;
  full: string | null;
  alt: string;
  aiBadge: boolean;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!src) {
    return (
      <div className={styles.frame}>
        <div className={styles.adjThumbEmpty} style={{ aspectRatio: '4 / 3' }}>
          no preview
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={`${styles.frame} ${styles.imgWrap}`}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Zoom image"
          style={{ all: 'unset', display: 'block', width: '100%', cursor: 'zoom-in' }}
        >
          <img className={styles.image} src={src} alt={alt} />
        </button>
        {aiBadge && <span className={styles.badge}>AI · Credentials</span>}
      </div>
      {open && (
        <dialog open className={styles.lightbox} aria-label={alt}>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            style={{
              position: 'absolute',
              inset: 0,
              background: 'transparent',
              border: 0,
              cursor: 'zoom-out',
            }}
          />
          <img
            className={styles.lightboxImg}
            src={full ?? src}
            alt={alt}
            style={{ position: 'relative', zIndex: 1 }}
          />
          <button
            type="button"
            className={styles.lightboxClose}
            onClick={() => setOpen(false)}
            style={{ zIndex: 2 }}
          >
            Close ✕ (Esc)
          </button>
        </dialog>
      )}
    </>
  );
}

export function MediaRenderer({
  artifact,
  priority = 'high',
  readingMode = false,
}: {
  artifact: MediaArtifact;
  priority?: 'low' | 'high';
  readingMode?: boolean;
}) {
  const {
    mediaType,
    contentUrl,
    thumbnailUrl,
    title,
    description,
    altText,
    isAiGenerated,
    sourceName,
  } = artifact;
  const alt = altText ?? title ?? 'Artifact';
  const ext = contentUrl ? (
    <a className={styles.extLink} href={contentUrl} target="_blank" rel="noopener noreferrer">
      Open external ↗
    </a>
  ) : null;

  // Reading mode and adjacency thumbnails collapse rich media to a static preview.
  const collapsed = readingMode || priority === 'low';

  if (mediaType === 'video' && contentUrl) {
    if (collapsed) {
      return (
        <Thumb
          src={thumbnailUrl}
          alt={alt}
          caption={`Video · ${sourceName ?? 'source'}`}
          link={ext}
        />
      );
    }
    const yt = youtubeId(contentUrl);
    if (yt) return <YouTube id={yt} poster={thumbnailUrl} title={alt} />;
    if (isDirectVideo(contentUrl)) {
      return (
        <div className={`${styles.frame} ${styles.frameVideo}`}>
          {/* biome-ignore lint/a11y/useMediaCaption: external UGC video has no caption track available */}
          <video
            className={styles.video}
            controls
            preload="none"
            poster={thumbnailUrl ?? undefined}
          >
            <source src={contentUrl} />
          </video>
        </div>
      );
    }
    if (isTikTok(contentUrl)) {
      return (
        <Thumb
          src={thumbnailUrl}
          alt={alt}
          caption="TikTok"
          link={
            <a
              className={styles.extLink}
              href={contentUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open on TikTok ↗
            </a>
          }
        />
      );
    }
    return <Thumb src={thumbnailUrl} alt={alt} caption="Video" link={ext} />;
  }

  if (mediaType === 'image') {
    const src = thumbnailUrl ?? contentUrl;
    const full = contentUrl ?? thumbnailUrl;
    if (collapsed) {
      return (
        <Thumb
          src={src}
          alt={alt}
          caption={isAiGenerated ? 'AI-generated image' : 'Image'}
          link={ext}
        />
      );
    }
    return <Zoomable src={src} full={full} alt={alt} aiBadge={isAiGenerated === true} />;
  }

  if (mediaType === 'audio') {
    if (collapsed) return <Thumb src={thumbnailUrl} alt={alt} caption="Audio" link={ext} />;
    return (
      <div>
        {thumbnailUrl && <img className={styles.audioThumb} src={thumbnailUrl} alt={alt} />}
        {contentUrl ? (
          // biome-ignore lint/a11y/useMediaCaption: external UGC audio has no caption track available
          <audio className={styles.audio} controls preload="none" src={contentUrl} />
        ) : (
          ext
        )}
      </div>
    );
  }

  if (mediaType === 'text' || (!mediaType && (description || title))) {
    const body = description ?? title ?? '';
    const long = wordCount(body) > 120;
    return (
      <figure style={{ margin: 0 }}>
        <blockquote className={styles.blockquote}>
          {long ? firstWords(body, 120) : body}
          <cite className={styles.blockquoteCite}>
            {sourceName ?? 'Source unknown'}
            {long && contentUrl ? (
              <>
                {' · '}
                <a
                  className={styles.readmore}
                  href={contentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Read full article ↗
                </a>
              </>
            ) : null}
          </cite>
        </blockquote>
      </figure>
    );
  }

  if (mediaType === 'mixed') {
    return (
      <div>
        {thumbnailUrl && (
          <Zoomable
            src={thumbnailUrl}
            full={contentUrl ?? thumbnailUrl}
            alt={alt}
            aiBadge={isAiGenerated === true}
          />
        )}
        {description && <p className={styles.caption}>{firstWords(description, 120)}</p>}
        {ext}
      </div>
    );
  }

  return <Thumb src={thumbnailUrl} alt={alt} caption={mediaType ?? 'Unknown media'} link={ext} />;
}
