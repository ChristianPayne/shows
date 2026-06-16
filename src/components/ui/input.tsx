import * as React from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

// Types that get a clear (X) button — plain text-entry fields. Pickers
// (date/color/file), numbers, ranges, and toggles either have a native
// affordance or no meaningful "empty" to clear to, so they stay bare.
const CLEARABLE_TYPES = new Set(["text", "search", "email", "url", "tel", "password"]);

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    // Own ref to the input (for clear + focus) merged with any forwarded ref.
    const innerRef = React.useRef<HTMLInputElement>(null);
    const setRefs = React.useCallback(
      (el: HTMLInputElement | null) => {
        innerRef.current = el;
        if (typeof ref === "function") ref(el);
        else if (ref) ref.current = el;
      },
      [ref],
    );

    const renderInput = (withClearPadding: boolean) => (
      <input
        type={type}
        // Default the native macOS/WebKit autofill + spellcheck off for every
        // field — this is a structured data-entry app, not a web form, so the
        // OS contact/address hints and red squiggles on names/venues are noise.
        // Placed before {...props} so any field can opt back in.
        autoComplete="off"
        spellCheck={false}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          withClearPadding && "pr-8",
          className,
        )}
        ref={setRefs}
        {...props}
      />
    );

    const clearable = CLEARABLE_TYPES.has(type ?? "text");
    const hasValue = typeof props.value === "string" && props.value.length > 0;
    const showClear = clearable && hasValue && !props.disabled && !props.readOnly;

    // Non-clearable fields render bare — no wrapper, no structural change.
    if (!clearable) return renderInput(false);

    const clear = () => {
      const el = innerRef.current;
      if (!el) return;
      // Set through the prototype setter and dispatch a native input event so a
      // controlled React onChange fires with the empty value, regardless of how
      // the field is wired up.
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(el, "");
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.focus();
    };

    return (
      <div className="relative w-full">
        {renderInput(showClear)}
        {showClear && (
          <button
            type="button"
            // Out of the tab order — it's a mouse affordance; clearing the text
            // by hand still works for keyboard users.
            tabIndex={-1}
            aria-label="Clear"
            onClick={clear}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  },
);
Input.displayName = "Input";

export { Input };
