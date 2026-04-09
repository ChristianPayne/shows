import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, Merge, Trash2, Ban, Undo2 } from "lucide-react";

interface ActionsMenuProps {
  onEdit?: () => void;
  editLabel?: string;
  onMerge?: () => void;
  onCancel?: () => void;
  cancelled?: boolean;
  onDelete?: () => void;
}

export function ActionsMenu({
  onEdit,
  editLabel = "Rename",
  onMerge,
  onCancel,
  cancelled,
  onDelete,
}: ActionsMenuProps) {
  const hasActions = !!onEdit || !!onMerge || !!onCancel || !!onDelete;

  if (!hasActions) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {onEdit && (
          <DropdownMenuItem onClick={onEdit}>
            <Pencil /> {editLabel}
          </DropdownMenuItem>
        )}
        {onMerge && (
          <DropdownMenuItem onClick={onMerge}>
            <Merge /> Merge
          </DropdownMenuItem>
        )}
        {onCancel && (
          <DropdownMenuItem onClick={onCancel}>
            {cancelled ? <Undo2 /> : <Ban />}
            {cancelled ? "Mark Active" : "Mark Cancelled"}
          </DropdownMenuItem>
        )}
        {onDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onDelete}>
              <Trash2 /> Delete
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
