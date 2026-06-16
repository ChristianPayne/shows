import {
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
} from "recharts";
import { Link } from "react-router-dom";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { GenreCount } from "@/bindings";

const chartConfig = {
  count: {
    label: "Shows",
    // Tailwind theme variable. `hsl(var(--primary))` ties the radar fill to
    // whichever accent the user has active, so the chart re-skins with the
    // rest of the app when themes change.
    color: "hsl(var(--primary))",
  },
} satisfies ChartConfig;

interface GenresRadarProps {
  genres: GenreCount[];
}

export function GenresRadar({ genres }: GenresRadarProps) {
  if (genres.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <h3 className="mb-1 text-sm font-medium">No genre data yet</h3>
        <p className="text-xs text-muted-foreground">
          Add tags to your{" "}
          <Link to="/artists" className="underline">
            artists
          </Link>{" "}
          to chart your taste — open an artist and type your own, or pick from
          MusicBrainz suggestions.
        </p>
      </div>
    );
  }

  // Recharts wants an array of objects with a stable key per axis value.
  // We use `tag` for the label and `count` for the numeric radius.
  const data = genres.map((g) => ({ tag: g.name, count: g.count }));

  return (
    <ChartContainer
      config={chartConfig}
      className="mx-auto aspect-square max-h-[420px] w-full max-w-[520px]"
    >
      {/* Recharts' RadarChart doesn't reserve space for its own axis labels
          — the polar axis renders ticks at a fixed radius and they spill
          past the SVG edges if the labels are long. The explicit margin
          pushes the chart's inner drawing area in from the container walls
          so "electronica" and similar tags have room to render fully. */}
      <RadarChart data={data} margin={{ top: 24, right: 80, bottom: 24, left: 80 }}>
        <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
        <PolarGrid />
        <PolarAngleAxis
          dataKey="tag"
          // Truncate only very long tags — the new margins handle most
          // realistic MusicBrainz tag lengths. Full tag still surfaces in
          // the tooltip regardless.
          tickFormatter={(value: string) =>
            value.length > 18 ? `${value.slice(0, 17)}…` : value
          }
        />
        <Radar
          dataKey="count"
          fill="var(--color-count)"
          fillOpacity={0.55}
          stroke="var(--color-count)"
        />
      </RadarChart>
    </ChartContainer>
  );
}
