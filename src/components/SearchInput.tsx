import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Sizes the wrapper; the input fills it. */
  className?: string;
}

// Thin sized wrapper around Input with a string-valued onChange. The clear (X)
// button itself lives on the base Input, so every search box gets it for free
// alongside the rest of the app's text fields.
export function SearchInput({ value, onChange, placeholder, className }: SearchInputProps) {
  return (
    <div className={cn(className)}>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
