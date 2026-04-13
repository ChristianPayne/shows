import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import type { PreviewRow, PreviewStatus } from "@/bindings";

interface CsvPreviewDialogProps {
  open: boolean;
  rows: PreviewRow[];
  onCancel: () => void;
  onConfirm: (selectedIndices: number[]) => void | Promise<void>;
  importing: boolean;
}

/** Only `Ok` rows are user-selectable. Duplicates / parse errors / venue
 *  conflicts are surfaced so the user understands the state of their CSV
 *  but can't be imported — they're disabled in the list. */
function isSelectable(status: PreviewStatus): boolean {
  return status.kind === "Ok";
}

export function CsvPreviewDialog({
  open,
  rows,
  onCancel,
  onConfirm,
  importing,
}: CsvPreviewDialogProps) {
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Re-seed on (re)open with every selectable row pre-checked. Without this
  // the same Set<number> would leak across successive imports.
  useEffect(() => {
    if (!open) return;
    const next = new Set<number>();
    for (const r of rows) {
      if (isSelectable(r.status)) next.add(r.row.row_index);
    }
    setSelected(next);
  }, [open, rows]);

  const selectableCount = useMemo(
    () => rows.filter((r) => isSelectable(r.status)).length,
    [rows]
  );

  const toggle = (index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const selectAll = () => {
    const next = new Set<number>();
    for (const r of rows) {
      if (isSelectable(r.status)) next.add(r.row.row_index);
    }
    setSelected(next);
  };

  const deselectAll = () => {
    setSelected(new Set());
  };

  const handleConfirm = () => {
    const indices = Array.from(selected).sort((a, b) => a - b);
    void onConfirm(indices);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !importing) onCancel();
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Preview import</DialogTitle>
          <DialogDescription>
            {rows.length === 0
              ? "The CSV has no data rows."
              : `${selected.size} of ${selectableCount} importable rows selected · ${rows.length} total`}
          </DialogDescription>
        </DialogHeader>

        {rows.length > 0 && (
          <div className="flex items-center gap-2 text-xs">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={selectAll}
              disabled={importing || selectableCount === 0}
            >
              Select all
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={deselectAll}
              disabled={importing || selected.size === 0}
            >
              Deselect all
            </Button>
          </div>
        )}

        <div className="max-h-[60vh] overflow-y-auto rounded-md border">
          {rows.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              No rows to import.
            </p>
          ) : (
            <ul className="divide-y">
              {rows.map((r) => (
                <PreviewRowItem
                  key={r.row.row_index}
                  row={r}
                  checked={selected.has(r.row.row_index)}
                  onToggle={() => toggle(r.row.row_index)}
                  disabled={importing}
                />
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={importing}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={importing || selected.size === 0}
          >
            {importing
              ? "Importing..."
              : `Import ${selected.size} ${selected.size === 1 ? "row" : "rows"}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PreviewRowItem({
  row,
  checked,
  onToggle,
  disabled,
}: {
  row: PreviewRow;
  checked: boolean;
  onToggle: () => void;
  disabled: boolean;
}) {
  const selectable = isSelectable(row.status);
  // Flat list of artist names for display. The backend preserves b2b
  // groupings via the nested structure, but the preview is easier to scan as
  // a single line.
  const artistDisplay = row.row.artist_groups
    .flat()
    .join(" · ");

  return (
    <li>
      <label
        className={`flex items-start gap-3 px-3 py-2 text-sm ${
          selectable && !disabled ? "cursor-pointer hover:bg-accent" : ""
        } ${!selectable ? "opacity-70" : ""}`}
      >
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 shrink-0"
          checked={checked}
          onChange={onToggle}
          disabled={!selectable || disabled}
          aria-label={`Row ${row.row.row_index + 2}`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate font-medium">
              {row.row.event_name || <em className="text-muted-foreground">(no event name)</em>}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {formatDateRange(row.row.date, row.row.end_date)}
            </span>
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {row.row.venue_name || "—"} · {row.row.city}
            {row.row.state && `, ${row.row.state}`}
          </div>
          {artistDisplay && (
            <div className="truncate text-xs text-muted-foreground">
              {artistDisplay}
            </div>
          )}
        </div>
        <StatusBadge status={row.status} />
      </label>
    </li>
  );
}

function StatusBadge({ status }: { status: PreviewStatus }) {
  switch (status.kind) {
    case "Ok":
      return (
        <Badge variant="outline" className="shrink-0 border-primary/40 text-primary">
          New
        </Badge>
      );
    case "Duplicate":
      return (
        <Badge variant="outline" className="shrink-0 text-muted-foreground">
          Duplicate
        </Badge>
      );
    case "VenueConflict":
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className="shrink-0 border-destructive/40 text-destructive"
            >
              Venue conflict
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            Venue already exists at {status.existing_location}
          </TooltipContent>
        </Tooltip>
      );
    case "ParseError":
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className="shrink-0 border-destructive/40 text-destructive"
            >
              Parse error
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            {status.message}
          </TooltipContent>
        </Tooltip>
      );
  }
}

function formatDateRange(date: string | null, endDate: string | null): string {
  if (!date) return "—";
  if (endDate) return `${formatDate(date)} – ${formatDate(endDate)}`;
  return formatDate(date);
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  return `${month}/${day}/${year}`;
}
