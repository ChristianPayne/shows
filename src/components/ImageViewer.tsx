import { useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { convertFileSrc } from "@tauri-apps/api/core";
import { X, ChevronLeft, ChevronRight, Trash2, ArrowRight } from "lucide-react";
import type { EventImage } from "@/types";

interface ImageViewerProps {
  images: EventImage[];
  index: number;
  onClose: () => void;
  onIndexChange: (i: number) => void;
  onDelete?: (imageId: number) => Promise<void> | void;
}

export function ImageViewer({
  images,
  index,
  onClose,
  onIndexChange,
  onDelete,
}: ImageViewerProps) {
  const navigate = useNavigate();
  const current = images[index];

  const goPrev = useCallback(() => {
    onIndexChange((index - 1 + images.length) % images.length);
  }, [index, images.length, onIndexChange]);

  const goNext = useCallback(() => {
    onIndexChange((index + 1) % images.length);
  }, [index, images.length, onIndexChange]);

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
          aria-label="Delete image"
        >
          <Trash2 className="h-5 w-5" />
        </button>
      )}

      {images.length > 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            goPrev();
          }}
          className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-2 text-foreground hover:bg-background"
          aria-label="Previous image"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}

      <img
        src={convertFileSrc(current.absolute_path)}
        alt={current.caption ?? current.filename}
        className="max-h-[90vh] max-w-[90vw] object-contain"
        onClick={(e) => e.stopPropagation()}
      />

      {images.length > 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            goNext();
          }}
          className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-2 text-foreground hover:bg-background"
          aria-label="Next image"
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

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  return `${month}/${day}/${year}`;
}
