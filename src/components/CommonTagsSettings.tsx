import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";
import { commands } from "@/lib/commands";

// Manage the common-tags pool — the common genres seeded at install that the
// artist "Add a tag" field offers. Removing one here only stops it being
// suggested; tags already applied to artists are untouched.

export function CommonTagsSettings() {
  const [commonTags, setCommonTags] = useState<string[]>([]);
  const [input, setInput] = useState("");

  useEffect(() => {
    commands.getCommonTags().then(setCommonTags);
  }, []);

  const add = () => {
    const tag = input.trim().toLowerCase();
    setInput("");
    if (!tag || commonTags.includes(tag)) return;
    setCommonTags((prev) => [...prev, tag].sort());
    commands.addCommonTag(tag);
  };

  const remove = (tag: string) => {
    setCommonTags((prev) => prev.filter((t) => t !== tag));
    commands.removeCommonTag(tag);
  };

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div>
        <p className="text-sm font-medium">Genre suggestions</p>
        <p className="text-xs text-muted-foreground">
          Offered in the artist "Add a tag" field. Remove any you'll never use,
          or add your own.
        </p>
      </div>
      <Input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
        }}
        placeholder="Add a genre and press Enter"
      />
      {commonTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {commonTags.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1">
              {tag}
              <button
                type="button"
                onClick={() => remove(tag)}
                className="hover:text-muted-foreground"
                aria-label={`Remove ${tag}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
