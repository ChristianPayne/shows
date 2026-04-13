import { useState, useEffect, useMemo, useRef } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { ArrowUpDown, Check, Play } from "lucide-react";
import type { EventMedia } from "@/types";
import { MediaViewer } from "./MediaViewer";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { isVideoMime, isMediaPath } from "@/lib/media";

interface MediaGalleryProps {
  media: EventMedia[];
  // Show "<event name> · <date>" under each thumbnail. Used on cross-entity
  // views (artist/venue/location detail) where media span multiple events.
  showEventCaption?: boolean;
  // If present, allows deletion from the viewer. Called after the backend
  // acknowledges the delete so the parent can refetch.
  onDelete?: (mediaId: number) => Promise<void> | void;
  // Enable drag-and-drop uploads onto the gallery area. Callback receives the
  // dropped absolute file paths; caller decides what to do with them.
  onDropFiles?: (paths: string[]) => void | Promise<void>;
  // Externally-controlled multi-select. When `selectionMode` is true, tile
  // clicks toggle membership in `selectedIds` via `onToggleSelect` instead of
  // opening the viewer. The parent owns the selection state so it can drive a
  // bulk-delete flow (confirm dialog, action bar, etc.).
  selectionMode?: boolean;
  selectedIds?: ReadonlySet<number>;
  onToggleSelect?: (mediaId: number) => void;
}

