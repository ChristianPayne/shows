import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Separator } from "@/components/ui/separator";
import * as api from "@/api";
import type { Stats } from "@/types";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function StatsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getStats().then(setStats).finally(() => setLoading(false));
  }, []);

  if (loading || !stats) {
    return <p className="text-muted-foreground">Loading dashboard...</p>;
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Total Shows" value={stats.total_events} to="/events" />
        <StatCard label="Artists Seen" value={stats.total_artists} to="/artists" />
        <StatCard label="Venues Visited" value={stats.total_venues} to="/venues" />
        <StatCard label="Locations" value={stats.total_locations} to="/locations" />
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        {/* Top artists */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Most Seen Artists</h2>
            <Link to="/artists" className="text-sm text-muted-foreground hover:underline">
              View all
            </Link>
          </div>
          <div className="space-y-2">
            {stats.top_artists.map((artist) => (
              <BarRow
                key={artist.id}
                label={artist.name}
                count={artist.count}
                max={stats.top_artists[0]?.count ?? 1}
                to={`/artists/${artist.id}`}
              />
            ))}
          </div>
        </div>

        {/* Top venues */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Most Visited Venues</h2>
            <Link to="/venues" className="text-sm text-muted-foreground hover:underline">
              View all
            </Link>
          </div>
          <div className="space-y-2">
            {stats.top_venues.map((venue) => (
              <BarRow
                key={venue.id}
                label={venue.name}
                count={venue.count}
                max={stats.top_venues[0]?.count ?? 1}
                to={`/venues/${venue.id}`}
              />
            ))}
          </div>
        </div>
      </div>

      <Separator />

      <div className="grid gap-8 md:grid-cols-2">
        {/* Events per year */}
        <div>
          <h2 className="text-lg font-semibold mb-3">Shows Per Year</h2>
          <div className="space-y-2">
            {stats.events_per_year.map((y) => (
              <BarRow
                key={y.year}
                label={y.year}
                count={y.count}
                max={Math.max(...stats.events_per_year.map((e) => e.count))}
              />
            ))}
          </div>
        </div>

        {/* Events per month */}
        <div>
          <h2 className="text-lg font-semibold mb-3">Shows Per Month</h2>
          <div className="space-y-2">
            {stats.events_per_month.map((m) => (
              <BarRow
                key={m.month}
                label={MONTH_NAMES[parseInt(m.month, 10) - 1] ?? m.month}
                count={m.count}
                max={Math.max(...stats.events_per_month.map((e) => e.count))}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, to }: { label: string; value: number; to: string }) {
  return (
    <Link to={to} className="rounded-lg border bg-card p-4 hover:bg-accent/50 transition-colors">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-3xl font-bold">{value}</p>
    </Link>
  );
}

function BarRow({
  label,
  count,
  max,
  to,
}: {
  label: string;
  count: number;
  max: number;
  to?: string;
}) {
  const pct = max > 0 ? (count / max) * 100 : 0;

  const content = (
    <div className="flex items-center gap-3">
      <span className="w-40 text-sm truncate shrink-0">{label}</span>
      <div className="flex-1 h-6 bg-muted rounded overflow-hidden">
        <div
          className="h-full bg-primary/70 rounded transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-sm font-medium w-8 text-right">{count}</span>
    </div>
  );

  if (to) {
    return (
      <Link to={to} className="block hover:bg-accent/30 rounded -mx-2 px-2 py-0.5 transition-colors">
        {content}
      </Link>
    );
  }

  return <div className="py-0.5">{content}</div>;
}
