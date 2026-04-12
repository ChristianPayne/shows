import { useEffect, useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { convertFileSrc } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { X, ChevronLeft, ChevronRight, Trash2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { EventMedia } from "@/types";
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
        <img
          src={convertFileSrc(current.absolute_path)}
          alt={current.caption ?? current.filename}
          className="max-h-[90vh] max-w-[90vw] object-contain"
          onClick={(e) => e.stopPropagation()}
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
