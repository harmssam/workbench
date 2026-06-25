import { useCallback, useEffect, useState } from "react";
import { Landmark, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { EmptyState } from "../components/EmptyState";
import { ErrorBanner } from "../components/ErrorBanner";
import { PageHeader } from "../components/PageHeader";
import {
  createAccount,
  deleteAccount,
  getAccounts,
  updateAccount,
  type Account,
} from "../lib/api";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Input } from "../components/ui/Input";

export function Accounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAccounts(await getAccounts());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load accounts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;

    setCreating(true);
    setError(null);
    try {
      await createAccount(trimmed);
      setNewName("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create account");
    } finally {
      setCreating(false);
    }
  }

  async function handleRename(id: number) {
    const trimmed = editName.trim();
    if (!trimmed) return;

    try {
      const account = accounts.find((a) => a.id === id);
      if (!account) return;
      await updateAccount(id, trimmed, account.include_in_budget);
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename account");
    }
  }

  async function handleDelete(id: number, name: string) {
    if (!window.confirm(`Delete account "${name}"? This cannot be undone.`)) {
      return;
    }
    try {
      await deleteAccount(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete account");
    }
  }

  async function handleToggleInclude(account: Account) {
    try {
      await updateAccount(
        account.id,
        account.name,
        !account.include_in_budget,
      );
      setAccounts((prev) =>
        prev.map((a) =>
          a.id === account.id
            ? { ...a, include_in_budget: !a.include_in_budget }
            : a,
        ),
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update account",
      );
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader
        title="Accounts"
        description="Manage bank and card accounts"
      />

      <div className="flex-1 overflow-y-auto p-8">
        {error && (
          <ErrorBanner message={error} onDismiss={() => setError(null)} />
        )}

        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <Card>
            <CardHeader>
              <CardTitle className="text-base text-zinc-200">
                Your accounts
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-12 text-zinc-500">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm">Loading accounts…</span>
                </div>
              ) : accounts.length === 0 ? (
                <EmptyState
                  icon={Landmark}
                  title="No accounts yet"
                  description="Add a checking, savings, or credit card account to organize your imports."
                />
              ) : (
                <ul className="divide-y divide-zinc-800">
                  {accounts.map((account) => (
                    <li
                      key={account.id}
                      className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-zinc-800/20"
                    >
                      <div className="min-w-0 flex-1">
                        {editingId === account.id ? (
                          <div className="flex items-center gap-2">
                            <Input
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="max-w-xs"
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  void handleRename(account.id);
                                }
                                if (e.key === "Escape") {
                                  setEditingId(null);
                                }
                              }}
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={() => void handleRename(account.id)}
                              className="text-xs text-emerald-400"
                            >
                              Save
                            </button>
                          </div>
                        ) : (
                          <p className="font-medium text-zinc-200">
                            {account.name}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 text-xs text-zinc-500">
                          <input
                            type="checkbox"
                            checked={account.include_in_budget}
                            onChange={() => void handleToggleInclude(account)}
                            className="h-4 w-4 rounded border-zinc-600 bg-zinc-900 text-emerald-600 focus:ring-emerald-600/50"
                          />
                          Include in budget
                        </label>

                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(account.id);
                            setEditName(account.name);
                          }}
                          className="rounded p-1.5 text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300"
                          aria-label={`Rename ${account.name}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void handleDelete(account.id, account.name)
                          }
                          className="rounded p-1.5 text-zinc-600 hover:bg-zinc-800 hover:text-red-400"
                          aria-label={`Delete ${account.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base text-zinc-200">
                New account
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={(e) => void handleCreate(e)} className="space-y-4">
                <Input
                  label="Account name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Checking"
                  required
                />
                <Button type="submit" className="w-full" disabled={creating}>
                  {creating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  Create account
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}