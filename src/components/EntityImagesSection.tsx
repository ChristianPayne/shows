import { useEffect, useState } from "react";
import { ImageGallery } from "@/components/ImageGallery";
import * as api from "@/api";
import type { EventImage } from "@/types";

interface EntityImagesSectionProps {
  // Events this entity (artist/venue/location) is attached to. The section
  // joins their images into one gallery tagged with each image's event name.
  eventIds: number[];
}

export function EntityImagesSection({ eventIds }: EntityImagesSectionProps) {
  const [images, setImages] = useState<EventImage[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (eventIds.length === 0) {
      setImages([]);
      setLoaded(true);
      return;
    }
    let cancelled = false;
    api.getImagesForEvents(eventIds).then((next) => {
      if (!cancelled) {
        setImages(next);
        setLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [eventIds]);

  if (!loaded || images.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
        Photos from these events
      </h3>
      <ImageGallery images={images} showEventCaption />
    </div>
  );
}
