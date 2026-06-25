import type { Category, CategoryType } from "./api";

export function flattenCategories(categories: Category[]): Category[] {
  const result: Category[] = [];

  function walk(nodes: Category[]) {
    for (const node of nodes) {
      result.push(node);
      if (node.children.length > 0) {
        walk(node.children);
      }
    }
  }

  walk(categories);
  return result;
}

export interface CategoryOptionGroup {
  label: string;
  options: { value: string; label: string }[];
}

/** Grouped options for selects — parents as optgroup headers, assignable leaves inside. */
export function categoryOptionGroups(
  categories: Category[],
  opts?: {
    catType?: CategoryType;
    leavesOnly?: boolean;
  },
): CategoryOptionGroup[] {
  const groups: CategoryOptionGroup[] = [];
  const leavesOnly = opts?.leavesOnly ?? true;

  for (const root of categories) {
    if (root.archived_at) continue;
    if (opts?.catType && root.cat_type !== opts.catType) continue;

    const activeChildren = root.children.filter((c) => !c.archived_at);

    if (activeChildren.length > 0) {
      const options = leavesOnly
        ? activeChildren
            .filter((c) => !opts?.catType || c.cat_type === opts.catType)
            .map((c) => ({ value: String(c.id), label: c.name }))
        : flattenCategories([root])
            .filter((c) => c.id !== root.id)
            .map((c) => ({ value: String(c.id), label: c.name }));

      if (options.length > 0) {
        groups.push({ label: root.name, options });
      }
    } else if (!leavesOnly || root.children.length === 0) {
      groups.push({
        label: typeLabel(root.cat_type),
        options: [{ value: String(root.id), label: root.name }],
      });
    }
  }

  return groups;
}

export function categoryOptionsForType(
  categories: Category[],
  catType?: CategoryType,
): { value: string; label: string }[] {
  return categoryOptionGroups(categories, { catType, leavesOnly: true }).flatMap(
    (group) =>
      group.options.map((opt) => ({
        value: opt.value,
        label: `${group.label} › ${opt.label}`,
      })),
  );
}

export function parentNameById(categories: Category[]): Map<number, string> {
  const map = new Map<number, string>();
  for (const root of categories) {
    map.set(root.id, root.name);
    for (const child of root.children) {
      map.set(child.id, root.name);
    }
  }
  return map;
}

export function displayCategoryName(
  categoryName: string,
  parentId: number | null | undefined,
  parentNames: Map<number, string>,
): string {
  if (!parentId) return categoryName;
  const parent = parentNames.get(parentId);
  return parent ? `${parent} › ${categoryName}` : categoryName;
}

function typeLabel(catType: CategoryType): string {
  switch (catType) {
    case "income":
      return "Income";
    case "transfer":
      return "Transfers";
    default:
      return "Expense";
  }
}

export function categoriesByType(
  categories: Category[],
): Record<CategoryType, Category[]> {
  return {
    expense: categories.filter((c) => c.cat_type === "expense"),
    income: categories.filter((c) => c.cat_type === "income"),
    transfer: categories.filter((c) => c.cat_type === "transfer"),
  };
}

export function suggestRuleName(payee?: string | null, memo?: string | null): string {
  const source = (payee?.trim() || memo?.trim() || "").slice(0, 40);
  return source ? `Rule: ${source}` : "New rule";
}

export function suggestRuleMatchValue(
  payee?: string | null,
  memo?: string | null,
): string {
  return payee?.trim() || memo?.trim() || "";
}