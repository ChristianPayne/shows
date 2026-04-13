import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Autocomplete } from "@/components/Autocomplete";

interface MergeOption {
  id: number;
  label: string;
}

interface MergeDialogProps {
  open: boolean;
  onClose: () => void;
  /** The entity being kept. */
  keepLabel: string;
  keepId: number;
  /** All other entities of the same type that could be merged in. */
  options: MergeOption[];
  onMerge: (keepId: number, mergeId: number) => Promise<void>;
}

export function MergeDialog({
  open,
  onClose,
  keepLabel,
  keepId,
  options,
  onMerge,
}: MergeDialogProps) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [merging, setMerging] = useState(false);

  const selectedOption = options.find((o) => o.id === selectedId);

  const handleSelect = (value: string) => {
    setSearch(value);
    const lowered = value.toLowerCase();
    const match = options.find((o) => o.label.toLowerCase() === lowered);
    setSelectedId(match?.id ?? null);
  };

  const handleMerge = async () => {
    if (!selectedId) return;
    setMerging(true);
    await onMerge(keepId, selectedId);
    setMerging(false);
    setSearch("");
    setSelectedId(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Merge into "{keepLabel}"</DialogTitle>
          <DialogDescription>
            Select a duplicate to merge. All its events will be reassigned to
            "{keepLabel}", and the duplicate will be deleted.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <Autocomplete
            value={search}
            onChange={handleSelect}
            suggestions={options.filter((o) => o.id !== keepId).map((o) => o.label)}
            placeholder="Search for duplicate..."
          />
          {selectedOption && (
            <p className="text-sm text-muted-foreground">
              "{selectedOption.label}" will be merged into "{keepLabel}"
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleMerge}
              disabled={!selectedId || merging}
            >
              {merging ? "Merging..." : "Merge"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
