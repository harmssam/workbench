import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { GripVertical, Loader2, Plus, Trash2, Wand2 } from "lucide-react";
import { CreateRuleDialog } from "../components/CreateRuleDialog";
import { EmptyState } from "../components/EmptyState";
import { ErrorBanner } from "../components/ErrorBanner";
import { PageHeader } from "../components/PageHeader";
import {
  applyRules,
  deleteRule,
  getCategories,
  getRules,
  previewApplyRules,
  reorderRules,
  setRuleEnabled,
  type Category,
  type PreviewApplyResult,
  type Rule,
} from "../lib/api";
import { flattenCategories } from "../lib/categories";
import { cn, currentMonthKey, formatErrorMessage } from "../lib/utils";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";

function moveRule(rules: Rule[], dragId: number, overId: number): Rule[] {
  const fromIdx = rules.findIndex((r) => r.id === dragId);
  const toIdx = rules.findIndex((r) => r.id === overId);
  if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return rules;

  const next = [...rules];
  const [item] = next.splice(fromIdx, 1);
  next.splice(toIdx, 0, item);
  return next;
}

export function Rules() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewApplyResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);

  const flatCategories = useMemo(
    () => flattenCategories(categories),
    [categories],
  );

  const categoryMap = useMemo(
    () => new Map(flatCategories.map((c) => [c.id, c.name])),
    [flatCategories],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [r, c] = await Promise.all([getRules(), getCategories()]);
      setRules(r);
      setCategories(c);
    } catch (e) {
      setError(formatErrorMessage(e, "Failed to load rules"));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPreview = useCallback(async () => {
    setPreviewLoading(true);
    try {
      setPreview(
        await previewApplyRules({ month: currentMonthKey() }),
      );
    } catch {
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  async function persistOrder(ordered: Rule[]) {
    setReordering(true);
    setError(null);
    try {
      const updated = await reorderRules(ordered.map((r) => r.id));
      setRules(updated);
      void loadPreview();
    } catch (err) {
      setError(formatErrorMessage(err, "Failed to reorder rules"));
      await load();
    } finally {
      setReordering(false);
    }
  }

  function handleDrop(overId: number) {
    if (dragId === null || dragId === overId) return;
    const next = moveRule(rules, dragId, overId);
    setRules(next);
    setDragId(null);
    setDragOverId(null);
    void persistOrder(next);
  }

  async function handleDelete(id: number) {
    try {
      await deleteRule(id);
      const next = rules.filter((r) => r.id !== id);
      setRules(next);
      if (next.length > 0) {
        await persistOrder(next);
      } else {
        void loadPreview();
      }
    } catch (err) {
      setError(formatErrorMessage(err, "Failed to delete rule"));
    }
  }

  async function handleToggle(rule: Rule) {
    try {
      const updated = await setRuleEnabled(rule.id, !rule.enabled);
      setRules((prev) =>
        prev.map((r) => (r.id === rule.id ? updated : r)),
      );
      void loadPreview();
    } catch (err) {
      setError(formatErrorMessage(err, "Failed to update rule"));
    }
  }

  async function handleApply() {
    setApplying(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await applyRules({ month: currentMonthKey() });
      setSuccess(
        `Applied rules to ${result.updated} uncategorized transaction${
          result.updated === 1 ? "" : "s"
        } this month.`,
      );
      void loadPreview();
    } catch (err) {
      setError(formatErrorMessage(err, "Failed to apply rules"));
    } finally {
      setApplying(false);
    }
  }

  const previewByRule = useMemo(
    () => new Map(preview?.rules.map((r) => [r.rule_id, r.match_count]) ?? []),
    [preview],
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader
        title="Rules"
        description="Auto-categorize by payee or memo keywords"
      >
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            Add rule
          </Button>
          <Button
            onClick={() => void handleApply()}
            disabled={applying || (preview?.would_update ?? 0) === 0}
          >
            {applying ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="h-4 w-4" />
            )}
            Apply this month
            {preview && preview.would_update > 0 && (
              <span className="ml-1 tabular-nums">({preview.would_update})</span>
            )}
          </Button>
        </div>
      </PageHeader>

      <div className="flex-1 overflow-y-auto p-8">
        {error && (
          <ErrorBanner message={error} onDismiss={() => setError(null)} />
        )}
        {success && (
          <div className="mb-4 rounded-lg border border-emerald-900/50 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-400">
            {success}{" "}
            <Link to="/transactions" className="underline hover:text-emerald-300">
              Review transactions →
            </Link>
          </div>
        )}

        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="py-4">
              <p className="text-xs text-zinc-500">Uncategorized (this month)</p>
              <p className="tabular-nums text-2xl font-semibold text-amber-400">
                {previewLoading ? "…" : (preview?.uncategorized_count ?? 0)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <p className="text-xs text-zinc-500">Would match rules</p>
              <p className="tabular-nums text-2xl font-semibold text-emerald-400">
                {previewLoading ? "…" : (preview?.would_update ?? 0)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <p className="text-xs text-zinc-500">Active rules</p>
              <p className="tabular-nums text-2xl font-semibold text-zinc-200">
                {rules.filter((r) => r.enabled).length}
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base text-zinc-200">
              Rules
            </CardTitle>
            <p className="text-xs text-zinc-500">
              Processed top to bottom — first match wins. Drag to reorder.
              {reordering && (
                <span className="ml-2 text-emerald-500">Saving order…</span>
              )}
            </p>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-zinc-500">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">Loading rules…</span>
              </div>
            ) : rules.length === 0 ? (
              <EmptyState
                icon={Wand2}
                title="No rules yet"
                description="Create rules to auto-categorize transactions. Start from a transaction on the Transactions page."
                action={{
                  label: "Go to transactions",
                  to: "/transactions",
                }}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                      <th className="w-10 px-2 py-3" />
                      <th className="px-4 py-3 font-medium">On</th>
                      <th className="px-4 py-3 font-medium">Name</th>
                      <th className="px-4 py-3 font-medium">Match</th>
                      <th className="px-4 py-3 font-medium">Category</th>
                      <th className="px-4 py-3 font-medium">Matches</th>
                      <th className="px-4 py-3 w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {rules.map((rule) => {
                      const isDragging = dragId === rule.id;
                      const isDragOver =
                        dragOverId === rule.id && dragId !== rule.id;

                      return (
                        <tr
                          key={rule.id}
                          onDragOver={(e) => {
                            e.preventDefault();
                            setDragOverId(rule.id);
                          }}
                          onDragLeave={() => {
                            if (dragOverId === rule.id) setDragOverId(null);
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            handleDrop(rule.id);
                          }}
                          className={cn(
                            "border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/20",
                            isDragging && "opacity-40",
                            isDragOver && "bg-emerald-950/30",
                          )}
                        >
                          <td className="px-2 py-2.5">
                            <button
                              type="button"
                              draggable
                              onDragStart={(e) => {
                                setDragId(rule.id);
                                e.dataTransfer.effectAllowed = "move";
                              }}
                              onDragEnd={() => {
                                setDragId(null);
                                setDragOverId(null);
                              }}
                              className="cursor-grab rounded p-1 text-zinc-600 hover:bg-zinc-800 hover:text-zinc-400 active:cursor-grabbing"
                              aria-label={`Drag to reorder ${rule.name}`}
                            >
                              <GripVertical className="h-4 w-4" />
                            </button>
                          </td>
                          <td className="px-4 py-2.5">
                            <input
                              type="checkbox"
                              checked={rule.enabled}
                              onChange={() => void handleToggle(rule)}
                              className="h-4 w-4 rounded border-zinc-600 bg-zinc-900 text-emerald-600"
                              aria-label={
                                rule.enabled ? "Disable rule" : "Enable rule"
                              }
                            />
                          </td>
                          <td
                            className={cn(
                              "px-4 py-2.5 font-medium",
                              rule.enabled ? "text-zinc-200" : "text-zinc-600",
                            )}
                          >
                            {rule.name}
                          </td>
                          <td className="px-4 py-2.5 text-zinc-400">
                            <span className="text-xs text-zinc-600">
                              {rule.match_type}
                            </span>{" "}
                            &ldquo;{rule.match_value}&rdquo;
                          </td>
                          <td className="px-4 py-2.5 text-zinc-300">
                            {categoryMap.get(rule.category_id) ?? "—"}
                          </td>
                          <td className="px-4 py-2.5 tabular-nums text-zinc-400">
                            {previewLoading
                              ? "…"
                              : (previewByRule.get(rule.id) ?? 0)}
                          </td>
                          <td className="px-4 py-2.5">
                            <button
                              type="button"
                              onClick={() => void handleDelete(rule.id)}
                              className="rounded p-1 text-zinc-600 hover:bg-zinc-800 hover:text-red-400"
                              aria-label={`Delete rule ${rule.name}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <CreateRuleDialog
        open={dialogOpen}
        categories={categories}
        onClose={() => setDialogOpen(false)}
        onCreated={() => {
          void load();
          void loadPreview();
          setSuccess("Rule created.");
        }}
      />
    </div>
  );
}