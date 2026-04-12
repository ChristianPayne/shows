import { useEffect, useState } from "react";
import { MediaGallery } from "@/components/MediaGallery";
import * as api from "@/api";
import type { EventMedia } from "@/types";

interface EntityMediaSectionProps {
  // Events this entity (artist/venue/location) is attached to. The section
  // joins their media into one gallery tagged with each item's event name.
  eventIds: number[];
}

export function EntityMediaSection({ eventIds }: EntityMediaSectionProps) {
  const [media, setMedia] = useState<EventMedia[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (eventIds.length === 0) {
      setMedia([]);
      setLoaded(true);
      return;
    }
    let cancelled = false;
    api.getMediaForEvents(eventIds).then((next) => {
      if (!cancelled) {
        setMedia(next);
        setLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [eventIds]);

  if (!loaded || media.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
        Media from these events
      </h3>
      <MediaGallery media={media} showEventCaption />
    </div>
  );
}
