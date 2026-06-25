import type { Rule, TransactionDraft } from "./types";
import { normalizeMemo } from "./import/normalize";

export function matchRule(memo: string | null, rule: Rule): boolean {
  if (!rule.enabled) {
    return false;
  }

  const normalizedMemo = normalizeMemo(memo);
  const normalizedMatch = normalizeMemo(rule.matchValue);

  if (!normalizedMemo || !normalizedMatch) {
    return false;
  }

  if (rule.matchType === "EXACT") {
    return normalizedMemo === normalizedMatch;
  }

  return normalizedMemo.includes(normalizedMatch);
}

export function applyRules(drafts: TransactionDraft[], rules: Rule[]): TransactionDraft[] {
  const activeRules = rules
    .filter((rule) => rule.enabled)
    .sort((left, right) => left.priority - right.priority);

  return drafts.map((draft) => {
    if (draft.categoryId !== null) {
      return draft;
    }

    const matchedRule = activeRules.find((rule) => matchRule(draft.memo, rule));
    if (!matchedRule) {
      return draft;
    }

    return {
      ...draft,
      categoryId: matchedRule.categoryId,
      appliedRuleId: matchedRule.id,
    };
  });
}