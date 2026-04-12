import { useState, useEffect, useRef } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { EventImage } from "@/types";
import { ImageViewer } from "./ImageViewer";

interface ImageGalleryProps {
  images: EventImage[];
  // Show "<event name> · <date>" under each thumbnail. Used on cross-entity
  // views (artist/venue/location detail) where images span multiple events.
  showEventCaption?: boolean;
  // If present, allows deletion from the viewer. Called after the backend
  // acknowledges the delete so the parent can refetch.
  onDelete?: (imageId: number) => Promise<void> | void;
  // Enable drag-and-drop uploads onto the gallery area. Callback receives the
  // dropped absolute file paths; caller decides what to do with them.
  onDropFiles?: (paths: string[]) => void | Promise<void>;
}

export function ImageGallery({
  images,
  showEventCaption = false,
  onDelete,
  onDropFiles,
}: ImageGalleryProps) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Tauri's drag-drop API returns the unlisten handle via a Promise. We keep
  // the callback in a ref so the effect below can subscribe *once* and still
  // call the freshest handler — re-subscribing on every render raced with the
  // Promise resolving, leaking listeners and causing a single drop to upload
  // the same file multiple times.
  const onDropFilesRef = useRef(onDropFiles);
  useEffect(() => {
    onDropFilesRef.current = onDropFiles;
  }, [onDropFiles]);

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
          const paths = event.payload.paths.filter(isImagePath);
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

  if (images.length === 0 && !onDropFiles) {
    return <p className="text-sm text-muted-foreground">No images yet.</p>;
  }

  return (
    <>
      <div
        ref={containerRef}
        className={`grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 rounded-lg p-2 transition-colors ${
          dropActive ? "bg-primary/10 ring-2 ring-primary/40" : ""
        }`}
      >
        {images.length === 0 && (
          <div className="col-span-full py-8 text-center text-sm text-muted-foreground">
            Drop images here or use the button above.
          </div>
        )}
        {images.map((img, i) => (
          <button
            key={img.id}
            type="button"
            onClick={() => setViewerIndex(i)}
            className="flex min-w-0 flex-col gap-1 rounded-md p-1.5 text-left transition-colors hover:bg-accent"
          >
            <div className="aspect-square overflow-hidden rounded-md border bg-muted">
              <img
                src={convertFileSrc(img.absolute_path)}
                alt={img.caption ?? img.filename}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </div>
            {showEventCaption && img.event_name && (
              <div className="w-full break-words text-xs leading-snug text-muted-foreground">
                {img.event_name}
                {img.event_date && ` · ${formatDate(img.event_date)}`}
              </div>
            )}
          </button>
        ))}
      </div>
      {viewerIndex !== null && (
        <ImageViewer
          images={images}
          index={viewerIndex}
          onClose={() => setViewerIndex(null)}
          onIndexChange={setViewerIndex}
          onDelete={onDelete}
        />
      )}
    </>
  );
}

function isImagePath(path: string): boolean {
  const lower = path.toLowerCase();
  return (
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".png") ||
    lower.endsWith(".webp") ||
    lower.endsWith(".gif")
  );
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  return `${month}/${day}/${year}`;
}
