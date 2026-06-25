import { ChevronDown } from "lucide-react";
import { categoryOptionGroups } from "../lib/categories";
import type { Category, CategoryType } from "../lib/api";
import { cn } from "../lib/utils";

export function CategorySelect({
  categories,
  value,
  onChange,
  catType,
  placeholder = "Select category…",
  className,
  disabled,
}: {
  categories: Category[];
  value: string;
  onChange: (value: string) => void;
  catType?: CategoryType;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  const groups = categoryOptionGroups(categories, { catType, leavesOnly: true });

  return (
    <div className="relative">
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "h-9 w-full appearance-none rounded-lg border border-zinc-700 bg-zinc-900 px-3 pr-8 text-sm text-zinc-100",
          "focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600/50",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
      >
        <option value="">{placeholder}</option>
        {groups.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
    </div>
  );
}