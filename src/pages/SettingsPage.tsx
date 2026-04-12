import { useState, useRef, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import { Upload, Download, RotateCcw, Trash2, AlertCircle, CheckCircle, FileDown, Music, RefreshCcw, Sun, Moon } from "lucide-react";
import { save, open } from "@tauri-apps/plugin-dialog";
import { ACCENT_PRESETS } from "@/lib/accent";
import * as api from "@/api";
import type { ImportResult } from "@/types";

interface SettingsPageProps {
  accentId: string;
  onAccentChange: (id: string) => void;
  dark: boolean;
  onToggleDark: () => void;
}

export function SettingsPage({ accentId, onAccentChange, dark, onToggleDark }: SettingsPageProps) {
  const [fetchingGenres, setFetchingGenres] = useState(false);
  const [updateMsg, setUpdateMsg] = useState("");
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [setlistfmKey, setSetlistfmKey] = useState("");

  useEffect(() => {
    api.getSetting("setlistfm_api_key").then((value) => {
      setSetlistfmKey(value ?? "");
    });
  }, []);

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    setUpdateMsg("");
    try {
      const meta = await api.fetchUpdate();
      if (meta) {
        setUpdateMsg(
          `Update available: v${meta.version} (current v${meta.currentVersion}). See the banner at the top of the window to install.`,
        );
      } else {
        setUpdateMsg("You're on the latest version.");
      }
    } catch (err) {
      setUpdateMsg(`Update check failed: ${err}`);
    }
    setCheckingUpdate(false);
  };

  useEffect(() => {
    const unlisten = listen<{ done: boolean }>("genre-progress", (event) => {
      setFetchingGenres(!event.payload.done);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  const [importError, setImportError] = useState("");
  const [importSuccess, setImportSuccess] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [backupMsg, setBackupMsg] = useState("");
  const [exportMsg, setExportMsg] = useState("");
  const [restoreMsg, setRestoreMsg] = useState("");
  const [wipeMsg, setWipeMsg] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleWipe = async () => {
    setWipeMsg("");
    try {
      await api.wipeDatabase();
      setWipeMsg("All data has been deleted.");
    } catch (err) {
      setWipeMsg(`Wipe failed: ${err}`);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportError("");
    setImportSuccess(null);

    try {
      const text = await file.text();
      const result = await api.importCsv(text);
      setImportSuccess(result);
    } catch (err) {
      setImportError(String(err));
    }

    setImporting(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleBackup = async () => {
    setBackupMsg("");
    try {
      const now = new Date();
      const timestamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const defaultName = `shows_backup_${timestamp}.zip`;

      const destination = await save({
        defaultPath: defaultName,
        filters: [{ name: "Shows Backup", extensions: ["zip"] }],
      });

      if (!destination) return;

      await api.backupDatabase(destination);
      setBackupMsg(`Backup saved to ${destination}`);
    } catch (err) {
      setBackupMsg(`Backup failed: ${err}`);
    }
  };

  const handleRestore = async () => {
    setRestoreMsg("");
    try {
      // Accept both the new .zip bundle (DB + images) and the legacy raw .db
      // file from pre-v13 backups. The backend sniffs the header to decide
      // which path to run.
      const selected = await open({
        filters: [{ name: "Shows Backup", extensions: ["zip", "db"] }],
        multiple: false,
      });

      if (!selected) return;

      await api.restoreDatabase(selected);
      setRestoreMsg("Database restored successfully. Restart the app to load the restored data.");
    } catch (err) {
      setRestoreMsg(`Restore failed: ${err}`);
    }
  };

  return (
    <div className="space-y-8 max-w-lg">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Accent Color */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Accent Color</h2>
        <p className="text-sm text-muted-foreground">
          Choose the primary accent color used throughout the app.
        </p>
        <div className="flex flex-wrap gap-3">
          {ACCENT_PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => onAccentChange(preset.id)}
              className={`flex flex-col items-center gap-1.5 rounded-lg p-2 transition-colors ${
                accentId === preset.id
                  ? "bg-accent ring-2 ring-primary"
                  : "hover:bg-accent/50"
              }`}
            >
              <div
                className="h-8 w-8 rounded-full border border-border"
                style={{ backgroundColor: preset.swatch }}
              />
              <span className="text-xs">{preset.label}</span>
            </button>
          ))}
          <button
            onClick={onToggleDark}
            className="flex flex-col items-center gap-1.5 rounded-lg p-2 transition-colors hover:bg-accent/50"
            aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
          >
            <div className="h-8 w-8 rounded-full border border-border flex items-center justify-center bg-background">
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </div>
            <span className="text-xs">{dark ? "Light" : "Dark"}</span>
          </button>
        </div>
      </div>

      <Separator />

      {/* API Keys */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">API Keys</h2>
        <div className="space-y-2">
          <label className="text-sm text-muted-foreground" htmlFor="setlistfm-key">
            setlist.fm — enables setlist lookup on event pages
          </label>
          <div className="flex gap-2">
            <input
              id="setlistfm-key"
              type="password"
              placeholder="Enter setlist.fm API key"
              value={setlistfmKey}
              onChange={(e) => setSetlistfmKey(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              onBlur={(e) => {
                // Persist whatever's in the field, including empty — clearing
                // the input is the only way to remove a previously saved key.
                api.setSetting("setlistfm_api_key", e.target.value.trim());
              }}
            />
          </div>
        </div>
      </div>

      <Separator />

      {/* Data */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Data</h2>

        {/* Genres */}
        <div className="rounded-lg border divide-y">
          <button
            className="flex items-center gap-3 w-full px-4 py-3 text-sm hover:bg-accent/50 transition-colors disabled:opacity-50 disabled:pointer-events-none"
            disabled={fetchingGenres}
            onClick={() => { setFetchingGenres(true); api.fetchGenres(); }}
          >
            <Music className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="text-left">
              <p className="font-medium">{fetchingGenres ? "Fetching..." : "Fetch Genres"}</p>
              <p className="text-xs text-muted-foreground">Look up genres from MusicBrainz for artists missing them</p>
            </div>
          </button>
        </div>

        {/* CSV */}
        <div className="rounded-lg border divide-y">
          <button
            className="flex items-center gap-3 w-full px-4 py-3 text-sm hover:bg-accent/50 transition-colors"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
          >
            <Upload className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="text-left">
              <p className="font-medium">{importing ? "Importing..." : "Import CSV"}</p>
              <p className="text-xs text-muted-foreground">Import events from a CSV — dates, names, artists, venues, locations only</p>
            </div>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.tsv,.txt"
            onChange={handleImport}
            className="hidden"
          />
          <button
            className="flex items-center gap-3 w-full px-4 py-3 text-sm hover:bg-accent/50 transition-colors"
            onClick={async () => {
              setExportMsg("");
              try {
                const destination = await save({
                  defaultPath: `shows_export_${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.csv`,
                  filters: [{ name: "CSV", extensions: ["csv"] }],
                });
                if (!destination) return;
                await api.exportCsv(destination);
                setExportMsg(`Exported to ${destination}`);
              } catch (err) {
                setExportMsg(`Export failed: ${err}`);
              }
            }}
          >
            <FileDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="text-left">
              <p className="font-medium">Export CSV</p>
              <p className="text-xs text-muted-foreground">Export events to CSV — dates, names, artists, venues, locations only</p>
            </div>
          </button>
        </div>

        {/* Backup */}
        <div className="rounded-lg border divide-y">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button className="flex items-center gap-3 w-full px-4 py-3 text-sm hover:bg-accent/50 transition-colors">
                <RotateCcw className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="text-left">
                  <p className="font-medium">Restore from Backup</p>
                  <p className="text-xs text-muted-foreground">Restore from a full database backup — overwrites everything</p>
                </div>
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Restore Database</AlertDialogTitle>
                <AlertDialogDescription>
                  This will replace all current data with the backup. This action
                  cannot be undone. Are you sure you want to continue?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleRestore}>
                  Select Backup File
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <button
            className="flex items-center gap-3 w-full px-4 py-3 text-sm hover:bg-accent/50 transition-colors"
            onClick={handleBackup}
          >
            <Download className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="text-left">
              <p className="font-medium">Export Backup</p>
              <p className="text-xs text-muted-foreground">Full database backup — includes all data, metadata, genres, links, and settings</p>
            </div>
          </button>
        </div>
        {(exportMsg || backupMsg || restoreMsg) && (
          <p className="text-sm text-muted-foreground">
            {exportMsg || backupMsg || restoreMsg}
          </p>
        )}
        {importError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Import Failed</AlertTitle>
            <AlertDescription>{importError}</AlertDescription>
          </Alert>
        )}
        {importSuccess && (
          <Alert className="border-green-500/30 text-green-700 dark:text-green-400 [&>svg]:text-green-600 dark:[&>svg]:text-green-400">
            <CheckCircle className="h-4 w-4" />
            <AlertTitle>Import Successful</AlertTitle>
            <AlertDescription>
              Created {importSuccess.events_created} events,{" "}
              {importSuccess.artists_created} artists,{" "}
              {importSuccess.venues_created} venues, and{" "}
              {importSuccess.locations_created} locations.
              {importSuccess.events_skipped > 0 && (
                <> Skipped {importSuccess.events_skipped} duplicate{importSuccess.events_skipped !== 1 ? "s" : ""}.</>
              )}
            </AlertDescription>
          </Alert>
        )}
      </div>

      <Separator />

      {/* Updates */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Updates</h2>
        <div className="rounded-lg border divide-y">
          <button
            className="flex items-center gap-3 w-full px-4 py-3 text-sm hover:bg-accent/50 transition-colors disabled:opacity-50 disabled:pointer-events-none"
            disabled={checkingUpdate}
            onClick={handleCheckUpdate}
          >
            <RefreshCcw className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="text-left">
              <p className="font-medium">{checkingUpdate ? "Checking..." : "Check for Updates"}</p>
              <p className="text-xs text-muted-foreground">Look for a newer published release on GitHub</p>
            </div>
          </button>
        </div>
        {updateMsg && <p className="text-sm text-muted-foreground">{updateMsg}</p>}
      </div>

      <Separator />

      {/* Wipe Database */}
      <div className="rounded-lg border border-destructive/15 dark:border-destructive/25 p-4 space-y-3">
        <h2 className="text-sm font-medium text-destructive/60 dark:text-destructive-foreground/70">Danger Zone</h2>
        <p className="text-sm text-muted-foreground">
          Permanently delete all events, artists, venues, and locations.
        </p>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" className="gap-2 border-destructive/25 dark:border-destructive-foreground/30 text-destructive/70 dark:text-destructive-foreground/70 hover:text-destructive dark:hover:text-destructive-foreground hover:border-destructive/40 hover:bg-destructive/5 dark:hover:bg-destructive-foreground/5">
              <Trash2 className="h-4 w-4" />
              Wipe Database
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Wipe All Data</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete all events, artists, venues, and
                locations. This action cannot be undone. Consider exporting a
                backup first.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleWipe}>
                Wipe Everything
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {wipeMsg && (
          <p className="text-sm text-muted-foreground">{wipeMsg}</p>
        )}
      </div>
    </div>
  );
}
