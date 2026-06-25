import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useResizableWidth } from "../hooks/useResizableWidth";
import { Link } from "react-router-dom";
import {
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List,
  Loader2,
  Plus,
  Receipt,
  Square,
  Wand2,
} from "lucide-react";
import { TransactionsSortView } from "../components/TransactionsSortView";
import { CategorySelect } from "../components/CategorySelect";
import { CreateRuleDialog } from "../components/CreateRuleDialog";
import { EmptyState } from "../components/EmptyState";
import { ErrorBanner } from "../components/ErrorBanner";
import { PageHeader } from "../components/PageHeader";
import {
  applyRules,
  bulkUpdateTransactionCategories,
  getAccounts,
  getCategories,
  getTransactions,
  previewApplyRules,
  updateTransactionCategory,
  type Account,
  type Category,
  type PreviewApplyResult,
  type Transaction,
} from "../lib/api";
import {
  categoryOptionGroups,
  categoryOptionsForType,
  suggestRuleMatchValue,
  suggestRuleName,
} from "../lib/categories";
import { formatCents } from "../lib/money";
import { cn, currentMonthKey, formatErrorMessage } from "../lib/utils";
import { CompactDate } from "../components/CompactDate";
import { TruncatedText } from "../components/TruncatedText";
import { Button } from "../components/ui/Button";
import { Card, CardContent } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";

function payeeKey(txn: Transaction): string {
  return txn.payee?.trim() || txn.memo?.trim() || "(no description)";
}

function matchesSearch(txn: Transaction, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    (txn.payee?.toLowerCase().includes(q) ?? false) ||
    (txn.memo?.toLowerCase().includes(q) ?? false)
  );
}

type TransactionsViewMode = "table" | "sort";

