import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import * as api from "@/api";
import type { EventMedia } from "@/types";
import { MediaThumbnail } from "@/components/MediaGallery";
import { MediaViewer } from "@/components/MediaViewer";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { isVideoMime } from "@/lib/media";
import { cn } from "@/lib/utils";

type MediaFilter = "all" | "photos" | "videos";

interface EventGroup {
  eventId: number;
  eventName: string;
  eventDate: string | null;
  items: EventMedia[];
  // Offset of this group's first item in the flat `filtered` list. Lets the
  // viewer navigate across the whole filtered set rather than being siloed
  // per section, without re-scanning on every tile click.
  baseIndex: number;
}

export function MediaPage() {
  const navigate = useNavigate();
  const [media, setMedia] = useState<EventMedia[] | null>(null);
  const [filter, setFilter] = useState<MediaFilter>("all");
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  useEffect(() => {
    api.getAllMedia().then(setMedia);
  }, []);

  const filtered = useMemo(() => {
    if (!media) return [];
    if (filter === "photos") return media.filter((m) => !isVideoMime(m.mime_type));
    if (filter === "videos") return media.filter((m) => isVideoMime(m.mime_type));
    return media;
  }, [media, filter]);

  // Group by event while preserving backend order. Rust returns items sorted
  // by `events.date DESC` then within-event chronological, so consecutive
  // items with the same event_id are already adjacent — no re-sort needed,
  // just a single pass to split into groups.
  const groups = useMemo<EventGroup[]>(() => {
    const out: EventGroup[] = [];
    filtered.forEach((item, idx) => {
      const last = out[out.length - 1];
      if (last && last.eventId === item.event_id) {
        last.items.push(item);
      } else {
        out.push({
          eventId: item.event_id,
          eventName: item.event_name ?? "",
          eventDate: item.event_date ?? null,
          items: [item],
          baseIndex: idx,
        });
      }
    });
    return out;
  }, [filtered]);

  const handleDelete = async (mediaId: number) => {
    await api.deleteEventMedia(mediaId);
    const refreshed = await api.getAllMedia();
    setMedia(refreshed);
  };

  const counts = useMemo(() => {
    if (!media) return { all: 0, photos: 0, videos: 0 };
    let photos = 0;
    let videos = 0;
    for (const m of media) {
      if (isVideoMime(m.mime_type)) videos++;
      else photos++;
    }
    return { all: photos + videos, photos, videos };
  }, [media]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Media</h1>
        <div className="inline-flex rounded-md border border-border p-0.5">
          <FilterChip
            active={filter === "all"}
            onClick={() => setFilter("all")}
            label="All"
            count={counts.all}
          />
          <FilterChip
            active={filter === "photos"}
            onClick={() => setFilter("photos")}
            label="Photos"
            count={counts.photos}
          />
          <FilterChip
            active={filter === "videos"}
            onClick={() => setFilter("videos")}
            label="Videos"
            count={counts.videos}
          />
        </div>
      </div>

      {media === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {media.length === 0
            ? "No media yet. Attach photos or videos to an event to see them here."
            : "No media matches this filter."}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {groups.map((group) => (
            <MediaSection
              key={group.eventId}
              group={group}
              onTileClick={(idx) => setViewerIndex(idx)}
              onHeaderClick={() => navigate(`/events/${group.eventId}`)}
            />
          ))}
        </div>
      )}

      {viewerIndex !== null && (
        <MediaViewer
          media={filtered}
          index={viewerIndex}
          onClose={() => setViewerIndex(null)}
          onIndexChange={setViewerIndex}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}

function MediaSection({
  group,
  onTileClick,
  onHeaderClick,
}: {
  group: EventGroup;
  onTileClick: (flatIndex: number) => void;
  onHeaderClick: () => void;
}) {
  return (
    <>
      <button
        type="button"
        onClick={onHeaderClick}
        className="col-span-full mt-2 flex items-baseline gap-2 border-b border-border pb-1 text-left first:mt-0 hover:border-foreground/40 transition-colors group"
      >
        <span className="text-sm font-semibold group-hover:text-primary transition-colors">
          {group.eventName}
        </span>
        {group.eventDate && (
          <span className="text-xs text-muted-foreground">
            {formatDate(group.eventDate)}
          </span>
        )}
        <span className="text-xs text-muted-foreground">
          · {group.items.length} item{group.items.length === 1 ? "" : "s"}
        </span>
        <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </button>
      {group.items.map((item, i) => (
        <Tooltip key={item.id}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => onTileClick(group.baseIndex + i)}
              className="flex min-w-0 flex-col gap-1 rounded-md p-1.5 text-left transition-colors hover:bg-accent"
            >
              <MediaThumbnail item={item} />
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
      ))}
    </>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {label}
      <span className={cn("ml-1.5", active ? "opacity-80" : "opacity-60")}>
        {count}
      </span>
    </button>
  );
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  return `${month}/${day}/${year}`;
}
