import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3, TrendingDown, TrendingUp } from "lucide-react";
import { EmptyState } from "../components/EmptyState";
import { ErrorBanner } from "../components/ErrorBanner";
import { LoadingState } from "../components/LoadingState";
import {
  MonthTransactionsDialog,
  type MonthTransactionsSelection,
} from "../components/MonthTransactionsDialog";
import { PageHeader } from "../components/PageHeader";
import {
  getAccounts,
  getCategoryBreakdown,
  getSpendingTrends,
  getTopPayees,
  type Account,
  type CategoryBreakdown,
  type CategoryBreakdownItem,
  type SpendingTrends,
  type TopPayees,
} from "../lib/api";
import { formatCents } from "../lib/money";
import { cn, currentMonthKey, formatErrorMessage, formatMonthLabel } from "../lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { MonthPicker } from "../components/ui/MonthPicker";
import { Select } from "../components/ui/Select";

const SLICE_COLORS = [
  "#34d399",
  "#2dd4bf",
  "#38bdf8",
  "#a78bfa",
  "#f472b6",
  "#fb923c",
  "#facc15",
  "#94a3b8",
];

const TREND_MONTH_OPTIONS = [
  { value: "6", label: "Last 6 months" },
  { value: "12", label: "Last 12 months" },
];

function collapseCategories(
  categories: CategoryBreakdownItem[],
  maxSlices = 7,
): CategoryBreakdownItem[] {
  if (categories.length <= maxSlices) return categories;
  const top = categories.slice(0, maxSlices);
  const rest = categories.slice(maxSlices);
  const otherAmount = rest.reduce((sum, c) => sum + c.amount_cents, 0);
  const total = categories.reduce((sum, c) => sum + c.amount_cents, 0);
  return [
    ...top,
    {
      category_id: null,
      category_name: "Other",
      amount_cents: otherAmount,
      percentage: total > 0 ? (otherAmount / total) * 100 : 0,
    },
  ];
}

