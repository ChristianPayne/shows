import { useState, useEffect } from "react";
import type { EntitySortKey, SortDir } from "@/bindings";

interface EntityListView {
  search: string;
  sortKey: EntitySortKey;
  sortDir: SortDir;
}

// Per-page list view (search + sort) held at module scope so it survives the
// list page unmounting when you open a detail and click back — plain useState
// resets on every navigation. Keyed by page so Artists/Venues/Locations/Friends
// each keep their own. Session-only by design (not persisted to disk), mirroring
// the approach the events list uses for its search/sort/filter.
const store: Record<string, EntityListView> = {};

export function useEntityListView(pageKey: string) {
  if (!store[pageKey]) {
    store[pageKey] = { search: "", sortKey: "count", sortDir: "desc" };
  }
  const view = store[pageKey];

  const [search, setSearch] = useState(view.search);
  const [sortKey, setSortKey] = useState<EntitySortKey>(view.sortKey);
  const [sortDir, setSortDir] = useState<SortDir>(view.sortDir);

  // Mirror back into module scope on every change so the next mount restores it.
  useEffect(() => {
    view.search = search;
    view.sortKey = sortKey;
    view.sortDir = sortDir;
  }, [view, search, sortKey, sortDir]);

  return { search, setSearch, sortKey, setSortKey, sortDir, setSortDir };
}
