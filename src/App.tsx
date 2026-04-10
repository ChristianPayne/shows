import { useState, useEffect, useRef } from "react";
import { ScrollRestore } from "@/components/ScrollRestore";
import { MemoryRouter, Routes, Route, NavLink, Navigate } from "react-router-dom";
import { EventsListPage, EventDetailPage, EventEditPage, EventNewPage } from "@/pages/EventsPage";
import { ArtistsListPage, ArtistDetailPage } from "@/pages/ArtistsPage";
import { VenuesListPage, VenueDetailPage } from "@/pages/VenuesPage";
import { LocationsListPage, LocationDetailPage } from "@/pages/LocationsPage";
import { StatsPage } from "@/pages/StatsPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { cn } from "@/lib/utils";
import { applyAccent } from "@/lib/accent";
import * as api from "@/api";
import {
  Calendar,
  Mic2,
  Building2,
  MapPin,
  Settings,
  Sun,
  Moon,
  LayoutDashboard,
  Plus,
} from "lucide-react";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" /> },
  { to: "/events", label: "Events", icon: <Calendar className="h-4 w-4" />, children: [
    { to: "/artists", label: "Artists", icon: <Mic2 className="h-3.5 w-3.5" /> },
    { to: "/venues", label: "Venues", icon: <Building2 className="h-3.5 w-3.5" /> },
    { to: "/locations", label: "Locations", icon: <MapPin className="h-3.5 w-3.5" /> },
  ]},
];

const SETTINGS_NAV = { to: "/settings", label: "Settings", icon: <Settings className="h-4 w-4" /> };

function AppLayout() {
  const mainRef = useRef<HTMLElement>(null);
  const [dark, setDark] = useState(
    document.documentElement.classList.contains("dark")
  );
  const [accentId, setAccentId] = useState("neutral");

  useEffect(() => {
    // Load persisted theme and accent
    Promise.all([
      api.getSetting("theme"),
      api.getSetting("accent"),
    ]).then(([themeValue, accentValue]) => {
      let isDark = document.documentElement.classList.contains("dark");
      if (themeValue === "dark" || themeValue === "light") {
        isDark = themeValue === "dark";
        setDark(isDark);
        document.documentElement.classList.toggle("dark", isDark);
      }
      const accent = accentValue ?? "neutral";
      setAccentId(accent);
      applyAccent(accent, isDark);
    });
  }, []);

  const toggleDark = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    api.setSetting("theme", next ? "dark" : "light");
    applyAccent(accentId, next);
  };

  return (
    <div className="flex h-screen">
      <nav className="w-48 border-r bg-sidebar-background p-4 flex flex-col">
        <div className="flex items-center justify-between px-2 mb-4">
          <h1 className="text-lg font-bold">Shows</h1>
          <button
            onClick={toggleDark}
            className="rounded-md p-1 text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors"
          >
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
        <div className="flex flex-col gap-1">
          {NAV_ITEMS.map(({ to, label, icon, children }) => (
            <div key={to}>
              <NavLink
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
              {children && (
                <div className="flex flex-col gap-0.5 ml-4 mt-0.5">
                  {children.map((child) => (
                    <NavLink
                      key={child.to}
                      to={child.to}
                      className={({ isActive }) =>
                        cn(
                          "flex items-center gap-2 rounded-md px-2 py-1 text-xs font-medium transition-colors",
                          isActive
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                        )
                      }
                    >
                      {child.icon}
                      {child.label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
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
          <Route path="/venues" element={<VenuesListPage />} />
          <Route path="/venues/:id" element={<VenueDetailPage />} />
          <Route path="/locations" element={<LocationsListPage />} />
          <Route path="/locations/:id" element={<LocationDetailPage />} />
          <Route path="/settings" element={
            <SettingsPage
              accentId={accentId}
              onAccentChange={(id) => {
                setAccentId(id);
                applyAccent(id, dark);
                api.setSetting("accent", id);
              }}
            />
          } />
          <Route path="/" element={<StatsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  return (
    <MemoryRouter initialEntries={["/"]}>
      <AppLayout />
    </MemoryRouter>
  );
}

export default App;
