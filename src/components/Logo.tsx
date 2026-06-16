// Equalizer-bar mark for "Shows". Uses currentColor so the sidebar can tint it
// with the active accent (`text-primary`); the OS app icon is a fixed-color
// version of the same bars (see src-tauri/icons/icon-source.svg).
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      {/* Four bars sharing a baseline at y=20.5: short, tall, medium, tall. */}
      <rect x="3" y="12.5" width="3" height="8" rx="1.5" />
      <rect x="8" y="4" width="3" height="16.5" rx="1.5" />
      <rect x="13" y="9.5" width="3" height="11" rx="1.5" />
      <rect x="18" y="5.5" width="3" height="15" rx="1.5" />
    </svg>
  );
}
