import { useState, useRef } from "react";
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
import { Upload, Download, RotateCcw, Trash2, AlertCircle, CheckCircle, FileDown } from "lucide-react";
import { save, open } from "@tauri-apps/plugin-dialog";
import { ACCENT_PRESETS } from "@/lib/accent";
import * as api from "@/api";
import type { ImportResult } from "@/types";

interface SettingsPageProps {
  accentId: string;
  onAccentChange: (id: string) => void;
}

export function SettingsPage({ accentId, onAccentChange }: SettingsPageProps) {
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
      const defaultName = `shows_backup_${timestamp}.db`;

      const destination = await save({
        defaultPath: defaultName,
        filters: [{ name: "SQLite Database", extensions: ["db"] }],
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
      const selected = await open({
        filters: [{ name: "SQLite Database", extensions: ["db"] }],
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
        </div>
      </div>

      <Separator />

      {/* Data */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Data</h2>
        <div className="rounded-lg border divide-y">
          <button
            className="flex items-center gap-3 w-full px-4 py-3 text-sm hover:bg-accent/50 transition-colors"
            onClick={async () => {
              setExportMsg("");
              try {
                const destination = await save({
                  defaultPath: "shows_export.csv",
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
              <p className="text-xs text-muted-foreground">Save all events as a spreadsheet</p>
            </div>
          </button>
          <button
            className="flex items-center gap-3 w-full px-4 py-3 text-sm hover:bg-accent/50 transition-colors"
            onClick={handleBackup}
          >
            <Download className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="text-left">
              <p className="font-medium">Export Backup</p>
              <p className="text-xs text-muted-foreground">Save a copy of the database</p>
            </div>
          </button>
          <button
            className="flex items-center gap-3 w-full px-4 py-3 text-sm hover:bg-accent/50 transition-colors"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
          >
            <Upload className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="text-left">
              <p className="font-medium">{importing ? "Importing..." : "Import CSV"}</p>
              <p className="text-xs text-muted-foreground">Load events from a spreadsheet</p>
            </div>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.tsv,.txt"
            onChange={handleImport}
            className="hidden"
          />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button className="flex items-center gap-3 w-full px-4 py-3 text-sm hover:bg-accent/50 transition-colors">
                <RotateCcw className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="text-left">
                  <p className="font-medium">Restore from Backup</p>
                  <p className="text-xs text-muted-foreground">Replace all data with a backup file</p>
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
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertTitle>Import Successful</AlertTitle>
            <AlertDescription>
              Created {importSuccess.events_created} events,{" "}
              {importSuccess.artists_created} artists,{" "}
              {importSuccess.venues_created} venues, and{" "}
              {importSuccess.locations_created} locations.
            </AlertDescription>
          </Alert>
        )}
      </div>

      <Separator />

      {/* Wipe Database */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Danger Zone</h2>
        <p className="text-sm text-muted-foreground">
          Permanently delete all events, artists, venues, and locations.
        </p>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" className="gap-2">
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
