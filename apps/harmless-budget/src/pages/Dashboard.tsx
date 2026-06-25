import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  AlertCircle,
  Landmark,
  TrendingDown,
  TrendingUp,
  Upload,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { EmptyState } from "../components/EmptyState";
import { ErrorBanner } from "../components/ErrorBanner";
import { LoadingState } from "../components/LoadingState";
import { PageHeader } from "../components/PageHeader";
import {
  MonthTransactionsDialog,
  type MonthTransactionsSelection,
} from "../components/MonthTransactionsDialog";
import { Sparkline } from "../components/Sparkline";
import {
  getCategoryBreakdown,
  getDashboardSummary,
  getSpendingTrends,
  type CategoryBreakdown,
  type DashboardSummary,
  type SpendingTrends,
} from "../lib/api";
import { formatCents } from "../lib/money";
import {
  cn,
  currentMonthKey,
  formatErrorMessage,
  formatMomPercent,
  formatMonthLabel,
  momPercentChange,
} from "../lib/utils";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { MonthPicker } from "../components/ui/MonthPicker";

const TREND_MONTHS = 6;
const TOP_CATEGORY_COUNT = 5;

export function Dashboard() {
  const [month, setMonth] = useState(currentMonthKey);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [trends, setTrends] = useState<SpendingTrends | null>(null);
  const [breakdown, setBreakdown] = useState<CategoryBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [barSelection, setBarSelection] =
    useState<MonthTransactionsSelection | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaryData, trendsData, breakdownData] = await Promise.all([
        getDashboardSummary(month),
        getSpendingTrends(TREND_MONTHS, month),
        getCategoryBreakdown(month),
      ]);
      setSummary(summaryData);
      setTrends(trendsData);
      setBreakdown(breakdownData);
    } catch (e) {
      setError(formatErrorMessage(e, "Failed to load dashboard"));
      setSummary(null);
      setTrends(null);
      setBreakdown(null);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  const trendMonths = trends?.months ?? [];

  const previousMonth = useMemo(() => {
    const idx = trendMonths.findIndex((m) => m.month === month);
    return idx > 0 ? trendMonths[idx - 1] : null;
  }, [trendMonths, month]);

  const trendChartData = useMemo(
    () =>
      trendMonths.map((m) => ({
        monthKey: m.month,
        label: m.label.replace(/\s20\d{2}$/, ""),
        income: m.income_cents,
        expenses: Math.abs(m.expense_cents),
      })),
    [trendMonths],
  );

  const handleTrendBarClick = useCallback(
    (index: number, kind: "income" | "expense") => {
      const entry = trendChartData[index];
      if (!entry) return;
      setBarSelection({ month: entry.monthKey, kind });
    },
    [trendChartData],
  );

  const topCategories = useMemo(
    () => (breakdown?.categories ?? []).slice(0, TOP_CATEGORY_COUNT),
    [breakdown],
  );

  const incomeSpark = useMemo(
    () => trendMonths.map((m) => m.income_cents),
    [trendMonths],
  );
  const expenseSpark = useMemo(
    () => trendMonths.map((m) => Math.abs(m.expense_cents)),
    [trendMonths],
  );
  const netSpark = useMemo(
    () => trendMonths.map((m) => m.net_cents),
    [trendMonths],
  );

  const isEmpty = summary && summary.transaction_count === 0;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader
        title="Dashboard"
        description="Month at a glance — income, spending, and budget"
      >
        <MonthPicker
          value={month}
          onChange={setMonth}
          label="Month"
          id="dashboard-month"
        />
      </PageHeader>

      <div className="flex-1 overflow-y-auto p-8">
        {loading && <LoadingState label="Loading summary…" />}

        {error && !loading && (
          <ErrorBanner message={error} onDismiss={() => setError(null)} />
        )}

        {isEmpty && !loading && (
          <Card>
            <EmptyState
              icon={Upload}
              title="Welcome to Harmless Budget"
              description="Create an account, then import a CSV from your bank to start tracking spending. Everything stays on your Mac."
              action={{ label: "Create an account", to: "/accounts" }}
            />
            <div className="flex justify-center gap-3 border-t border-zinc-800 px-6 pb-8">
              <Link to="/accounts">
                <Button variant="outline" size="sm">
                  <Landmark className="h-4 w-4" />
                  Accounts
                </Button>
              </Link>
              <Link to="/import">
                <Button size="sm">
                  <Upload className="h-4 w-4" />
                  Import CSV
                </Button>
              </Link>
            </div>
          </Card>
        )}

        {summary && !loading && !isEmpty && (
          <div className="space-y-6">
            {summary.uncategorized_count > 0 && (
              <div className="flex items-center justify-between rounded-lg border border-amber-900/40 bg-amber-950/20 px-4 py-3">
                <p className="text-sm text-amber-200/90">
                  <span className="font-medium tabular-nums">
                    {summary.uncategorized_count}
                  </span>{" "}
                  uncategorized transaction
                  {summary.uncategorized_count === 1 ? "" : "s"} this month
                </p>
                <Link to="/transactions">
                  <Button variant="outline" size="sm">
                    Review
                  </Button>
                </Link>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                icon={ArrowDownLeft}
                iconColor="text-emerald-400"
                label="Income"
                value={formatCents(summary.income_cents)}
                valueColor="text-emerald-400"
                sparkline={incomeSpark}
                sparkColor="#34d399"
                mom={
                  previousMonth
                    ? momPercentChange(
                        summary.income_cents,
                        previousMonth.income_cents,
                      )
                    : undefined
                }
                momTone="higher-is-good"
              />
              <StatCard
                icon={ArrowUpRight}
                iconColor="text-red-400"
                label="Expenses"
                value={formatCents(Math.abs(summary.expense_cents))}
                valueColor="text-red-400"
                sparkline={expenseSpark}
                sparkColor="#f87171"
                mom={
                  previousMonth
                    ? momPercentChange(
                        Math.abs(summary.expense_cents),
                        Math.abs(previousMonth.expense_cents),
                      )
                    : undefined
                }
                momTone="lower-is-good"
              />
              <StatCard
                icon={TrendingUp}
                iconColor="text-zinc-400"
                label="Net"
                value={formatCents(summary.net_cents)}
                valueColor={
                  summary.net_cents >= 0 ? "text-emerald-400" : "text-red-400"
                }
                sparkline={netSpark}
                sparkColor={summary.net_cents >= 0 ? "#34d399" : "#f87171"}
                mom={
                  previousMonth
                    ? momPercentChange(
                        summary.net_cents,
                        previousMonth.net_cents,
                      )
                    : undefined
                }
                momTone="higher-is-good"
              />
              <StatCard
                icon={AlertCircle}
                iconColor="text-amber-400"
                label="Uncategorized"
                value={String(summary.uncategorized_count)}
                valueColor="text-amber-400"
                hint="need a category"
              />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base text-zinc-200">
                    Last {TREND_MONTHS} months
                  </CardTitle>
                  <p className="text-xs text-zinc-500">
                    Income vs expenses by month · click a bar for details
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="h-52 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={trendChartData}
                        margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                        barGap={3}
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
                          content={<TrendTooltip />}
                          cursor={{ fill: "rgba(39, 39, 42, 0.4)" }}
                        />
                        <Bar
                          dataKey="income"
                          name="Income"
                          fill="#34d399"
                          radius={[3, 3, 0, 0]}
                          maxBarSize={28}
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
                          radius={[3, 3, 0, 0]}
                          maxBarSize={28}
                          cursor="pointer"
                          className="cursor-pointer"
                          onClick={(_data, index) =>
                            handleTrendBarClick(index, "expense")
                          }
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base text-zinc-200">
                      Top categories
                    </CardTitle>
                    <p className="text-xs text-zinc-500">
                      {formatMonthLabel(month)} ·{" "}
                      {formatCents(breakdown?.total_cents ?? 0)} spent
                    </p>
                  </div>
                  <Link
                    to="/analytics"
                    className="shrink-0 text-xs text-zinc-500 hover:text-emerald-400"
                  >
                    All →
                  </Link>
                </CardHeader>
                <CardContent>
                  {topCategories.length === 0 ? (
                    <p className="py-10 text-center text-sm text-zinc-600">
                      No expenses this month
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {topCategories.map((cat) => (
                        <li key={cat.category_name}>
                          <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                            <span className="truncate text-zinc-300">
                              {cat.category_name}
                            </span>
                            <span className="shrink-0 tabular-nums text-zinc-400">
                              {formatCents(cat.amount_cents)}
                            </span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
                            <div
                              className="h-full rounded-full bg-emerald-500/70"
                              style={{ width: `${cat.percentage}%` }}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base text-zinc-200">
                  Budget overview
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-zinc-500">Income</p>
                  <p className="tabular-nums text-lg font-semibold text-zinc-200">
                    {formatCents(summary.budget_target_cents)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Budgeted</p>
                  <p className="tabular-nums text-lg font-semibold text-zinc-300">
                    {formatCents(summary.budget_actual_cents)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Left to budget</p>
                  <p
                    className={`tabular-nums text-lg font-semibold ${
                      summary.budget_remaining_cents === 0
                        ? "text-emerald-400"
                        : summary.budget_remaining_cents > 0
                          ? "text-amber-400"
                          : "text-red-400"
                    }`}
                  >
                    {formatCents(summary.budget_remaining_cents)}
                  </p>
                </div>
                <p className="text-xs text-zinc-600 sm:col-span-3">
                  {summary.transaction_count} transactions this month
                </p>
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Link
                to="/analytics"
                className="inline-flex items-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-emerald-400"
              >
                View full analytics
                <ArrowRight className="h-4 w-4" />
              </Link>
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

function TrendTooltip({
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

function StatCard({
  icon: Icon,
  iconColor,
  label,
  value,
  valueColor,
  hint,
  sparkline,
  sparkColor,
  mom,
  momTone,
}: {
  icon: typeof ArrowDownLeft;
  iconColor: string;
  label: string;
  value: string;
  valueColor: string;
  hint?: string;
  sparkline?: number[];
  sparkColor?: string;
  mom?: number | null;
  momTone?: "higher-is-good" | "lower-is-good";
}) {
  const momPositive = typeof mom === "number" && mom > 0;
  const momNegative = typeof mom === "number" && mom < 0;
  const momFavorable =
    typeof mom === "number" &&
    (momTone === "lower-is-good" ? mom < 0 : mom > 0);
  const momUnfavorable =
    typeof mom === "number" &&
    (momTone === "lower-is-good" ? mom > 0 : mom < 0);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="flex min-w-0 items-center justify-between gap-2 text-sm">
          <span className="flex min-w-0 items-center gap-2 truncate">
            <Icon className={`h-3.5 w-3.5 shrink-0 ${iconColor}`} />
            {label}
          </span>
          {sparkline && sparkline.length >= 2 && (
            <div className="shrink-0 overflow-hidden">
              <Sparkline values={sparkline} color={sparkColor} />
            </div>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className={`tabular-nums text-2xl font-semibold ${valueColor}`}>
          {value}
        </p>
        {mom === null && (
          <p className="mt-1 text-xs text-zinc-500">new vs last month</p>
        )}
        {typeof mom === "number" && (
          <p
            className={cn(
              "mt-1 flex items-center gap-1 text-xs",
              mom === 0 && "text-zinc-500",
              momFavorable && "text-emerald-500/90",
              momUnfavorable && "text-red-400/90",
            )}
          >
            {momPositive && <TrendingUp className="h-3 w-3" />}
            {momNegative && <TrendingDown className="h-3 w-3" />}
            <span>{formatMomPercent(mom)} vs last month</span>
          </p>
        )}
        {hint && mom === undefined && (
          <p className="mt-1 text-xs text-zinc-500">{hint}</p>
        )}
      </CardContent>
    </Card>
  );
}