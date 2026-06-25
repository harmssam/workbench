import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { PiggyBank } from "lucide-react";
import { EmptyState } from "../components/EmptyState";
import { ErrorBanner } from "../components/ErrorBanner";
import { LoadingState } from "../components/LoadingState";
import { PageHeader } from "../components/PageHeader";
import {
  getBudgetMonth,
  getCategories,
  setBudgetMonthIncome,
  setBudgetTarget,
  type BudgetCategoryRow,
  type BudgetMonth,
  type Category,
} from "../lib/api";
import { formatCents, parseCurrencyToCents } from "../lib/money";
import { cn, currentMonthKey, formatMonthLabel } from "../lib/utils";
import { Card, CardContent, ProgressBar } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { MonthPicker } from "../components/ui/MonthPicker";

interface BudgetGroup {
  parentId: number | null;
  parentName: string;
  sortOrder: number;
  rows: BudgetCategoryRow[];
  groupBudgeted: number;
  groupSpent: number;
}

function groupBudgetCategories(
  rows: BudgetCategoryRow[],
  tree: Category[],
): BudgetGroup[] {
  const parentMeta = new Map<number, { name: string; sortOrder: number }>();
  for (const root of tree) {
    if (root.archived_at) continue;
    if (root.cat_type !== "expense") continue;
    parentMeta.set(root.id, { name: root.name, sortOrder: root.sort_order });
  }

  const groups = new Map<number | null, BudgetCategoryRow[]>();
  for (const row of rows) {
    const key = row.parent_id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  return [...groups.entries()]
    .map(([parentId, groupRows]) => {
      const meta = parentId ? parentMeta.get(parentId) : null;
      const standalone = parentId === null;
      return {
        parentId,
        parentName: meta?.name ?? groupRows[0]?.category_name ?? "Other",
        sortOrder: meta?.sortOrder ?? (standalone ? -1 : 999),
        rows: groupRows,
        groupBudgeted: groupRows.reduce((sum, row) => sum + row.target_cents, 0),
        groupSpent: groupRows.reduce(
          (sum, row) => sum + Math.abs(row.actual_cents),
          0,
        ),
      };
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

type EditField = "income" | number;

export function Budget() {
  const [month, setMonth] = useState(currentMonthKey);
  const [budget, setBudget] = useState<BudgetMonth | null>(null);
  const [categoryTree, setCategoryTree] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditField | null>(null);
  const [editValue, setEditValue] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, tree] = await Promise.all([
        getBudgetMonth(month),
        getCategories(),
      ]);
      setBudget(data);
      setCategoryTree(tree);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load budget");
      setBudget(null);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  const groups = useMemo(
    () => groupBudgetCategories(budget?.categories ?? [], categoryTree),
    [budget, categoryTree],
  );

  function startEdit(field: EditField, currentCents: number) {
    setEditing(field);
    setEditValue(currentCents > 0 ? (currentCents / 100).toFixed(2) : "");
  }

  async function saveIncome() {
    const cents = parseCurrencyToCents(editValue);
    if (cents === null || cents < 0) {
      setError("Enter a valid income amount");
      return;
    }
    setError(null);
    try {
      await setBudgetMonthIncome(month, cents);
      setEditing(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save income");
    }
  }

  async function saveCategoryTarget(categoryId: number) {
    const cents = parseCurrencyToCents(editValue);
    if (cents === null || cents < 0) {
      setError("Enter a valid amount");
      return;
    }
    setError(null);
    try {
      await setBudgetTarget(categoryId, month, cents);
      setEditing(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save budget");
    }
  }

  async function useActualIncome() {
    if (!budget || budget.actual_income_cents <= 0) return;
    setError(null);
    try {
      await setBudgetMonthIncome(month, budget.actual_income_cents);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to set income");
    }
  }

  const toBudget = budget?.to_budget_cents ?? 0;
  const incomeSet = (budget?.income_cents ?? 0) > 0;
  const fullyAllocated = incomeSet && toBudget === 0;
  const overAllocated = incomeSet && toBudget < 0;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader
        title="Budget"
        description={`${formatMonthLabel(month)} — give every dollar a job`}
      >
        <MonthPicker
          value={month}
          onChange={setMonth}
          label="Month"
          id="budget-month"
        />
      </PageHeader>

      <div className="flex-1 overflow-y-auto p-8">
        {error && (
          <ErrorBanner message={error} onDismiss={() => setError(null)} />
        )}

        {loading ? (
          <LoadingState label="Loading budget…" />
        ) : !budget || budget.categories.length === 0 ? (
          <Card>
            <EmptyState
              icon={PiggyBank}
              title="No budget categories"
              description="Expense categories are created automatically on first launch."
            />
          </Card>
        ) : (
          <div className="mx-auto max-w-4xl space-y-6">
            <Card className="overflow-hidden border-emerald-900/30">
              <CardContent className="p-0">
                <div className="grid divide-y divide-zinc-800 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                  <SummaryCell
                    label="Income"
                    hint={
                      budget.actual_income_cents > 0 &&
                      budget.income_cents !== budget.actual_income_cents
                        ? `Actual: ${formatCents(budget.actual_income_cents)}`
                        : "Money available to budget"
                    }
                    valueCents={budget.income_cents}
                    valueColor="text-emerald-400"
                    isEditing={editing === "income"}
                    editValue={editValue}
                    onEditValueChange={setEditValue}
                    onStartEdit={() => startEdit("income", budget.income_cents)}
                    onSave={() => void saveIncome()}
                    onCancel={() => setEditing(null)}
                    action={
                      budget.actual_income_cents > 0 &&
                      budget.income_cents !== budget.actual_income_cents ? (
                        <button
                          type="button"
                          onClick={() => void useActualIncome()}
                          className="text-[11px] text-emerald-500/90 hover:text-emerald-400"
                        >
                          Use actual income
                        </button>
                      ) : undefined
                    }
                  />
                  <SummaryCell
                    label="Budgeted"
                    hint="Allocated across categories"
                    valueCents={budget.allocated_cents}
                    valueColor="text-zinc-200"
                  />
                  <SummaryCell
                    label="Left to budget"
                    hint={
                      fullyAllocated
                        ? "Every dollar has a job"
                        : overAllocated
                          ? "Over-allocated — reduce category budgets"
                          : incomeSet
                            ? "Assign the rest to categories"
                            : "Set income to start budgeting"
                    }
                    valueCents={toBudget}
                    valueColor={cn(
                      !incomeSet && "text-zinc-500",
                      fullyAllocated && "text-emerald-400",
                      incomeSet && toBudget > 0 && "text-amber-400",
                      overAllocated && "text-red-400",
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            <div className="overflow-hidden rounded-xl border border-zinc-800">
              <div className="grid grid-cols-[minmax(0,1fr)_6.5rem_6.5rem_6.5rem] gap-3 border-b border-zinc-800 bg-zinc-900/80 px-4 py-2.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                <span>Category</span>
                <span className="text-right">Budgeted</span>
                <span className="text-right">Spent</span>
                <span className="text-right">Available</span>
              </div>

              <div className="divide-y divide-zinc-800/80">
                {groups.map((group) => (
                  <section key={group.parentId ?? `standalone-${group.parentName}`}>
                    <div className="flex items-center justify-between bg-zinc-900/40 px-4 py-2.5">
                      <h3 className="text-sm font-semibold text-zinc-200">
                        {group.parentName}
                      </h3>
                      <div className="flex gap-4 text-xs tabular-nums text-zinc-500">
                        <span>{formatCents(group.groupBudgeted)}</span>
                        <span className="w-16 text-right">
                          {formatCents(group.groupSpent)}
                        </span>
                      </div>
                    </div>

                    <ul>
                      {group.rows.map((row) => {
                        const spent = Math.abs(row.actual_cents);
                        const isEditing = editing === row.category_id;
                        const overBudget =
                          row.target_cents > 0 && spent > row.target_cents;

                        return (
                          <li
                            key={row.category_id}
                            className="border-t border-zinc-800/50 px-4 py-3"
                          >
                            <div className="grid grid-cols-[minmax(0,1fr)_6.5rem_6.5rem_6.5rem] items-center gap-3">
                              <div className="min-w-0">
                                {group.parentId && (
                                  <p className="truncate text-sm text-zinc-300">
                                    {row.category_name}
                                  </p>
                                )}
                                {row.target_cents > 0 && (
                                  <div className="mt-2 pr-4">
                                    <ProgressBar
                                      value={spent}
                                      max={row.target_cents}
                                      variant={overBudget ? "over" : "default"}
                                    />
                                  </div>
                                )}
                              </div>

                              <div className="text-right">
                                {isEditing ? (
                                  <AmountEditor
                                    value={editValue}
                                    onChange={setEditValue}
                                    onSave={() =>
                                      void saveCategoryTarget(row.category_id)
                                    }
                                    onCancel={() => setEditing(null)}
                                  />
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      startEdit(row.category_id, row.target_cents)
                                    }
                                    className="tabular-nums text-sm text-zinc-300 hover:text-zinc-100"
                                  >
                                    {row.target_cents > 0
                                      ? formatCents(row.target_cents)
                                      : "—"}
                                  </button>
                                )}
                              </div>

                              <p className="text-right text-sm tabular-nums text-zinc-400">
                                {spent > 0 ? formatCents(spent) : "—"}
                              </p>

                              <p
                                className={cn(
                                  "text-right text-sm tabular-nums font-medium",
                                  row.remaining_cents < 0
                                    ? "text-red-400"
                                    : row.target_cents > 0
                                      ? "text-emerald-400"
                                      : "text-zinc-600",
                                )}
                              >
                                {row.target_cents > 0
                                  ? formatCents(row.remaining_cents)
                                  : "—"}
                              </p>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
              </div>
            </div>

            <p className="text-center text-xs text-zinc-600">
              Spent {formatCents(budget.total_spent_cents)} this month across
              all categories
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCell({
  label,
  hint,
  valueCents,
  valueColor,
  isEditing,
  editValue,
  onEditValueChange,
  onStartEdit,
  onSave,
  onCancel,
  action,
}: {
  label: string;
  hint: string;
  valueCents: number;
  valueColor: string;
  isEditing?: boolean;
  editValue?: string;
  onEditValueChange?: (value: string) => void;
  onStartEdit?: () => void;
  onSave?: () => void;
  onCancel?: () => void;
  action?: ReactNode;
}) {
  return (
    <div className="px-5 py-4">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      {isEditing ? (
        <div className="mt-2 space-y-2">
          <Input
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={editValue ?? ""}
            onChange={(e) => onEditValueChange?.(e.target.value)}
            className="tabular-nums"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") onSave?.();
              if (e.key === "Escape") onCancel?.();
            }}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onSave}
              className="text-xs text-emerald-400 hover:text-emerald-300"
            >
              Save
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="text-xs text-zinc-500 hover:text-zinc-400"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={onStartEdit}
          disabled={!onStartEdit}
          className={cn(
            "mt-1 block text-left",
            onStartEdit && "hover:opacity-90",
            !onStartEdit && "cursor-default",
          )}
        >
          <p className={cn("tabular-nums text-2xl font-semibold", valueColor)}>
            {label === "Income" && valueCents <= 0
              ? "Set income"
              : label === "Left to budget"
                ? formatCents(valueCents)
                : formatCents(Math.abs(valueCents))}
          </p>
        </button>
      )}
      <p className="mt-1 text-xs text-zinc-600">{hint}</p>
      {action && <div className="mt-1.5">{action}</div>}
    </div>
  );
}

function AmountEditor({
  value,
  onChange,
  onSave,
  onCancel,
}: {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-1">
      <Input
        type="text"
        inputMode="decimal"
        placeholder="0.00"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full tabular-nums text-right text-sm"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter") onSave();
          if (e.key === "Escape") onCancel();
        }}
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onSave}
          className="text-[10px] text-emerald-400"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-[10px] text-zinc-500"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}