export function MediaGallery({
  media,
  showEventCaption = false,
  onDelete,
  onDropFiles,
  selectionMode = false,
  selectedIds,
  onToggleSelect,
}: MediaGalleryProps) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [dropActive, setDropActive] = useState(false);
  // Display order. The backend's default returns newest first (cross-entity
  // views lead with `e.date DESC`, and single-event views with all-null
  // captured_at fall through to upload order which users typically
  // perceive as newest-first too). `oldestFirst = true` reverses to show
  // oldest at the top. Client-side reverse is cheap for the ~dozens of
  // items in a gallery and avoids round-trips for a display preference.
  const [oldestFirst, setOldestFirst] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const sortedMedia = useMemo(
    () => (oldestFirst ? [...media].reverse() : media),
    [media, oldestFirst],
  );

  // Tauri's drag-drop API returns the unlisten handle via a Promise. We keep
  // the callback in a ref so the effect below can subscribe *once* and still
  // call the freshest handler — re-subscribing on every render raced with the
  // Promise resolving, leaking listeners and causing a single drop to upload
  // the same file multiple times.
  const onDropFilesRef = useRef(onDropFiles);
  useEffect(() => {
    onDropFilesRef.current = onDropFiles;
  }, [onDropFiles]);

  // Entering select mode while the viewer is open would leave a floating
  // modal with no way to exit cleanly — close it so the user lands in the
  // grid where selection happens.
  useEffect(() => {
    if (selectionMode) setViewerIndex(null);
  }, [selectionMode]);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    const pointInRect = (x: number, y: number, rect: DOMRect) =>
      x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;

    getCurrentWebviewWindow()
      .onDragDropEvent((event) => {
        const handler = onDropFilesRef.current;
        if (!handler) return;

        const el = containerRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();

        if (event.payload.type === "over") {
          const { x, y } = event.payload.position;
          setDropActive(pointInRect(x, y, rect));
        } else if (event.payload.type === "leave") {
          setDropActive(false);
        } else if (event.payload.type === "drop") {
          setDropActive(false);
          const { x, y } = event.payload.position;
          if (!pointInRect(x, y, rect)) return;
          const paths = event.payload.paths.filter(isMediaPath);
          if (paths.length > 0) {
            void handler(paths);
          }
        }
      })
      .then((fn) => {
        // If cleanup ran before the subscription resolved, fire the unlisten
        // right away so we never leave an orphaned listener behind.
        if (cancelled) {
          fn();
        } else {
          unlisten = fn;
        }
      });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  if (media.length === 0 && !onDropFiles) {
    return <p className="text-sm text-muted-foreground">No media yet.</p>;
  }

  return (
    <>
      {media.length > 1 && (
        <div className="mb-1 flex justify-end px-2">
          <button
            type="button"
            onClick={() => setOldestFirst((o) => !o)}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-accent"
            aria-label="Toggle sort direction"
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
            {oldestFirst ? "Oldest first" : "Newest first"}
          </button>
        </div>
      )}
      <div
        ref={containerRef}
        className={`grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 rounded-lg p-2 transition-colors ${
          dropActive ? "bg-primary/10 ring-2 ring-primary/40" : ""
        }`}
      >
        {sortedMedia.length === 0 && (
          <div className="col-span-full py-8 text-center text-sm text-muted-foreground">
            Drop images or videos here or use the button above.
          </div>
        )}
        {sortedMedia.map((item, i) => {
          const isSelected = selectedIds?.has(item.id) ?? false;
          return (
            <Tooltip key={item.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => {
                    if (selectionMode) {
                      onToggleSelect?.(item.id);
                    } else {
                      setViewerIndex(i);
                    }
                  }}
                  className={`flex min-w-0 flex-col gap-1 rounded-md p-1.5 text-left transition-colors hover:bg-accent ${
                    isSelected ? "bg-primary/10" : ""
                  }`}
                >
                  <MediaThumbnail
                    item={item}
                    selectionMode={selectionMode}
                    selected={isSelected}
                  />
                  {showEventCaption && item.event_name && (
                    <div className="w-full break-words text-xs leading-snug text-muted-foreground">
                      {item.event_name}
                      {item.event_date && ` · ${formatDate(item.event_date)}`}
                    </div>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <div className="flex flex-col gap-0.5">
                  <span>
                    {item.captured_at
                      ? `Taken: ${item.captured_at}`
                      : "No capture timestamp"}
                  </span>
                  <span>Uploaded: {item.created_at}</span>
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
      {viewerIndex !== null && (
        <MediaViewer
          media={sortedMedia}
          index={viewerIndex}
          onClose={() => setViewerIndex(null)}
          onIndexChange={setViewerIndex}
          onDelete={onDelete}
        />
      )}
    </>
  );
}

/** Grid cell — `<img>` for images, `<video>` with a play overlay for videos.
 *  `preload="metadata"` alone only loads container metadata, which in
 *  WKWebView leaves the element blank. Appending the `#t=0.1` media fragment
 *  tells the player to seek to 0.1s, which forces a frame decode at that
 *  offset and paints it to the element — effectively a "poster frame" at
 *  zero marginal cost. We pick 0.1s instead of 0 because many iPhone videos
 *  have a black first frame while the sensor warms up. */
export function MediaThumbnail({
  item,
  selectionMode,
  selected,
}: {
  item: EventMedia;
  selectionMode?: boolean;
  selected?: boolean;
}) {
  const rawSrc = convertFileSrc(item.absolute_path);
  const isVideo = isVideoMime(item.mime_type);
  const videoSrc = `${rawSrc}#t=0.1`;

  return (
    <div
      className={`relative aspect-square overflow-hidden rounded-md border bg-muted ${
        selected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""
      }`}
    >
      {isVideo ? (
        <>
          <video
            src={videoSrc}
            preload="metadata"
            muted
            playsInline
            className="h-full w-full object-cover"
          />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="rounded-full bg-black/50 p-2 text-white">
              <Play className="h-5 w-5" fill="currentColor" />
            </div>
          </div>
        </>
      ) : (
        <img
          src={rawSrc}
          alt={item.caption ?? item.filename}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      )}
      {selectionMode && (
        <div className="pointer-events-none absolute left-1.5 top-1.5">
          <div
            className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${
              selected
                ? "border-primary bg-primary text-primary-foreground"
                : "border-white/90 bg-black/40 text-transparent"
            }`}
          >
            <Check className="h-4 w-4" strokeWidth={3} />
          </div>
        </div>
      )}
    </div>
  );
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  return `${month}/${day}/${year}`;
}

