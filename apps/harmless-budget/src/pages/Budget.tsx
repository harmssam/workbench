import { useCallback, useEffect, useState } from "react";
import { PiggyBank } from "lucide-react";
import { EmptyState } from "../components/EmptyState";
import { ErrorBanner } from "../components/ErrorBanner";
import { LoadingState } from "../components/LoadingState";
import { PageHeader } from "../components/PageHeader";
import {
  getBudgetMonth,
  getCategories,
  setBudgetTarget,
  type BudgetCategoryRow,
  type Category,
} from "../lib/api";
import { displayCategoryName, parentNameById } from "../lib/categories";
import { formatCents, parseCurrencyToCents } from "../lib/money";
import { currentMonthKey, formatMonthLabel } from "../lib/utils";
import { Card, CardContent, ProgressBar } from "../components/ui/Card";
import { Input } from "../components/ui/Input";

export function Budget() {
  const [month, setMonth] = useState(currentMonthKey);
  const [categories, setCategories] = useState<BudgetCategoryRow[]>([]);
  const [categoryTree, setCategoryTree] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, tree] = await Promise.all([
        getBudgetMonth(month),
        getCategories(),
      ]);
      setCategories(data.categories);
      setCategoryTree(tree);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load budget");
      setCategories([]);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  function startEdit(row: BudgetCategoryRow) {
    setEditingId(row.category_id);
    setEditValue(
      row.target_cents > 0
        ? (row.target_cents / 100).toFixed(2)
        : "",
    );
  }

  async function saveTarget(categoryId: number) {
    const cents = parseCurrencyToCents(editValue);
    if (cents === null || cents < 0) {
      setError("Enter a valid amount");
      return;
    }
    setError(null);
    try {
      await setBudgetTarget(categoryId, month, cents);
      setEditingId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save target");
    }
  }

  const parentNames = parentNameById(categoryTree);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader
        title="Budget"
        description={`${formatMonthLabel(month)} — leaf category targets`}
      >
        <div className="w-44">
          <Input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            aria-label="Select month"
          />
        </div>
      </PageHeader>

      <div className="flex-1 overflow-y-auto p-8">
        {error && (
          <ErrorBanner message={error} onDismiss={() => setError(null)} />
        )}

        {loading ? (
          <LoadingState label="Loading budget…" />
        ) : categories.length === 0 ? (
          <Card>
            <EmptyState
              icon={PiggyBank}
              title="No budget categories"
              description="Expense categories are created automatically on first launch. Restart the app if this looks wrong."
            />
          </Card>
        ) : (
          <div className="space-y-3">
            {categories.map((row) => {
              const spent = Math.abs(row.actual_cents);
              const target = row.target_cents;
              const isEditing = editingId === row.category_id;
              const overBudget = spent > target && target > 0;

              return (
                <Card key={row.category_id}>
                  <CardContent className="py-4">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-zinc-200">
                          {displayCategoryName(
                            row.category_name,
                            row.parent_id,
                            parentNames,
                          )}
                        </p>
                        <div className="mt-2 flex items-center gap-3 text-xs text-zinc-500">
                          <span>
                            Spent{" "}
                            <span className="tabular-nums text-zinc-300">
                              {formatCents(spent)}
                            </span>
                          </span>
                          <span>·</span>
                          <span>
                            Remaining{" "}
                            <span
                              className={`tabular-nums ${
                                row.remaining_cents < 0
                                  ? "text-red-400"
                                  : "text-emerald-400"
                              }`}
                            >
                              {formatCents(row.remaining_cents)}
                            </span>
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {isEditing ? (
                          <>
                            <Input
                              type="text"
                              inputMode="decimal"
                              placeholder="0.00"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="w-28 tabular-nums"
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  void saveTarget(row.category_id);
                                }
                                if (e.key === "Escape") {
                                  setEditingId(null);
                                }
                              }}
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={() => void saveTarget(row.category_id)}
                              className="text-xs text-emerald-400 hover:text-emerald-300"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="text-xs text-zinc-500 hover:text-zinc-400"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => startEdit(row)}
                            className="tabular-nums text-sm text-zinc-400 hover:text-zinc-200"
                          >
                            Target:{" "}
                            {target > 0 ? formatCents(target) : "Set target"}
                          </button>
                        )}
                      </div>
                    </div>

                    {target > 0 && (
                      <div className="mt-3">
                        <ProgressBar
                          value={spent}
                          max={target}
                          variant={overBudget ? "over" : "default"}
                        />
                        <p className="mt-1 text-right text-[10px] tabular-nums text-zinc-600">
                          {Math.round((spent / target) * 100)}% of target
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}