import { useEffect, useCallback, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { convertFileSrc } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { X, ChevronLeft, ChevronRight, Trash2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { EventMedia } from "@/bindings";
import { isVideoMime } from "@/lib/media";

/** Paid ($0.99) universal HEVC Video Extensions on the Microsoft Store. This
 *  is the reliable install path — the free "from Device Manufacturer" variant
 *  (productid 9n4wgh0z6vhq) only installs on OEM-provisioned hardware. */
const HEVC_STORE_URL_PAID = "ms-windows-store://pdp/?productid=9nmzlz57r3t7";
const HEVC_STORE_URL_FREE_OEM = "ms-windows-store://pdp/?productid=9n4wgh0z6vhq";

interface MediaViewerProps {
  media: EventMedia[];
  index: number;
  onClose: () => void;
  onIndexChange: (i: number) => void;
  onDelete?: (mediaId: number) => Promise<void> | void;
}

export function MediaViewer({
  media,
  index,
  onClose,
  onIndexChange,
  onDelete,
}: MediaViewerProps) {
  const navigate = useNavigate();
  const current = media[index];

  const goPrev = useCallback(() => {
    onIndexChange((index - 1 + media.length) % media.length);
  }, [index, media.length, onIndexChange]);

  const goNext = useCallback(() => {
    onIndexChange((index + 1) % media.length);
  }, [index, media.length, onIndexChange]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, goPrev, goNext]);

  if (!current) return null;

  const handleDelete = async () => {
    if (!onDelete) return;
    await onDelete(current.id);
    // After delete, the parent will refetch — but the current modal still
    // has a stale list. Close the viewer; the user can reopen once the grid
    // refreshes.
    onClose();
  };

  const isVideo = isVideoMime(current.mime_type);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 rounded-full bg-background/80 p-2 text-foreground hover:bg-background"
        aria-label="Close"
      >
        <X className="h-5 w-5" />
      </button>

      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void handleDelete();
          }}
          className="absolute left-4 top-4 rounded-full bg-background/80 p-2 text-destructive hover:bg-background"
          aria-label="Delete media"
        >
          <Trash2 className="h-5 w-5" />
        </button>
      )}

      {media.length > 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            goPrev();
          }}
          className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-2 text-foreground hover:bg-background"
          aria-label="Previous"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}

      {isVideo ? (
        <VideoPlayer
          // Re-mount on index change so <video> reloads the new src cleanly.
          key={current.id}
          src={convertFileSrc(current.absolute_path)}
          filename={current.filename}
        />
      ) : (
        <ZoomableImage
          // Re-mount on index change so zoom/pan reset for the next image.
          key={current.id}
          src={convertFileSrc(current.absolute_path)}
          alt={current.caption ?? current.filename}
        />
      )}

      {media.length > 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            goNext();
          }}
          className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-2 text-foreground hover:bg-background"
          aria-label="Next"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}

      {(current.caption || current.event_name) && (
        <div
          className="absolute bottom-4 left-1/2 flex max-w-[80vw] -translate-x-1/2 items-center gap-3 rounded-md bg-background/80 px-4 py-2 text-sm text-foreground"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="min-w-0">
            {current.caption && <div className="truncate">{current.caption}</div>}
            {current.event_name && (
              <div className="truncate text-xs text-muted-foreground">
                {current.event_name}
                {current.event_date && ` · ${formatDate(current.event_date)}`}
              </div>
            )}
          </div>
          {/* Only surface the jump button on cross-entity galleries — on the
              event detail page we're already there, and event_name is null
              precisely in that case (the backend omits it for single-event
              fetches). */}
          {current.event_name && (
            <button
              type="button"
              onClick={() => {
                onClose();
                navigate(`/events/${current.event_id}`);
              }}
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-accent"
            >
              Go to event
              <ArrowRight className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Pan + zoom for the fullscreen image. Scroll (or trackpad pinch) zooms
 *  toward the cursor, drag pans once zoomed in, and double-click toggles
 *  between fit and 2.5x. Hand-rolled with a CSS transform rather than pulling
 *  in a zoom/pan library — it's a single transform and a bit of pointer math.
 *
 *  The transform is `translate(x,y) scale(s)` with the default center origin,
 *  so the image's visual center sits at `viewportCenter + (x,y)` regardless of
 *  scale. To keep the point under the cursor fixed while zooming we solve for
 *  the new translation: x' = dx - (dx - x)·(s'/s), where dx is the cursor's
 *  offset from the viewport center. The viewport center is a good stand-in for
 *  the image's layout center because the image is flex-centered in the overlay. */
function ZoomableImage({ src, alt }: { src: string; alt: string }) {
  const MIN_SCALE = 1;
  const MAX_SCALE = 8;

  const [t, setT] = useState({ scale: 1, x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  // Pan origin captured on pointer-down: where the pointer started and the
  // translation at that moment, so moves are an absolute delta (no drift).
  const dragStart = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  // Zoom toward the cursor. `setT`'s updater reads the current transform so
  // rapid wheel ticks compose correctly.
  const zoomAt = useCallback((clientX: number, clientY: number, factor: number) => {
    setT((prev) => {
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev.scale * factor));
      if (scale === MIN_SCALE) return { scale: 1, x: 0, y: 0 };
      const ratio = scale / prev.scale;
      const dx = clientX - window.innerWidth / 2;
      const dy = clientY - window.innerHeight / 2;
      return {
        scale,
        x: dx - (dx - prev.x) * ratio,
        y: dy - (dy - prev.y) * ratio,
      };
    });
  }, []);

  // Native non-passive wheel listener so preventDefault actually suppresses the
  // page's scroll/zoom (React's onWheel is passive and can't).
  useEffect(() => {
    const el = imgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (t.scale <= 1) return; // nothing to pan at fit
    e.preventDefault();
    imgRef.current?.setPointerCapture(e.pointerId);
    dragStart.current = { px: e.clientX, py: e.clientY, x: t.x, y: t.y };
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragStart.current;
    if (!d) return;
    setT((prev) => ({ ...prev, x: d.x + (e.clientX - d.px), y: d.y + (e.clientY - d.py) }));
  };

  const endDrag = () => {
    dragStart.current = null;
    setDragging(false);
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if (t.scale > 1) {
      setT({ scale: 1, x: 0, y: 0 });
    } else {
      zoomAt(e.clientX, e.clientY, 2.5);
    }
  };

  return (
    <img
      ref={imgRef}
      src={src}
      alt={alt}
      draggable={false}
      // Stop the backdrop's close-on-click; pan/zoom own this surface.
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={onDoubleClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className="max-h-[90vh] max-w-[90vw] touch-none select-none object-contain"
      style={{
        transform: `translate(${t.x}px, ${t.y}px) scale(${t.scale})`,
        cursor: t.scale > 1 ? (dragging ? "grabbing" : "grab") : "auto",
        // Smooth wheel/double-click zoom, but instant during a drag.
        transition: dragging ? "none" : "transform 70ms ease-out",
      }}
    />
  );
}

/** Dedicated video element with an error fallback. If the webview can't
 *  decode the file (e.g. HEVC MOV on Windows WebView2 without the HEVC Video
 *  Extension installed), `onError` fires and we swap to a panel that lets
 *  the user install the extension with one click.
 *
 *  The `#t=0.1` fragment on the src is the same trick we use for thumbnails
 *  in MediaGallery: WKWebView's `preload="metadata"` only downloads container
 *  metadata without decoding any pixels, so the element paints black until
 *  play is hit. Seeking to 0.1s forces a frame decode at that offset. 100ms
 *  offset on playback start is imperceptible, and iPhone footage usually has
 *  a black first frame anyway while the sensor warms up. */
function VideoPlayer({ src, filename }: { src: string; filename: string }) {
  const [errored, setErrored] = useState(false);

  if (errored) {
    return (
      <div
        className="max-w-md rounded-md bg-background/95 px-6 py-6 text-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="mb-1 text-base font-semibold">Can't play this video.</p>
        <p className="text-muted-foreground">
          The system couldn't decode <code className="font-mono">{filename}</code>.
        </p>
        <p className="mt-3 text-muted-foreground">
          On Windows, HEVC (H.265) videos — including iPhone{" "}
          <code className="font-mono">.mov</code> files — need Microsoft's HEVC
          Video Extensions installed.
        </p>
        <div className="mt-4 flex flex-col items-start gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => {
              void openUrl(HEVC_STORE_URL_PAID);
            }}
          >
            Install HEVC Video Extensions
          </Button>
          <button
            type="button"
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => {
              void openUrl(HEVC_STORE_URL_FREE_OEM);
            }}
          >
            Try the free OEM version first
          </button>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          On Mac, this usually means the file is corrupt or uses an unsupported
          codec.
        </p>
      </div>
    );
  }

  return (
    <video
      src={`${src}#t=0.1`}
      controls
      preload="metadata"
      className="max-h-[90vh] max-w-[90vw]"
      onClick={(e) => e.stopPropagation()}
      onError={() => setErrored(true)}
    />
  );
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  return `${month}/${day}/${year}`;
}
