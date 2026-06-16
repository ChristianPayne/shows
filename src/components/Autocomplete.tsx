import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface AutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
  id?: string;
  /**
   * Fired when the user commits a choice — Enter or clicking a suggestion.
   * Receives the *resolved* value: the highlighted suggestion when the
   * dropdown is open, otherwise the typed text. When provided, the field
   * behaves as a multi-add control (e.g. "add a chip"): Enter always commits
   * and the component does NOT call onChange for the commit — the consumer
   * owns what commit means, including clearing the input.
   *
   * When omitted, the field is single-value: Enter commits via onChange only
   * while the dropdown is open (so the highlighted suggestion fills the
   * field), and otherwise falls through to the default (e.g. form submit).
   */
  onCommit?: (value: string) => void;
}

export function Autocomplete({
  value,
  onChange,
  suggestions,
  placeholder,
  id,
  onCommit,
}: AutocompleteProps) {
  const [open, setOpen] = useState(false);
  // First match is highlighted by default so "type a few letters + Enter"
  // commits the obvious choice without ever touching the arrow keys.
  const [highlightIndex, setHighlightIndex] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  // One ref per rendered row so we can scroll the highlighted item back into
  // view when arrow keys move the selection past the menu's max-height.
  const itemRefs = useRef<(HTMLLIElement | null)[]>([]);

  // Combobox behaviour: an empty (but focused) field shows the full list;
  // typing filters it down. The dropdown still only renders while `open`.
  const filtered = value
    ? suggestions.filter((s) => s.toLowerCase().includes(value.toLowerCase()))
    : suggestions;

  // For single-value fields, hide the dropdown once the input already exactly
  // matches the top match — there's nothing left to disambiguate, and a refocus
  // shouldn't pop a redundant one-item menu. Multi-add (chip) fields keep the
  // menu open on an exact match so you can see — and click — that you're adding
  // an existing entry rather than creating a brand-new one.
  const exactTopMatch = filtered[0]?.toLowerCase() === value.toLowerCase();
  const showDropdown =
    open && filtered.length > 0 && (!!onCommit || !exactTopMatch);

  // Reset the highlight to the first row on every keystroke; arrow keys move
  // it within the current result set.
  useEffect(() => {
    setHighlightIndex(0);
  }, [value]);

  // Keep the highlighted row visible as it moves. `block: "nearest"` scrolls
  // the menu the minimum amount — and only when the row is actually off-screen
  // — so a selection already in view doesn't jump.
  useEffect(() => {
    if (showDropdown) {
      itemRefs.current[highlightIndex]?.scrollIntoView({ block: "nearest" });
    }
  }, [highlightIndex, showDropdown]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Resolve + commit a value. Multi-add consumers (onCommit) own the result;
  // single-value consumers fall back to onChange. Either way the menu closes.
  const commit = (chosen: string) => {
    if (onCommit) onCommit(chosen);
    else onChange(chosen);
    setOpen(false);
  };

  const handleKeyDownInternal = (e: React.KeyboardEvent) => {
    if (showDropdown) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightIndex((i) => Math.min(i + 1, filtered.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        // Default highlight is 0, so this commits the first match for a bare
        // "Bra ⏎". Falls back to the typed text if the index is somehow stale.
        commit(filtered[highlightIndex] ?? value);
        return;
      }
    } else if (onCommit && e.key === "Enter") {
      // Multi-add field with no open dropdown — i.e. the typed text matches no
      // suggestion (a brand-new name). Enter adds that text as a new entry
      // rather than submitting the surrounding form.
      e.preventDefault();
      commit(value);
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <Input
        id={id}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        // Close on focus-out so tabbing away (or to the next field) doesn't
        // leave the menu open. Item clicks commit on mousedown with
        // preventDefault, so they never blur the input — only a real focus-out
        // (Tab, click elsewhere) lands here.
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDownInternal}
        placeholder={placeholder}
      />
      {showDropdown && (
        <ul className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border bg-popover p-1 shadow-md">
          {filtered.map((item, i) => (
            <li
              key={item}
              ref={(el) => { itemRefs.current[i] = el; }}
              className={cn(
                "cursor-pointer rounded-sm px-2 py-1.5 text-sm",
                i === highlightIndex
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent hover:text-accent-foreground"
              )}
              onMouseDown={(e) => {
                e.preventDefault();
                commit(item);
              }}
            >
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
