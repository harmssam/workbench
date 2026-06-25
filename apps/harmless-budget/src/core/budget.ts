import type { BudgetProgress, BudgetTarget, TransactionRecord } from "./types";

export function computeMonthActuals(
  transactions: TransactionRecord[],
  month: string,
): Record<number, number> {
  const actuals: Record<number, number> = {};

  for (const transaction of transactions) {
    if (!transaction.categoryId) {
      continue;
    }

    if (!transaction.date.startsWith(month)) {
      continue;
    }

    actuals[transaction.categoryId] =
      (actuals[transaction.categoryId] ?? 0) + transaction.amountCents;
  }

  return actuals;
}

export function computeBudgetProgress(
  targets: BudgetTarget[],
  actuals: Record<number, number>,
): BudgetProgress[] {
  return targets.map((target) => {
    const actualCents = actuals[target.categoryId] ?? 0;
    const remainingCents = target.targetCents - actualCents;
    const percentUsed =
      target.targetCents === 0 ? null : (actualCents / target.targetCents) * 100;

    return {
      categoryId: target.categoryId,
      month: target.month,
      targetCents: target.targetCents,
      actualCents,
      remainingCents,
      percentUsed,
    };
  });
}