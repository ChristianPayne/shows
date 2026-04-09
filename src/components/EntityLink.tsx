import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import type { ArtistInfo } from "@/types";

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
 * Renders a list of artists, grouping b2b sets into single badges
 * where each artist name is independently clickable.
 */
export function ArtistBadgeList({ artists }: { artists: ArtistInfo[] }) {
  const groups = groupArtists(artists);

  return (
    <div className="flex flex-wrap gap-1">
      {groups.map((group, i) => {
        if (group.length === 1) {
          return (
            <ArtistBadge
              key={group[0].id}
              name={group[0].name}
              artistId={group[0].id}
            />
          );
        }

        // B2B group — render as a single badge with multiple clickable names
        return (
          <Badge key={`b2b-${i}`} variant="outline" className="gap-0 hover:bg-accent hover:text-primary hover:border-primary/30 transition-colors">
            {group.map((artist, j) => (
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

/** Group artists by set_group. Solo artists (null group) are each their own group. */
function groupArtists(artists: ArtistInfo[]): ArtistInfo[][] {
  const groups: ArtistInfo[][] = [];
  const groupMap = new Map<number, ArtistInfo[]>();

  for (const artist of artists) {
    if (artist.set_group != null) {
      const existing = groupMap.get(artist.set_group);
      if (existing) {
        existing.push(artist);
      } else {
        const group = [artist];
        groupMap.set(artist.set_group, group);
        groups.push(group);
      }
    } else {
      groups.push([artist]);
    }
  }

  return groups;
}
