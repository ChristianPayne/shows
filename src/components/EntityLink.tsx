import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import type { ArtistSet } from "@/bindings";

interface EntityLinkProps {
  to: string;
  children: React.ReactNode;
}

/** Inline clickable text that navigates via React Router. */
export function EntityLink({ to, children }: EntityLinkProps) {
  return (
    <Link
      to={to}
      className="hover:underline hover:text-foreground transition-colors"
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </Link>
  );
}

/** Artist badge that navigates to the artist's detail view on click. */
export function ArtistBadge({ name, artistId }: { name: string; artistId?: number }) {
  if (artistId === undefined) {
    return <Badge variant="outline">{name}</Badge>;
  }

  return (
    <Link to={`/artists/${artistId}`} onClick={(e) => e.stopPropagation()}>
      <Badge
        variant="outline"
        className="cursor-pointer hover:bg-accent hover:text-primary hover:border-primary/30 hover:underline transition-colors"
      >
        {name}
      </Badge>
    </Link>
  );
}

/**
 * Renders pre-grouped artist sets. Each set is a badge —
 * solo artists are a set of one, b2b artists share a badge.
 */
export function ArtistBadgeList({ sets }: { sets: ArtistSet[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {sets.map((set, i) => {
        if (set.artists.length === 1) {
          const artist = set.artists[0];
          return (
            <ArtistBadge
              key={artist.id}
              name={artist.name}
              artistId={artist.id}
            />
          );
        }

        return (
          <Badge key={`b2b-${i}`} variant="outline" className="gap-0 hover:bg-accent hover:text-primary hover:border-primary/30 transition-colors">
            {set.artists.map((artist, j) => (
              <span key={artist.id} className="inline-flex items-center">
                {j > 0 && (
                  <span className="mx-1 text-muted-foreground">b2b</span>
                )}
                <Link
                  to={`/artists/${artist.id}`}
                  className="hover:underline cursor-pointer"
                  onClick={(e) => e.stopPropagation()}
                >
                  {artist.name}
                </Link>
              </span>
            ))}
          </Badge>
        );
      })}
    </div>
  );
}
