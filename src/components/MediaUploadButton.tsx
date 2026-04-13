import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { commands } from "@/lib/commands";
import { ALL_MEDIA_EXTENSIONS } from "@/lib/media";

interface MediaUploadButtonProps {
  eventId: number;
  onUploaded: () => void | Promise<void>;
}

export function MediaUploadButton({ eventId, onUploaded }: MediaUploadButtonProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setError(null);
    const selected = await open({
      multiple: true,
      filters: [
        { name: "Images and videos", extensions: [...ALL_MEDIA_EXTENSIONS] },
      ],
    });
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    if (paths.length === 0) return;

    setBusy(true);
    try {
      for (const path of paths) {
        await commands.addEventMedia(eventId, path);
      }
      await onUploaded();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleClick}
        disabled={busy}
      >
        <Upload className="mr-2 h-4 w-4" />
        {busy ? "Uploading..." : "Add media"}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
