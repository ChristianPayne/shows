import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { commands } from "@/lib/commands";
import type { ChangelogEntry } from "@/bindings";

// Turn `**bold**` spans into <strong>. The changelog only uses bold lead-ins,
// so a full markdown renderer would be overkill — splitting on `**` and bolding
// the odd segments covers it. (Rust owns the structure; this is pure display.)
function renderItem(text: string) {
  return text.split("**").map((seg, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-medium text-foreground">
        {seg}
      </strong>
    ) : (
      seg
    ),
  );
}

interface ChangelogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The running app version (no `v` prefix), used to flag the current entry. */
  currentVersion: string;
}

export function ChangelogDialog({ open, onOpenChange, currentVersion }: ChangelogDialogProps) {
  // Fetch once, lazily on first open — the bundled changelog never changes
  // within a run, so there's nothing to refresh.
  const [entries, setEntries] = useState<ChangelogEntry[] | null>(null);

  useEffect(() => {
    if (open && entries === null) {
      commands.getChangelog().then(setEntries);
    }
  }, [open, entries]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] max-w-2xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>What's New</DialogTitle>
        </DialogHeader>
        <div className="-mr-2 space-y-6 overflow-y-auto pr-2">
          {entries?.map((entry) => (
            <section key={entry.version}>
              <div className="mb-2 flex items-baseline gap-2">
                <h3 className="text-sm font-semibold">{entry.version}</h3>
                {entry.version === `v${currentVersion}` && (
                  <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                    Current
                  </span>
                )}
                {entry.date && (
                  <span className="text-xs text-muted-foreground">{entry.date}</span>
                )}
              </div>
              {entry.sections.map((section, si) => (
                <div key={si} className="mb-3 last:mb-0">
                  {section.title && (
                    <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {section.title}
                    </h4>
                  )}
                  <ul className="space-y-1">
                    {section.items.map((item, ii) => (
                      <li key={ii} className="flex gap-2 text-sm text-muted-foreground">
                        <span className="select-none text-muted-foreground/50">•</span>
                        <span>{renderItem(item)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
