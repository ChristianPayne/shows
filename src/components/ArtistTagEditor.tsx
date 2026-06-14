import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Autocomplete } from "@/components/Autocomplete";
import { Plus, X, Sparkles } from "lucide-react";
import { commands } from "@/lib/commands";
import { tagChipStyle } from "@/lib/tagColor";
import type { SimilarArtist, TagSuggestion } from "@/bindings";

// User-curated tags for an artist. Tags are deliberate: typed by hand or
// picked from MusicBrainz suggestions (which are fetched on demand and never
// auto-applied). Saved tags drive the "similar artists" discovery below —
// other artists in the collection that share tags.

export function ArtistTagEditor({ artistId }: { artistId: number }) {
  const [tags, setTags] = useState<string[]>([]);
  const [similar, setSimilar] = useState<SimilarArtist[]>([]);
  const [suggestions, setSuggestions] = useState<TagSuggestion[]>([]);
  // Tags already applied somewhere in the collection. Reusing the exact tag is
  // what powers shared-tag discovery (vs. fragmenting "psych" / "psychedelic").
  const [usedTags, setUsedTags] = useState<string[]>([]);
  // The seeded common-tags pool (common genres), so the add field offers
  // sensible tags even on a fresh collection where nothing's been applied yet.
  const [commonTags, setCommonTags] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);

  useEffect(() => {
    commands.getArtistTags(artistId).then(setTags);
    commands.getSimilarArtistsByTags(artistId).then(setSimilar);
    commands.getArtistTagCounts().then((counts) =>
      setUsedTags(counts.map((c) => c.key))
    );
    commands.getCommonTags().then(setCommonTags);
    // New artist context — drop any suggestions pulled for the previous one.
    setSuggestions([]);
    setSuggestError(null);
  }, [artistId]);

  // Saved tags change which artists are "similar", so re-pull after each edit.
  const refreshSimilar = () =>
    commands.getSimilarArtistsByTags(artistId).then(setSimilar);

  const addTag = (raw: string) => {
    const tag = raw.trim().toLowerCase();
    setInput("");
    if (!tag || tags.includes(tag)) return;
    setTags((prev) => [...prev, tag].sort());
    commands.addArtistTag(artistId, tag).then(refreshSimilar);
  };

  const removeTag = (tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
    commands.removeArtistTag(artistId, tag).then(refreshSimilar);
  };

  const pullSuggestions = () => {
    setSuggesting(true);
    setSuggestError(null);
    commands
      .suggestArtistTags(artistId)
      .then(setSuggestions)
      .catch((e) => setSuggestError(String(e)))
      .finally(() => setSuggesting(false));
  };

  // MusicBrainz suggestions the artist doesn't already have, in vote order —
  // shown as the "tap to add" chips.
  const openSuggestions = useMemo(
    () => suggestions.filter((s) => !tags.includes(s.name.toLowerCase())),
    [suggestions, tags]
  );

  // The add field's typeahead: the seeded common genres + tags you've already
  // used + any pulled MusicBrainz tags, deduped and minus what's already on
  // this artist.
  const addFieldSuggestions = useMemo(() => {
    const set = new Set([...commonTags, ...usedTags]);
    for (const s of suggestions) set.add(s.name.toLowerCase());
    for (const t of tags) set.delete(t);
    return [...set].sort();
  }, [commonTags, usedTags, suggestions, tags]);

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">Tags</h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={pullSuggestions}
          disabled={suggesting}
        >
          <Sparkles className="h-4 w-4" />
          {suggesting ? "Fetching…" : "Suggest from MusicBrainz"}
        </Button>
      </div>

      {tags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <Badge
              key={tag}
              variant="outline"
              className="gap-1"
              style={tagChipStyle(tag)}
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="opacity-70 hover:opacity-100"
                aria-label={`Remove ${tag}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          No tags yet. Type your own, or pull suggestions from MusicBrainz.
        </p>
      )}

      <Autocomplete
        value={input}
        onChange={setInput}
        suggestions={addFieldSuggestions}
        onCommit={addTag}
        placeholder="Add a tag"
      />

      {suggestError && <p className="text-xs text-destructive">{suggestError}</p>}

      {openSuggestions.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Tap to add:</p>
          <div className="flex flex-wrap gap-1.5">
            {openSuggestions.map((s) => (
              <button
                key={s.name}
                type="button"
                onClick={() => addTag(s.name)}
                style={tagChipStyle(s.name)}
                className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs opacity-80 hover:opacity-100 transition-opacity"
              >
                <Plus className="h-3 w-3" />
                {s.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {similar.length > 0 && (
        <div className="pt-1">
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Similar by tags
          </p>
          <div className="flex flex-wrap gap-1.5">
            {similar.map((s) => (
              <Link key={s.id} to={`/artists/${s.id}`}>
                <Badge
                  variant="outline"
                  className="cursor-pointer hover:bg-accent hover:text-primary hover:border-primary/30 transition-colors"
                >
                  {s.name}
                  <span className="ml-1 text-muted-foreground">{s.event_count}</span>
                </Badge>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
