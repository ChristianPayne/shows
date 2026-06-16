import { useState, useEffect, useRef } from "react";
import { ScrollRestore } from "@/components/ScrollRestore";
import { StatusBar } from "@/components/StatusBar";
import { CommandPalette } from "@/components/CommandPalette";
import { UpdateBanner } from "@/components/UpdateBanner";
import { MemoryRouter, Routes, Route, NavLink, Navigate, useNavigate } from "react-router-dom";
import { EventsListPage, EventDetailPage, EventEditPage, EventNewPage } from "@/pages/EventsPage";
import { ArtistsListPage, ArtistDetailPage } from "@/pages/ArtistsPage";
import { FriendsListPage, FriendDetailPage } from "@/pages/FriendsPage";
import { VenuesListPage, VenueDetailPage } from "@/pages/VenuesPage";
import { LocationsListPage, LocationDetailPage } from "@/pages/LocationsPage";
import { StatsPage } from "@/pages/StatsPage";
import { MediaPage } from "@/pages/MediaPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { cn } from "@/lib/utils";
import { applyAccent, ACCENT_PRESETS, type AccentPreset } from "@/lib/accent";
import { settings } from "@/lib/settings";
import { StreamerModeProvider } from "@/lib/streamerMode";
import { TooltipProvider } from "@/components/ui/tooltip";
import { commands } from "@/lib/commands";
import {
  Calendar,
  Mic2,
  Building2,
  MapPin,
  Settings,
  LayoutDashboard,
  Image as ImageIcon,
  Plus,
  Users,
} from "lucide-react";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" /> },
  { to: "/events", label: "Events", icon: <Calendar className="h-4 w-4" /> },
  { to: "/artists", label: "Artists", icon: <Mic2 className="h-4 w-4" /> },
  { to: "/friends", label: "Friends", icon: <Users className="h-4 w-4" /> },
  { to: "/venues", label: "Venues", icon: <Building2 className="h-4 w-4" /> },
  { to: "/locations", label: "Locations", icon: <MapPin className="h-4 w-4" /> },
  { to: "/media", label: "Media", icon: <ImageIcon className="h-4 w-4" /> },
];

const SETTINGS_NAV = { to: "/settings", label: "Settings", icon: <Settings className="h-4 w-4" /> };