function ChartTip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-zinc-700/80 bg-zinc-900/95 px-3 py-2 text-xs shadow-xl backdrop-blur-sm">
      {label && <p className="mb-1.5 font-medium text-zinc-300">{label}</p>}
      <ul className="space-y-1">
        {payload.map((entry) => (
          <li key={entry.name} className="flex items-center gap-2 text-zinc-400">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span>{entry.name}</span>
            <span className="ml-auto tabular-nums text-zinc-200">
              {formatCents(entry.value ?? 0)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Analytics() {
  const [month, setMonth] = useState(currentMonthKey);
  const [trendMonths, setTrendMonths] = useState("12");
  const [accountId, setAccountId] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [trends, setTrends] = useState<SpendingTrends | null>(null);
  const [breakdown, setBreakdown] = useState<CategoryBreakdown | null>(null);
  const [topPayees, setTopPayees] = useState<TopPayees | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [barSelection, setBarSelection] =
    useState<MonthTransactionsSelection | null>(null);

  const accountFilter = accountId ? Number(accountId) : undefined;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [accts, trendsData, breakdownData, payeesData] = await Promise.all([
        getAccounts(),
        getSpendingTrends(Number(trendMonths), month, accountFilter),
        getCategoryBreakdown(month, accountFilter),
        getTopPayees(month, 8, accountFilter),
      ]);
      setAccounts(accts);
      setTrends(trendsData);
      setBreakdown(breakdownData);
      setTopPayees(payeesData);
    } catch (e) {
      setError(formatErrorMessage(e, "Failed to load analytics"));
    } finally {
      setLoading(false);
    }
  }, [month, trendMonths, accountId]);

  useEffect(() => {
    void load();
  }, [load]);

  const trendChartData = useMemo(
    () =>
      (trends?.months ?? []).map((m) => ({
        monthKey: m.month,
        label: m.label.replace(/\s20\d{2}$/, ""),
        income: m.income_cents,
        expenses: Math.abs(m.expense_cents),
        net: m.net_cents,
      })),
    [trends],
  );

  const handleTrendBarClick = useCallback(
    (index: number, kind: "income" | "expense") => {
      const entry = trendChartData[index];
      if (!entry) return;
      setBarSelection({
        month: entry.monthKey,
        kind,
        accountId: accountFilter,
      });
    },
    [trendChartData, accountFilter],
  );

  const pieData = useMemo(
    () => collapseCategories(breakdown?.categories ?? []),
    [breakdown],
  );

  const payeeChartData = useMemo(
    () =>
      (topPayees?.payees ?? []).map((p) => ({
        name:
          p.payee.length > 28 ? `${p.payee.slice(0, 26)}…` : p.payee,
        fullName: p.payee,
        amount: p.amount_cents,
        count: p.transaction_count,
      })),
    [topPayees],
  );

  const focusMonth = trends?.months.find((m) => m.month === month);
  const uncategorizedPct = useMemo(() => {
    if (!breakdown || breakdown.total_cents === 0) return 0;
    const uncat = breakdown.categories.find(
      (c) => c.category_name === "Uncategorized",
    );
    return uncat ? (uncat.amount_cents / breakdown.total_cents) * 100 : 0;
  }, [breakdown]);

  const hasAnyData =
    (trends?.months.some(
      (m) => m.income_cents !== 0 || m.expense_cents !== 0,
    ) ??
      false) ||
    (breakdown?.total_cents ?? 0) > 0;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader
        title="Analytics"
        description="Spending patterns from your categorized transactions"
      >
        <div className="flex flex-wrap items-end gap-3">
          <MonthPicker
            value={month}
            onChange={setMonth}
            label="Focus month"
            id="analytics-month"
          />
          <div className="w-44">
            <Select
              label="Trend range"
              value={trendMonths}
              onChange={(e) => setTrendMonths(e.target.value)}
              options={TREND_MONTH_OPTIONS}
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
        </div>
      </PageHeader>

      <div className="flex-1 overflow-y-auto p-8">
        {error && (
          <ErrorBanner message={error} onDismiss={() => setError(null)} />
        )}

        {loading && <LoadingState label="Loading analytics…" />}

        {!loading && !hasAnyData && (
          <Card>
            <EmptyState
              icon={BarChart3}
              title="No spending data yet"
              description="Import transactions and categorize them to unlock charts and breakdowns."
              action={{ label: "Import CSV", to: "/import" }}
            />
          </Card>
        )}

        {!loading && hasAnyData && (
          <div className="space-y-6">
            {uncategorizedPct >= 20 && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-900/40 bg-amber-950/20 px-4 py-3">
                <p className="text-sm text-amber-200/90">
                  {uncategorizedPct.toFixed(0)}% of spending this month is
                  uncategorized — charts will improve as you categorize.
                </p>
                <Link
                  to="/transactions"
                  className="text-sm font-medium text-amber-400 hover:text-amber-300"
                >
                  Categorize →
                </Link>
              </div>
            )}

            {focusMonth && (
              <div className="grid gap-4 sm:grid-cols-3">
                <StatCard
                  label="Income"
                  value={formatCents(focusMonth.income_cents)}
                  tone="income"
                  icon={TrendingUp}
                />
                <StatCard
                  label="Expenses"
                  value={formatCents(Math.abs(focusMonth.expense_cents))}
                  tone="expense"
                  icon={TrendingDown}
                />
                <StatCard
                  label="Net"
                  value={formatCents(focusMonth.net_cents)}
                  tone={focusMonth.net_cents >= 0 ? "income" : "expense"}
                  icon={BarChart3}
                />
              </div>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-base text-zinc-200">
                  Income vs expenses
                </CardTitle>
                <p className="text-xs text-zinc-500">
                  Monthly totals ·{" "}
                  {TREND_MONTH_OPTIONS.find((o) => o.value === trendMonths)?.label.toLowerCase()}{" "}
                  · click a bar for details
                </p>
              </CardHeader>
              <CardContent>
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={trendChartData}
                      margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                      barGap={4}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#27272a"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: "#71717a", fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fill: "#71717a", fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v: number) =>
                          `$${Math.round(v / 100).toLocaleString()}`
                        }
                      />
                      <Tooltip
                        content={<ChartTip />}
                        cursor={{ fill: "rgba(39, 39, 42, 0.4)" }}
                      />
                      <Bar
                        dataKey="income"
                        name="Income"
                        fill="#34d399"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={32}
                        cursor="pointer"
                        className="cursor-pointer"
                        onClick={(_data, index) =>
                          handleTrendBarClick(index, "income")
                        }
                      />
                      <Bar
                        dataKey="expenses"
                        name="Expenses"
                        fill="#f87171"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={32}
                        cursor="pointer"
                        className="cursor-pointer"
                        onClick={(_data, index) =>
                          handleTrendBarClick(index, "expense")
                        }
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 flex justify-center gap-6 text-xs text-zinc-500">
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-sm bg-emerald-400" />
                    Income
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-sm bg-red-400" />
                    Expenses
                  </span>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-6 xl:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base text-zinc-200">
                    By category
                  </CardTitle>
                  <p className="text-xs text-zinc-500">
                    {formatMonthLabel(month)} expenses ·{" "}
                    {formatCents(breakdown?.total_cents ?? 0)} total
                  </p>
                </CardHeader>
                <CardContent>
                  {pieData.length === 0 ? (
                    <p className="py-12 text-center text-sm text-zinc-600">
                      No expenses this month
                    </p>
                  ) : (
                    <div className="flex flex-col items-center gap-6 lg:flex-row">
                      <div className="h-56 w-full max-w-xs">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={pieData}
                              dataKey="amount_cents"
                              nameKey="category_name"
                              cx="50%"
                              cy="50%"
                              innerRadius="58%"
                              outerRadius="88%"
                              paddingAngle={2}
                              stroke="transparent"
                            >
                              {pieData.map((_, i) => (
                                <Cell
                                  key={i}
                                  fill={SLICE_COLORS[i % SLICE_COLORS.length]}
                                />
                              ))}
                            </Pie>
                            <Tooltip content={<ChartTip />} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <ul className="w-full flex-1 space-y-2">
                        {pieData.map((cat, i) => (
                          <li
                            key={cat.category_name}
                            className="flex items-center gap-3 text-sm"
                          >
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{
                                backgroundColor:
                                  SLICE_COLORS[i % SLICE_COLORS.length],
                              }}
                            />
                            <span className="min-w-0 flex-1 truncate text-zinc-300">
                              {cat.category_name}
                            </span>
                            <span className="shrink-0 tabular-nums text-zinc-500">
                              {(breakdown?.total_cents ?? 0) > 0
                                ? `${((cat.amount_cents / (breakdown?.total_cents ?? 1)) * 100).toFixed(0)}%`
                                : "0%"}
                            </span>
                            <span className="w-24 shrink-0 text-right tabular-nums text-zinc-400">
                              {formatCents(cat.amount_cents)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base text-zinc-200">
                    Top payees
                  </CardTitle>
                  <p className="text-xs text-zinc-500">
                    Largest merchants · {formatMonthLabel(month)}
                  </p>
                </CardHeader>
                <CardContent>
                  {payeeChartData.length === 0 ? (
                    <p className="py-12 text-center text-sm text-zinc-600">
                      No expenses this month
                    </p>
                  ) : (
                    <div className="h-72 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={payeeChartData}
                          layout="vertical"
                          margin={{ top: 0, right: 12, left: 0, bottom: 0 }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="#27272a"
                            horizontal={false}
                          />
                          <XAxis
                            type="number"
                            tick={{ fill: "#71717a", fontSize: 11 }}
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={(v: number) =>
                              `$${Math.round(v / 100).toLocaleString()}`
                            }
                          />
                          <YAxis
                            type="category"
                            dataKey="name"
                            width={120}
                            tick={{ fill: "#a1a1aa", fontSize: 11 }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <Tooltip
                            content={({ active, payload }) => {
                              if (!active || !payload?.length) return null;
                              const row = payload[0]?.payload as {
                                fullName: string;
                                amount: number;
                                count: number;
                              };
                              return (
                                <div className="rounded-lg border border-zinc-700/80 bg-zinc-900/95 px-3 py-2 text-xs shadow-xl">
                                  <p className="font-medium text-zinc-200">
                                    {row.fullName}
                                  </p>
                                  <p className="mt-1 text-zinc-400">
                                    {formatCents(row.amount)} · {row.count}{" "}
                                    transactions
                                  </p>
                                </div>
                              );
                            }}
                            cursor={{ fill: "rgba(39, 39, 42, 0.4)" }}
                          />
                          <Bar
                            dataKey="amount"
                            fill="#38bdf8"
                            radius={[0, 4, 4, 0]}
                            maxBarSize={18}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>

      {barSelection && (
        <MonthTransactionsDialog
          selection={barSelection}
          onClose={() => setBarSelection(null)}
        />
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string;
  tone: "income" | "expense";
  icon: typeof TrendingUp;
}) {
  return (
    <Card>
      <CardContent className="py-5">
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <Icon
            className={cn(
              "h-3.5 w-3.5",
              tone === "income" ? "text-emerald-500" : "text-red-400",
            )}
          />
          {label}
        </div>
        <p
          className={cn(
            "mt-2 tabular-nums text-2xl font-semibold",
            tone === "income" ? "text-emerald-400" : "text-red-400",
          )}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}