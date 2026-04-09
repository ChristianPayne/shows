import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Check, X } from "lucide-react";

interface EditableNameProps {
  value: string;
  onSave: (newValue: string) => Promise<void>;
  onCancel: () => void;
}

export function EditableName({ value, onSave, onCancel }: EditableNameProps) {
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === value) {
      onCancel();
      return;
    }
    setSaving(true);
    await onSave(trimmed);
    setSaving(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") onCancel();
  };

  return (
    <div className="flex items-center gap-2">
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        autoFocus
        disabled={saving}
        className="text-2xl font-bold h-auto py-0 px-1"
      />
      <Button variant="ghost" size="icon" onClick={handleSave} disabled={saving}>
        <Check className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" onClick={onCancel} disabled={saving}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

interface EditableLocationProps {
  city: string;
  state: string;
  onSave: (city: string, state: string) => Promise<void>;
  onCancel: () => void;
}

export function EditableLocation({ city, state, onSave, onCancel }: EditableLocationProps) {
  const [draftCity, setDraftCity] = useState(city);
  const [draftState, setDraftState] = useState(state);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const trimmedCity = draftCity.trim();
    const trimmedState = draftState.trim();
    if (!trimmedCity || !trimmedState || (trimmedCity === city && trimmedState === state)) {
      onCancel();
      return;
    }
    setSaving(true);
    await onSave(trimmedCity, trimmedState);
    setSaving(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") onCancel();
  };

  return (
    <div className="flex items-center gap-2">
      <Input
        value={draftCity}
        onChange={(e) => setDraftCity(e.target.value)}
        onKeyDown={handleKeyDown}
        autoFocus
        disabled={saving}
        placeholder="City"
        className="text-2xl font-bold h-auto py-0 px-1"
      />
      <span className="text-2xl font-bold">,</span>
      <Input
        value={draftState}
        onChange={(e) => setDraftState(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={saving}
        placeholder="ST"
        maxLength={2}
        className="text-2xl font-bold h-auto py-0 px-1 w-16"
      />
      <Button variant="ghost" size="icon" onClick={handleSave} disabled={saving}>
        <Check className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" onClick={onCancel} disabled={saving}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
