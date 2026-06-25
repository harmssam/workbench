import { useCallback, useEffect, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  Check,
  Database,
  Download,
  FolderOpen,
  Loader2,
  Shield,
  Upload,
} from "lucide-react";
import {
  exportDatabase,
  getDataPath,
  openDataFolder,
  restoreDatabase,
} from "../lib/api";
import { ErrorBanner } from "../components/ErrorBanner";
import { PageHeader } from "../components/PageHeader";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";

export function Settings() {
  const [dataPath, setDataPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDataPath(await getDataPath());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleExport() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const path = await save({
        defaultPath: "harmless-budget-backup.db",
        filters: [{ name: "SQLite Database", extensions: ["db"] }],
      });
      if (!path) return;

      await exportDatabase(path);
      setMessage("Backup exported successfully.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to export backup");
    } finally {
      setBusy(false);
    }
  }

  async function handleRestore() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const path = await open({
        multiple: false,
        filters: [{ name: "SQLite Database", extensions: ["db"] }],
      });
      if (!path || Array.isArray(path)) return;

      if (
        !window.confirm(
          "Restore will replace your current database. A safety copy of the current file will be saved first. Continue?",
        )
      ) {
        return;
      }

      await restoreDatabase(path);
      setMessage("Database restored. Restart the app if data looks stale.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to restore backup");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader
        title="Settings"
        description="Data location, backups, and privacy"
      />

      <div className="flex-1 overflow-y-auto p-8">
        {loading && (
          <div className="flex items-center gap-2 text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        )}

        {error && (
          <ErrorBanner message={error} onDismiss={() => setError(null)} />
        )}

        {message && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-900/50 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-400">
            <Check className="h-4 w-4 shrink-0" />
            {message}
          </div>
        )}

        <div className="mx-auto max-w-2xl space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-zinc-200">
                <Database className="h-4 w-4" />
                Data storage
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-zinc-500">
                All data is stored locally on your Mac in a single SQLite file.
              </p>
              {dataPath && (
                <code className="block break-all rounded-lg bg-zinc-900 px-4 py-3 text-xs text-zinc-400">
                  {dataPath}
                </code>
              )}
              <Button
                variant="outline"
                onClick={() => void openDataFolder()}
                disabled={busy}
              >
                <FolderOpen className="h-4 w-4" />
                Open data folder
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-zinc-200">
                <Download className="h-4 w-4" />
                Backup & restore
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Button onClick={() => void handleExport()} disabled={busy}>
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Export backup
              </Button>
              <Button
                variant="outline"
                onClick={() => void handleRestore()}
                disabled={busy}
              >
                <Upload className="h-4 w-4" />
                Restore backup
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-zinc-200">
                <Shield className="h-4 w-4" />
                Privacy
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-zinc-400">
                <li>• This app makes no network connections.</li>
                <li>• No analytics, telemetry, or crash reporting.</li>
                <li>• Your financial data never leaves your computer.</li>
                <li>• CSV imports use the native file picker only.</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}