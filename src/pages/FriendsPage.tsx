import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { BackButton } from "@/components/BackButton";
import { EntityMediaSection } from "@/components/EntityMediaSection";
import { EventsTable } from "@/components/EventsTable";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowUpDown, MoreHorizontal, UserPlus } from "lucide-react";
import { SkeletonTableRow } from "@/components/Skeleton";
import { EditableName } from "@/components/EditableName";
import { ActionsMenu } from "@/components/ActionsMenu";
import { useStreamerMode } from "@/lib/streamerMode";
import { commands } from "@/lib/commands";
import type {
  FriendWithCount,
  EventDetail,
  EntitySortKey,
  SortDir,
  EventSortKey,
} from "@/bindings";

let lastFriendCount = 0;

export function FriendsListPage() {
  const navigate = useNavigate();
  const [friends, setFriends] = useState<FriendWithCount[] | null>(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<EntitySortKey>("count");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [newFriend, setNewFriend] = useState("");
  const [adding, setAdding] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  // Bumped after a standalone add so the list re-queries and the new
  // (zero-event) friend shows up immediately.
  const [refresh, setRefresh] = useState(0);

  const [friendEvents, setFriendEvents] = useState<Map<number, string[]>>(new Map());

  useEffect(() => {
    commands.getFriendEventNames().then((rows) => {
      setFriendEvents(new Map(rows.map((r) => [r.id, r.names])));
    });
  }, []);

  useEffect(() => {
    commands.queryFriends({ query: search, sortKey, sortDir }).then((data) => {
      lastFriendCount = data.length;
      setFriends(data);
    });
  }, [search, sortKey, sortDir, refresh]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newFriend.trim();
    if (!name || adding) return;
    setAdding(true);
    try {
      await commands.createFriend(name);
      setNewFriend("");
      setAddOpen(false);
      setRefresh((r) => r + 1);
    } finally {
      setAdding(false);
    }
  };

  const toggleSort = (key: EntitySortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "count" ? "desc" : "asc");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Friends</h1>
        <Input
          placeholder="Search friends..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-1/2 mx-auto"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="shrink-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setAddOpen(true)}>
              <UserPlus /> Add friend
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog
        open={addOpen}
        onOpenChange={(o) => {
          setAddOpen(o);
          if (!o) setNewFriend("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Friend</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4">
            <Input
              autoFocus
              placeholder="Friend's name"
              value={newFriend}
              onChange={(e) => setNewFriend(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setAddOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!newFriend.trim() || adding}>
                {adding ? "Adding…" : "Add"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10 text-muted-foreground">#</TableHead>
            <TableHead
              className="cursor-pointer select-none hover:text-foreground transition-colors"
              onClick={() => toggleSort("name")}
            >
              <div className="flex items-center gap-1">Name <ArrowUpDown className="h-3 w-3" /></div>
            </TableHead>
            <TableHead className="w-1/4" />
            <TableHead
              className="w-16 text-right cursor-pointer select-none hover:text-foreground transition-colors"
              onClick={() => toggleSort("count")}
            >
              <div className="flex items-center justify-end gap-1">Events <ArrowUpDown className="h-3 w-3" /></div>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {!friends ? (
            Array.from({ length: lastFriendCount || 10 }, (_, i) => (
              <SkeletonTableRow key={i} colSpan={4} />
            ))
          ) : friends.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                No friends found
              </TableCell>
            </TableRow>
          ) : (() => {
            const maxCount = Math.max(1, ...friends.map((f) => f.event_count));
            return friends.map((friend, index) => {
              const pct = (friend.event_count / maxCount) * 100;
              return (
                <TableRow
                  key={friend.id}
                  className="group cursor-pointer"
                  onClick={() => navigate(`/friends/${friend.id}`)}
                >
                  <TableCell className="text-muted-foreground text-xs">{index + 1}</TableCell>
                  <TableCell>
                    <span className="text-sm font-medium">{friend.name}</span>
                  </TableCell>
                  <TableCell>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="h-5 bg-muted rounded overflow-hidden relative">
                          <div
                            className="absolute right-0 top-0 h-full bg-foreground/15 group-hover:bg-primary/70 rounded-l transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </TooltipTrigger>
                      {friendEvents.has(friend.id) && (
                        <TooltipContent side="bottom" className="max-w-xs">
                          <div className="flex flex-col gap-0.5">
                            {friendEvents.get(friend.id)!.map((name, j) => (
                              <span key={j}>{name}</span>
                            ))}
                          </div>
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">
                    {friend.event_count}
                  </TableCell>
                </TableRow>
              );
            });
          })()}
        </TableBody>
      </Table>
    </div>
  );
}

export function FriendDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const friendId = Number(id);
  // Names arrive masked from the backend while streamer mode is on, so the
  // rename editor would seed from a first-name-only value — disable it rather
  // than let a save overwrite the real name.
  const streamerMode = useStreamerMode();

  const [friends, setFriends] = useState<FriendWithCount[]>([]);
  const [events, setEvents] = useState<EventDetail[]>([]);
  const [eventsSortKey, setEventsSortKey] = useState<EventSortKey>("date");
  const [eventsSortDir, setEventsSortDir] = useState<SortDir>("desc");
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    commands.getFriends().then(setFriends);
  }, []);

  useEffect(() => {
    if (friendId) commands.getEventsForFriend(friendId, eventsSortKey, eventsSortDir).then(setEvents);
  }, [friendId, eventsSortKey, eventsSortDir]);

  const friend = useMemo(
    () => friends.find((f) => f.id === friendId),
    [friends, friendId]
  );

  if (!friend) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <BackButton />
        <div className="flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Friend</p>
          {editing ? (
            <EditableName
              value={friend.name}
              onCancel={() => setEditing(false)}
              onSave={async (name) => {
                await commands.renameFriend(friend.id, name);
                setFriends((prev) =>
                  prev.map((f) => (f.id === friend.id ? { ...f, name } : f))
                );
                setEditing(false);
              }}
            />
          ) : (
            <h1 className="text-xl font-semibold">{friend.name}</h1>
          )}
          <p className="text-sm text-muted-foreground">
            {friend.event_count} event{friend.event_count !== 1 ? "s" : ""}
          </p>
        </div>
        <ActionsMenu
          onEdit={streamerMode ? undefined : () => setEditing(true)}
          onDelete={friend.event_count === 0 ? async () => {
            await commands.deleteFriend(friend.id);
            navigate("/friends");
          } : undefined}
        />
      </div>
      <EventsTable
        events={events}
        sortKey={eventsSortKey}
        sortDir={eventsSortDir}
        onSortChange={(k, d) => {
          setEventsSortKey(k);
          setEventsSortDir(d);
        }}
      />
      <EntityMediaSection eventIds={events.map((e) => e.id)} />
    </div>
  );
}