function AppLayout() {
  const navigate = useNavigate();
  const mainRef = useRef<HTMLElement>(null);

  // Mouse back/forward buttons
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (e.button === 3) { e.preventDefault(); navigate(-1); }
      if (e.button === 4) { e.preventDefault(); navigate(1); }
    };
    window.addEventListener("mouseup", handler);
    return () => window.removeEventListener("mouseup", handler);
  }, [navigate]);

  // Cmd/Ctrl+N opens the new event form
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "n" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        navigate("/events/new");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [navigate]);
  const [dark, setDark] = useState(
    document.documentElement.classList.contains("dark")
  );
  const [accentId, setAccentId] = useState("neutral");
  const [customAccents, setCustomAccents] = useState<AccentPreset[]>([]);
  const [streamerMode, setStreamerMode] = useState(false);
  // Built-in presets + the user's saved custom colors, in one list so both the
  // picker and applyAccent's lookup see every option.
  const accents = [...ACCENT_PRESETS, ...customAccents];

  useEffect(() => {
    // Load persisted theme, accent, and any custom accent colors.
    Promise.all([
      settings.getTheme(),
      settings.getAccent(),
      settings.getCustomAccents(),
      settings.getStreamerMode(),
    ]).then(([theme, accentValue, customs, streamer]) => {
      let isDark = document.documentElement.classList.contains("dark");
      if (theme !== null) {
        isDark = theme === "dark";
        setDark(isDark);
        document.documentElement.classList.toggle("dark", isDark);
      }
      setCustomAccents(customs);
      const accent = accentValue ?? "neutral";
      setAccentId(accent);
      applyAccent(accent, isDark, [...ACCENT_PRESETS, ...customs]);
      setStreamerMode(streamer);
    });
  }, []);

  const toggleStreamerMode = () => {
    const next = !streamerMode;
    setStreamerMode(next);
    settings.setStreamerMode(next);
  };

  const toggleDark = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    settings.setTheme(next ? "dark" : "light");
    applyAccent(accentId, next, accents);
  };

  const selectAccent = (id: string) => {
    setAccentId(id);
    applyAccent(id, dark, accents);
    settings.setAccent(id);
  };

  const addCustomAccent = async (hex: string) => {
    const accent = await commands.makeCustomAccent(hex);
    const next = customAccents.some((c) => c.id === accent.id)
      ? customAccents
      : [...customAccents, accent];
    setCustomAccents(next);
    settings.setCustomAccents(next);
    // Selecting the freshly added color is the obvious next intent.
    setAccentId(accent.id);
    applyAccent(accent.id, dark, [...ACCENT_PRESETS, ...next]);
    settings.setAccent(accent.id);
  };

  const removeCustomAccent = (id: string) => {
    const next = customAccents.filter((c) => c.id !== id);
    setCustomAccents(next);
    settings.setCustomAccents(next);
    // Fall back to neutral if the deleted color was the active one.
    if (accentId === id) {
      setAccentId("neutral");
      applyAccent("neutral", dark, [...ACCENT_PRESETS, ...next]);
      settings.setAccent("neutral");
    }
  };

  return (
    <StreamerModeProvider value={streamerMode}>
    <div className="flex flex-col h-screen">
    <UpdateBanner />
    <div className="flex flex-1 min-h-0">
      <nav className="w-48 border-r bg-sidebar-background p-4 flex flex-col">
        <div className="flex items-center justify-between px-2 mb-4">
          <h1 className="text-lg font-bold">Shows</h1>
          <NavLink
            to="/events/new"
            className="rounded-md p-1 text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors"
            aria-label="Add event"
          >
            <Plus className="h-4 w-4" />
          </NavLink>
        </div>
        <div className="flex flex-col gap-1">
          {NAV_ITEMS.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                )
              }
            >
              {icon}
              {label}
            </NavLink>
          ))}
        </div>
        <div className="mt-auto flex flex-col gap-1">
          <NavLink
            to="/events/new"
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Event
          </NavLink>
          <NavLink
            to={SETTINGS_NAV.to}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50"
              )
            }
          >
            {SETTINGS_NAV.icon}
            {SETTINGS_NAV.label}
          </NavLink>
        </div>
      </nav>

      <main ref={mainRef} className="flex-1 overflow-auto p-6">
        <ScrollRestore containerRef={mainRef} />
        <Routes>
          <Route path="/events" element={<EventsListPage />} />
          <Route path="/events/new" element={<EventNewPage />} />
          <Route path="/events/:id" element={<EventDetailPage />} />
          <Route path="/events/:id/edit" element={<EventEditPage />} />
          <Route path="/artists" element={<ArtistsListPage />} />
          <Route path="/artists/:id" element={<ArtistDetailPage />} />
          <Route path="/friends" element={<FriendsListPage />} />
          <Route path="/friends/:id" element={<FriendDetailPage />} />
          <Route path="/venues" element={<VenuesListPage />} />
          <Route path="/venues/:id" element={<VenueDetailPage />} />
          <Route path="/locations" element={<LocationsListPage />} />
          <Route path="/locations/:id" element={<LocationDetailPage />} />
          <Route path="/media" element={<MediaPage />} />
          <Route path="/settings" element={
            <SettingsPage
              accentId={accentId}
              customAccents={customAccents}
              onAccentChange={selectAccent}
              onAddCustomAccent={addCustomAccent}
              onRemoveCustomAccent={removeCustomAccent}
              dark={dark}
              onToggleDark={toggleDark}
              streamerMode={streamerMode}
              onToggleStreamerMode={toggleStreamerMode}
            />
          } />
          <Route path="/" element={<StatsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
    <StatusBar />
    <CommandPalette />
    </div>
    </StreamerModeProvider>
  );
}

function App() {
  return (
    <TooltipProvider delayDuration={100}>
      <MemoryRouter initialEntries={["/"]}>
        <AppLayout />
      </MemoryRouter>
    </TooltipProvider>
  );
}

export default App;
