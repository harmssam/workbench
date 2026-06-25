import { useEffect, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import {
  createRule,
  type Category,
  type MatchType,
  type Rule,
} from "../lib/api";
import { suggestRuleName } from "../lib/categories";
import { CategorySelect } from "./CategorySelect";
import { formatErrorMessage } from "../lib/utils";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { Select } from "./ui/Select";

const MATCH_TYPES: { value: MatchType; label: string }[] = [
  { value: "CONTAINS", label: "Contains" },
  { value: "EXACT", label: "Exact match" },
];

export interface CreateRuleDefaults {
  name?: string;
  matchValue?: string;
  categoryId?: string;
  matchType?: MatchType;
}

export function CreateRuleDialog({
  open,
  categories,
  defaults,
  onClose,
  onCreated,
}: {
  open: boolean;
  categories: Category[];
  defaults?: CreateRuleDefaults;
  onClose: () => void;
  onCreated: (rule: Rule) => void;
}) {
  const [name, setName] = useState("");
  const [matchType, setMatchType] = useState<MatchType>("CONTAINS");
  const [matchValue, setMatchValue] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(defaults?.name ?? suggestRuleName());
    setMatchType(defaults?.matchType ?? "CONTAINS");
    setMatchValue(defaults?.matchValue ?? "");
    setCategoryId(defaults?.categoryId ?? "");
    setError(null);
  }, [open, defaults]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !matchValue.trim() || !categoryId) return;

    setSubmitting(true);
    setError(null);
    try {
      const rule = await createRule({
        name: name.trim(),
        match_type: matchType,
        match_value: matchValue.trim(),
        category_id: Number(categoryId),
        enabled: true,
      });
      onCreated(rule);
      onClose();
    } catch (err) {
      setError(formatErrorMessage(err, "Failed to create rule"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/60"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-100">Create rule</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mb-4 text-sm text-zinc-500">
          Rules match against payee and memo text (case-insensitive). New rules
          are added to the bottom of the list on the Rules page.
        </p>

        {error && (
          <p className="mb-4 rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <Input
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Grocery stores"
            required
          />
          <Select
            label="Match type"
            value={matchType}
            onChange={(e) => setMatchType(e.target.value as MatchType)}
            options={MATCH_TYPES}
          />
          <Input
            label="Match value"
            value={matchValue}
            onChange={(e) => setMatchValue(e.target.value)}
            placeholder="e.g. WHOLE FOODS"
            required
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-400">
              Category
            </label>
            <CategorySelect
              categories={categories}
              value={categoryId}
              onChange={setCategoryId}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Create rule
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}