export function Transactions() {
  const [month, setMonth] = useState(currentMonthKey);
  const [accountId, setAccountId] = useState("");
  const [uncategorizedOnly, setUncategorizedOnly] = useState(true);
  const [search, setSearch] = useState("");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkCategoryId, setBulkCategoryId] = useState("");
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [applyingRules, setApplyingRules] = useState(false);
  const [rulePreview, setRulePreview] = useState<PreviewApplyResult | null>(
    null,
  );
  const [previewLoading, setPreviewLoading] = useState(false);
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [ruleDefaults, setRuleDefaults] = useState<{
    name?: string;
    matchValue?: string;
    categoryId?: string;
  }>();
  const [ruleSavePrompt, setRuleSavePrompt] = useState<{
    matchValue: string;
    categoryId: string;
    categoryName: string;
  } | null>(null);
  const [saveBulkAsRule, setSaveBulkAsRule] = useState(true);
  const [payeePanelOpen, setPayeePanelOpen] = useState(() => {
    try {
      return localStorage.getItem("txn-payee-panel") !== "false";
    } catch {
      return true;
    }
  });
  const [viewMode, setViewMode] = useState<TransactionsViewMode>(() => {
    try {
      return localStorage.getItem("txn-view-mode") === "sort" ? "sort" : "table";
    } catch {
      return "table";
    }
  });

  function setViewModeAndPersist(mode: TransactionsViewMode) {
    setViewMode(mode);
    try {
      localStorage.setItem("txn-view-mode", mode);
    } catch {
      // ignore
    }
    if (mode === "sort") {
      setUncategorizedOnly(true);
      setSearch("");
      setSelectedIds(new Set());
    }
  }

  function togglePayeePanel() {
    setPayeePanelOpen((open) => {
      const next = !open;
      try {
        localStorage.setItem("txn-payee-panel", String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const {
    width: payeePanelWidth,
    dragging: resizingPayeePanel,
    onResizeStart: onPayeePanelResizeStart,
  } = useResizableWidth({
    storageKey: "txn-payee-panel-width",
    defaultWidth: 224,
    minWidth: 160,
    maxWidth: 420,
  });

  const categoryOptions = useMemo(
    () => categoryOptionsForType(categories),
    [categories],
  );

  const categoryGroups = useMemo(
    () => categoryOptionGroups(categories, { leavesOnly: true }),
    [categories],
  );

  const categoryNameById = useMemo(
    () => new Map(categoryOptions.map((o) => [o.value, o.label])),
    [categoryOptions],
  );

  const bulkRuleCandidate = useMemo(() => {
    const selected = transactions.filter((t) => selectedIds.has(t.id));
    if (selected.length === 0) return null;
    const keys = new Set(selected.map(payeeKey));
    if (keys.size !== 1) return null;
    const key = [...keys][0];
    if (key === "(no description)") return null;
    return { matchValue: key };
  }, [transactions, selectedIds]);

  const accountMap = useMemo(
    () => new Map(accounts.map((a) => [a.id, a.name])),
    [accounts],
  );

  const ruleFilters = useMemo(
    () => ({
      month,
      account_id: accountId ? Number(accountId) : undefined,
    }),
    [month, accountId],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [txns, accts, cats] = await Promise.all([
        getTransactions({
          month,
          account_id: accountId ? Number(accountId) : undefined,
          uncategorized_only: uncategorizedOnly || undefined,
        }),
        getAccounts(),
        getCategories(),
      ]);
      setTransactions(txns);
      setAccounts(accts);
      setCategories(cats);
      setSelectedIds(new Set());
    } catch (e) {
      setError(formatErrorMessage(e, "Failed to load transactions"));
    } finally {
      setLoading(false);
    }
  }, [month, accountId, uncategorizedOnly]);

  const loadPreview = useCallback(async () => {
    setPreviewLoading(true);
    try {
      setRulePreview(await previewApplyRules(ruleFilters));
    } catch {
      setRulePreview(null);
    } finally {
      setPreviewLoading(false);
    }
  }, [ruleFilters]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  const visibleTransactions = useMemo(
    () => transactions.filter((t) => matchesSearch(t, search.trim())),
    [transactions, search],
  );

  const sortInboxTransactions = useMemo(
    () => transactions.filter((t) => !t.category_id),
    [transactions],
  );

  const uncategorizedCount = useMemo(
    () => transactions.filter((t) => !t.category_id).length,
    [transactions],
  );

  const payeeGroups = useMemo(() => {
    const map = new Map<string, number>();
    for (const txn of transactions.filter((t) => !t.category_id)) {
      const key = payeeKey(txn);
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 25);
  }, [transactions]);

  const allVisibleSelected =
    visibleTransactions.length > 0 &&
    visibleTransactions.every((t) => selectedIds.has(t.id));

  function toggleSelectAll() {
    if (allVisibleSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visibleTransactions.map((t) => t.id)));
    }
  }

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectByPayee(payee: string) {
    const ids = transactions
      .filter((t) => !t.category_id && payeeKey(t) === payee)
      .map((t) => t.id);
    setSelectedIds(new Set(ids));
    setSearch(payee === "(no description)" ? "" : payee);
  }

  function openRuleDialogFromChoice(
    matchValue: string,
    categoryId: string,
    payee?: string | null,
    memo?: string | null,
  ) {
    if (!matchValue.trim()) return;
    setRuleDefaults({
      name: suggestRuleName(payee ?? matchValue, memo),
      matchValue: matchValue.trim(),
      categoryId,
    });
    setRuleDialogOpen(true);
    setRuleSavePrompt(null);
  }

  async function handleCategoryChange(txnId: number, categoryId: string) {
    const txn = transactions.find((t) => t.id === txnId);
    setUpdatingId(txnId);
    try {
      const updated = await updateTransactionCategory(
        txnId,
        categoryId ? Number(categoryId) : null,
      );
      setTransactions((prev) =>
        prev.map((t) => (t.id === txnId ? updated : t)),
      );
      if (uncategorizedOnly && updated.category_id) {
        setTransactions((prev) => prev.filter((t) => t.id !== txnId));
      }
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(txnId);
        return next;
      });
      void loadPreview();

      if (categoryId && txn) {
        const matchValue = suggestRuleMatchValue(txn.payee, txn.memo);
        const categoryName = categoryNameById.get(categoryId);
        if (matchValue && categoryName) {
          setRuleSavePrompt({
            matchValue,
            categoryId,
            categoryName,
          });
        }
      } else {
        setRuleSavePrompt(null);
      }
    } catch (e) {
      setError(formatErrorMessage(e, "Failed to update category"));
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleBulkCategory() {
    if (selectedIds.size === 0 || !bulkCategoryId) return;
    setBulkUpdating(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await bulkUpdateTransactionCategories(
        [...selectedIds],
        Number(bulkCategoryId),
      );
      setSuccess(`Categorized ${result.updated} transactions.`);
      setSelectedIds(new Set());

      if (
        saveBulkAsRule &&
        bulkRuleCandidate &&
        bulkCategoryId
      ) {
        openRuleDialogFromChoice(
          bulkRuleCandidate.matchValue,
          bulkCategoryId,
          bulkRuleCandidate.matchValue,
          null,
        );
      }

      await load();
    } catch (e) {
      setError(formatErrorMessage(e, "Failed to bulk categorize"));
    } finally {
      setBulkUpdating(false);
    }
  }

  async function handleApplyRules() {
    setApplyingRules(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await applyRules(ruleFilters);
      setSuccess(
        `Rules applied to ${result.updated} transaction${
          result.updated === 1 ? "" : "s"
        }.`,
      );
      await load();
    } catch (e) {
      setError(formatErrorMessage(e, "Failed to apply rules"));
    } finally {
      setApplyingRules(false);
    }
  }

  function openRuleDialog(txn: Transaction, categoryId?: string) {
    openRuleDialogFromChoice(
      suggestRuleMatchValue(txn.payee, txn.memo),
      categoryId ?? "",
      txn.payee,
      txn.memo,
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader
        title="Transactions"
        description={
          viewMode === "sort"
            ? "Drag transactions into category bins"
            : "Categorize spending before analytics"
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex rounded-lg border border-zinc-700 p-0.5"
            role="group"
            aria-label="Transaction view"
          >
            <button
              type="button"
              onClick={() => setViewModeAndPersist("table")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                viewMode === "table"
                  ? "bg-zinc-800 text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300",
              )}
            >
              <List className="h-3.5 w-3.5" />
              Table
            </button>
            <button
              type="button"
              onClick={() => setViewModeAndPersist("sort")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                viewMode === "sort"
                  ? "bg-zinc-800 text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300",
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Sort bins
            </button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleApplyRules()}
            disabled={applyingRules || (rulePreview?.would_update ?? 0) === 0}
          >
            {applyingRules ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="h-4 w-4" />
            )}
            Apply rules
            {rulePreview && rulePreview.would_update > 0 && (
              <span className="ml-1 tabular-nums text-emerald-400">
                ({rulePreview.would_update})
              </span>
            )}
          </Button>
          <Link to="/rules">
            <Button variant="outline" size="sm">
              Manage rules
            </Button>
          </Link>
          <Link to="/import">
            <Button variant="outline" size="sm">
              Import
            </Button>
          </Link>
        </div>
      </PageHeader>

      <div className="flex flex-1 overflow-hidden">
        {viewMode === "table" && payeePanelOpen && (
          <div
            className="relative hidden shrink-0 lg:block"
            style={{ width: payeePanelWidth }}
          >
            <aside className="flex h-full flex-col border-r border-zinc-800 bg-zinc-900/50">
              <div className="flex items-start justify-between gap-2 border-b border-zinc-800 px-3 py-3">
                <div className="min-w-0">
                  <h2 className="text-sm font-medium text-zinc-300">
                    Uncategorized payees
                  </h2>
                  <p className="mt-0.5 text-xs text-zinc-600">
                    Click to select all matching
                  </p>
                </div>
                <button
                  type="button"
                  onClick={togglePayeePanel}
                  className="shrink-0 rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                  aria-label="Hide payee list"
                  title="Hide payee list"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                {payeeGroups.length === 0 ? (
                  <p className="px-2 py-6 text-center text-xs text-zinc-600">
                    All caught up
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {payeeGroups.map(([payee, count]) => (
                      <li key={payee}>
                        <button
                          type="button"
                          onClick={() => selectByPayee(payee)}
                          className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs hover:bg-zinc-800/80"
                        >
                          <span className="truncate text-zinc-300">{payee}</span>
                          <span className="ml-2 shrink-0 tabular-nums text-zinc-500">
                            {count}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </aside>
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize payee list"
              onMouseDown={onPayeePanelResizeStart}
              className={cn(
                "absolute -right-1 top-0 z-10 h-full w-2 cursor-col-resize touch-none",
                resizingPayeePanel
                  ? "bg-emerald-500/35"
                  : "hover:bg-emerald-500/15",
              )}
            />
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="shrink-0 space-y-4 border-b border-zinc-800/50 px-4 py-4 lg:px-6">
            <div className="flex flex-wrap items-end gap-4">
              {viewMode === "table" && !payeePanelOpen && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={togglePayeePanel}
                  className="hidden lg:inline-flex"
                  title="Show payee list"
                >
                  <ChevronRight className="h-4 w-4" />
                  Payees
                </Button>
              )}
              <div className="w-40">
                <Input
                  type="month"
                  label="Month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                />
              </div>
              <div className="w-48">
                <Select
                  label="Account"
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  options={[
                    { value: "", label: "All accounts" },
                    ...accounts.map((a) => ({
                      value: String(a.id),
                      label: a.name,
                    })),
                  ]}
                />
              </div>
              {viewMode === "table" && (
                <div className="w-52">
                  <Input
                    label="Search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Payee or memo…"
                  />
                </div>
              )}
              <label className="flex items-center gap-2 pb-1 text-sm text-zinc-400">
                <input
                  type="checkbox"
                  checked={uncategorizedOnly}
                  onChange={(e) => setUncategorizedOnly(e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-600 bg-zinc-900 text-emerald-600"
                />
                Uncategorized only
              </label>
            </div>

            {uncategorizedCount > 0 && (
              <p className="text-sm text-amber-400/90">
                {uncategorizedCount} uncategorized in this view
                {previewLoading
                  ? " · checking rules…"
                  : rulePreview && rulePreview.would_update > 0
                    ? ` · ${rulePreview.would_update} match existing rules`
                    : ""}
              </p>
            )}

            {viewMode === "table" && selectedIds.size > 0 && (
              <div className="flex flex-wrap items-end gap-3 rounded-lg border border-emerald-900/40 bg-emerald-950/20 px-4 py-3">
                <p className="text-sm text-emerald-400">
                  {selectedIds.size} selected
                </p>
                <div className="w-48">
                  <Select
                    label="Category"
                    value={bulkCategoryId}
                    onChange={(e) => setBulkCategoryId(e.target.value)}
                    placeholder="Choose category…"
                    options={categoryOptions}
                  />
                </div>
                <Button
                  size="sm"
                  disabled={!bulkCategoryId || bulkUpdating}
                  onClick={() => void handleBulkCategory()}
                >
                  {bulkUpdating && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  Apply to selected
                </Button>
                {bulkRuleCandidate && (
                  <label className="flex items-center gap-2 pb-0.5 text-sm text-zinc-400">
                    <input
                      type="checkbox"
                      checked={saveBulkAsRule}
                      onChange={(e) => setSaveBulkAsRule(e.target.checked)}
                      className="h-4 w-4 rounded border-zinc-600 bg-zinc-900 text-emerald-600"
                    />
                    Save as rule for &ldquo;{bulkRuleCandidate.matchValue}&rdquo;
                  </label>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSelectedIds(new Set())}
                >
                  Clear
                </Button>
              </div>
            )}
          </div>

          <div
            ref={scrollContainerRef}
            className="flex-1 overflow-y-auto px-4 py-6 lg:px-6"
          >
            {error && (
              <ErrorBanner message={error} onDismiss={() => setError(null)} />
            )}
            {ruleSavePrompt && (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-900/40 bg-emerald-950/20 px-4 py-3">
                <p className="text-sm text-zinc-300">
                  Remember this? Future transactions matching{" "}
                  <span className="font-medium text-emerald-400">
                    &ldquo;{ruleSavePrompt.matchValue}&rdquo;
                  </span>{" "}
                  → {ruleSavePrompt.categoryName}
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() =>
                      openRuleDialogFromChoice(
                        ruleSavePrompt.matchValue,
                        ruleSavePrompt.categoryId,
                      )
                    }
                  >
                    Save as rule
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setRuleSavePrompt(null)}
                  >
                    Not now
                  </Button>
                </div>
              </div>
            )}
            {success && (
              <div className="mb-4 rounded-lg border border-emerald-900/50 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-400">
                {success}
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-zinc-500">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">Loading transactions…</span>
              </div>
            ) : viewMode === "sort" ? (
              <TransactionsSortView
                sessionKey={`${month}-${accountId}-${uncategorizedOnly}`}
                inbox={sortInboxTransactions}
                categoryGroups={categoryGroups}
                updatingId={updatingId}
                scrollContainerRef={scrollContainerRef}
                onCategorize={(txnId, categoryId) =>
                  void handleCategoryChange(txnId, categoryId)
                }
              />
            ) : (
            <Card>
              <CardContent className="p-0">
                {visibleTransactions.length === 0 ? (
                  <EmptyState
                    icon={Receipt}
                    title="No transactions found"
                    description={
                      uncategorizedOnly
                        ? "Nothing left to categorize in this view — nice work."
                        : "Import a CSV or adjust filters above."
                    }
                    action={
                      uncategorizedOnly
                        ? undefined
                        : { label: "Import CSV", to: "/import" }
                    }
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full table-fixed text-sm">
                      <colgroup>
                        <col style={{ width: "2.25rem" }} />
                        <col style={{ width: "4.25rem" }} />
                        <col style={{ width: "7rem" }} />
                        <col style={{ width: "48%" }} />
                        <col style={{ width: "5.5rem" }} />
                        <col style={{ width: "5.25rem" }} />
                        <col style={{ width: "9.5rem" }} />
                        <col style={{ width: "2.25rem" }} />
                      </colgroup>
                      <thead>
                        <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                          <th className="px-2 py-3">
                            <button
                              type="button"
                              onClick={toggleSelectAll}
                              className="text-zinc-500 hover:text-zinc-300"
                              aria-label={
                                allVisibleSelected
                                  ? "Deselect all"
                                  : "Select all"
                              }
                            >
                              {allVisibleSelected ? (
                                <CheckSquare className="h-4 w-4" />
                              ) : (
                                <Square className="h-4 w-4" />
                              )}
                            </button>
                          </th>
                          <th className="px-2 py-3 font-medium">Date</th>
                          <th className="overflow-hidden px-2 py-3 font-medium">
                            Payee
                          </th>
                          <th className="overflow-hidden px-2 py-3 font-medium">
                            Memo
                          </th>
                          <th className="overflow-hidden px-2 py-3 font-medium">
                            Acct
                          </th>
                          <th className="px-2 py-3 text-right font-medium">
                            Amt
                          </th>
                          <th className="px-2 py-3 font-medium">Category</th>
                          <th className="px-2 py-3" />
                        </tr>
                      </thead>
                      <tbody>
                        {visibleTransactions.map((txn) => {
                          const selected = selectedIds.has(txn.id);
                          return (
                            <tr
                              key={txn.id}
                              className={cn(
                                "border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/20",
                                selected && "bg-emerald-950/20",
                              )}
                            >
                              <td className="px-2 py-2">
                                <button
                                  type="button"
                                  onClick={() => toggleSelect(txn.id)}
                                  className="text-zinc-500 hover:text-zinc-300"
                                  aria-label={
                                    selected ? "Deselect" : "Select"
                                  }
                                >
                                  {selected ? (
                                    <CheckSquare className="h-4 w-4 text-emerald-500" />
                                  ) : (
                                    <Square className="h-4 w-4" />
                                  )}
                                </button>
                              </td>
                              <td className="whitespace-nowrap px-2 py-2 text-zinc-400">
                                <CompactDate date={txn.date} />
                              </td>
                              <td className="overflow-hidden px-2 py-2 text-zinc-200">
                                <TruncatedText text={txn.payee} />
                              </td>
                              <td className="overflow-hidden px-2 py-2 text-zinc-500">
                                <TruncatedText text={txn.memo} />
                              </td>
                              <td className="overflow-hidden px-2 py-2 text-zinc-400">
                                <TruncatedText
                                  text={accountMap.get(txn.account_id)}
                                />
                              </td>
                              <td
                                className={cn(
                                  "whitespace-nowrap px-2 py-2 text-right tabular-nums font-medium",
                                  txn.amount_cents >= 0
                                    ? "text-emerald-400"
                                    : "text-red-400",
                                )}
                              >
                                {formatCents(txn.amount_cents)}
                              </td>
                              <td className="overflow-hidden px-2 py-2">
                                <CategorySelect
                                  categories={categories}
                                  value={
                                    txn.category_id
                                      ? String(txn.category_id)
                                      : ""
                                  }
                                  disabled={updatingId === txn.id}
                                  placeholder="Uncategorized"
                                  className="h-8 min-w-0 text-xs"
                                  onChange={(value) =>
                                    void handleCategoryChange(txn.id, value)
                                  }
                                />
                              </td>
                              <td className="px-2 py-2">
                                <button
                                  type="button"
                                  onClick={() => openRuleDialog(txn)}
                                  className="rounded p-1 text-zinc-600 hover:bg-zinc-800 hover:text-emerald-400"
                                  title="Create rule from this"
                                  aria-label="Create rule"
                                >
                                  <Plus className="h-3.5 w-3.5" />
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
            )}
          </div>
        </div>
      </div>

      <CreateRuleDialog
        open={ruleDialogOpen}
        categories={categories}
        defaults={ruleDefaults}
        onClose={() => setRuleDialogOpen(false)}
        onCreated={() => {
          setRuleSavePrompt(null);
          setSuccess(
            "Rule saved. Click Apply rules to categorize other matches.",
          );
          void loadPreview();
        }}
      />
    </div>
  );
}