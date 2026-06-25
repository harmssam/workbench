import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronUp, Loader2, X } from "lucide-react";
import { CompactDate } from "./CompactDate";
import { TruncatedText } from "./TruncatedText";
import { getTransactions, type Transaction, type TransactionType } from "../lib/api";
import { formatCents } from "../lib/money";
import { cn, formatErrorMessage, formatMonthLabel } from "../lib/utils";
import { Button } from "./ui/Button";

export interface MonthTransactionsSelection {
  month: string;
  kind: "income" | "expense";
  accountId?: number;
}

type SortColumn = "date" | "payee" | "memo" | "amount";
type SortDirection = "asc" | "desc";

const SORT_DEFAULTS: Record<SortColumn, SortDirection> = {
  date: "desc",
  payee: "asc",
  memo: "asc",
  amount: "desc",
};

function sortTransactions(
  rows: Transaction[],
  column: SortColumn,
  direction: SortDirection,
): Transaction[] {
  const sorted = [...rows];
  const factor = direction === "asc" ? 1 : -1;

  sorted.sort((a, b) => {
    switch (column) {
      case "date":
        return factor * a.date.localeCompare(b.date);
      case "payee":
        return (
          factor *
          (a.payee ?? "").localeCompare(b.payee ?? "", undefined, {
            sensitivity: "base",
          })
        );
      case "memo":
        return (
          factor *
          (a.memo ?? "").localeCompare(b.memo ?? "", undefined, {
            sensitivity: "base",
          })
        );
      case "amount":
        return factor * (a.amount_cents - b.amount_cents);
      default:
        return 0;
    }
  });

  return sorted;
}

export function MonthTransactionsDialog({
  selection,
  onClose,
}: {
  selection: MonthTransactionsSelection;
  onClose: () => void;
}) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortColumn, setSortColumn] = useState<SortColumn>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const transactionType: TransactionType =
    selection.kind === "income" ? "income" : "expense";

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const rows = await getTransactions({
          month: selection.month,
          account_id: selection.accountId,
          transaction_type: transactionType,
          exclude_transfer_categories: true,
        });
        if (!cancelled) setTransactions(rows);
      } catch (e) {
        if (!cancelled) {
          setError(formatErrorMessage(e, "Failed to load transactions"));
          setTransactions([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [selection.month, selection.accountId, transactionType]);

  useEffect(() => {
    setSortColumn("date");
    setSortDirection("desc");
  }, [selection.month, selection.kind]);

  const sortedTransactions = useMemo(
    () => sortTransactions(transactions, sortColumn, sortDirection),
    [transactions, sortColumn, sortDirection],
  );

  const totalCents = useMemo(
    () =>
      transactions.reduce((sum, txn) => {
        if (selection.kind === "expense") {
          return sum + Math.abs(txn.amount_cents);
        }
        return sum + txn.amount_cents;
      }, 0),
    [transactions, selection.kind],
  );

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortColumn(column);
    setSortDirection(SORT_DEFAULTS[column]);
  };

  const title =
    selection.kind === "income"
      ? `Income · ${formatMonthLabel(selection.month)}`
      : `Expenses · ${formatMonthLabel(selection.month)}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/60"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border border-zinc-800 bg-zinc-900 shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-zinc-800 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">{title}</h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              {loading
                ? "Loading transactions…"
                : `${transactions.length} transaction${transactions.length === 1 ? "" : "s"}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {error && (
            <p className="mb-3 rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-400">
              {error}
            </p>
          )}

          {loading && (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-zinc-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          )}

          {!loading && !error && transactions.length === 0 && (
            <p className="py-16 text-center text-sm text-zinc-600">
              No transactions for this month
            </p>
          )}

          {!loading && transactions.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-zinc-500">
                  <SortHeader
                    label="Date"
                    column="date"
                    activeColumn={sortColumn}
                    direction={sortDirection}
                    onSort={handleSort}
                  />
                  <SortHeader
                    label="Payee"
                    column="payee"
                    activeColumn={sortColumn}
                    direction={sortDirection}
                    onSort={handleSort}
                  />
                  <SortHeader
                    label="Memo"
                    column="memo"
                    activeColumn={sortColumn}
                    direction={sortDirection}
                    onSort={handleSort}
                  />
                  <SortHeader
                    label="Amount"
                    column="amount"
                    activeColumn={sortColumn}
                    direction={sortDirection}
                    onSort={handleSort}
                    align="right"
                  />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80">
                {sortedTransactions.map((txn) => (
                  <tr key={txn.id} className="text-zinc-300">
                    <td className="whitespace-nowrap py-2.5 pr-3 text-zinc-400">
                      <CompactDate date={txn.date} />
                    </td>
                    <td className="max-w-[10rem] py-2.5 pr-3">
                      <TruncatedText text={txn.payee} />
                    </td>
                    <td className="max-w-[12rem] py-2.5 pr-3 text-zinc-500">
                      <TruncatedText text={txn.memo} />
                    </td>
                    <td
                      className={cn(
                        "whitespace-nowrap py-2.5 text-right tabular-nums font-medium",
                        txn.amount_cents >= 0
                          ? "text-emerald-400"
                          : "text-red-400",
                      )}
                    >
                      {formatCents(txn.amount_cents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {!loading && transactions.length > 0 && (
          <div className="flex items-center justify-between border-t border-zinc-800 px-5 py-3">
            <span className="text-xs text-zinc-500">Total</span>
            <span
              className={cn(
                "tabular-nums text-base font-semibold",
                selection.kind === "income"
                  ? "text-emerald-400"
                  : "text-red-400",
              )}
            >
              {formatCents(totalCents)}
            </span>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-zinc-800 px-5 py-4">
          <Link to="/transactions">
            <Button variant="outline" size="sm" onClick={onClose}>
              Open transactions
            </Button>
          </Link>
          <Button size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}

function SortHeader({
  label,
  column,
  activeColumn,
  direction,
  onSort,
  align = "left",
}: {
  label: string;
  column: SortColumn;
  activeColumn: SortColumn;
  direction: SortDirection;
  onSort: (column: SortColumn) => void;
  align?: "left" | "right";
}) {
  const active = activeColumn === column;

  return (
    <th
      className={cn(
        "pb-2 pr-3 font-medium select-none",
        align === "right" && "text-right",
      )}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          "inline-flex items-center gap-1 rounded px-1 -mx-1 transition-colors hover:text-zinc-300",
          align === "right" && "w-full justify-end",
          active ? "text-zinc-300" : "text-zinc-500",
        )}
        aria-label={`Sort by ${label}${active ? `, ${direction === "asc" ? "ascending" : "descending"}` : ""}`}
      >
        <span>{label}</span>
        {active ? (
          direction === "asc" ? (
            <ChevronUp className="h-3 w-3 shrink-0" />
          ) : (
            <ChevronDown className="h-3 w-3 shrink-0" />
          )
        ) : (
          <span className="inline-block h-3 w-3 shrink-0" aria-hidden />
        )}
      </button>
    </th>
  );
}