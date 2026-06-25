import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  FolderTree,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { EmptyState } from "../components/EmptyState";
import { ErrorBanner } from "../components/ErrorBanner";
import { PageHeader } from "../components/PageHeader";
import {
  archiveCategory,
  createCategory,
  getCategories,
  updateCategory,
  type Category,
  type CategoryType,
} from "../lib/api";
import { categoriesByType } from "../lib/categories";
import { cn, formatErrorMessage } from "../lib/utils";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";

const TYPE_OPTIONS: { value: CategoryType; label: string }[] = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "transfer", label: "Transfer" },
];

export function Categories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [newName, setNewName] = useState("");
  const [newParentId, setNewParentId] = useState("");
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupType, setGroupType] = useState<CategoryType>("expense");

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");

  const [inlineAddParentId, setInlineAddParentId] = useState<number | null>(
    null,
  );
  const [inlineAddName, setInlineAddName] = useState("");
  const inlineInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCategories(await getCategories());
    } catch (e) {
      setError(formatErrorMessage(e, "Failed to load categories"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (inlineAddParentId !== null) {
      inlineInputRef.current?.focus();
    }
  }, [inlineAddParentId]);

  const byType = useMemo(() => categoriesByType(categories), [categories]);

  const parentOptions = useMemo(
    () =>
      categories
        .filter((c) => c.children.length > 0)
        .map((root) => ({ value: String(root.id), label: root.name })),
    [categories],
  );

  async function handleCreateSubcategory(
    name: string,
    parentId: number,
    clear: () => void,
  ) {
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await createCategory({ name: name.trim(), parent_id: parentId });
      clear();
      setSuccess(`Added “${name.trim()}”.`);
      await load();
    } catch (e) {
      setError(formatErrorMessage(e, "Failed to create category"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleQuickAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || !newParentId) return;
    await handleCreateSubcategory(newName, Number(newParentId), () => {
      setNewName("");
    });
  }

  async function handleInlineAdd(parentId: number) {
    await handleCreateSubcategory(inlineAddName, parentId, () => {
      setInlineAddName("");
      setInlineAddParentId(null);
    });
  }

  async function handleCreateGroup(e: React.FormEvent) {
    e.preventDefault();
    if (!groupName.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await createCategory({
        name: groupName.trim(),
        cat_type: groupType,
      });
      const created = groupName.trim();
      setGroupName("");
      setShowNewGroup(false);
      setSuccess(`Created group “${created}”. Add subcategories under it next.`);
      await load();
    } catch (e) {
      setError(formatErrorMessage(e, "Failed to create group"));
    } finally {
      setSubmitting(false);
    }
  }

  async function saveRename(id: number) {
    if (!editName.trim()) return;
    try {
      await updateCategory(id, editName.trim());
      setEditingId(null);
      await load();
    } catch (e) {
      setError(formatErrorMessage(e, "Failed to rename category"));
    }
  }

  async function handleDelete(id: number, name: string) {
    if (
      !confirm(
        `Delete “${name}”?\n\nIt will be removed from dropdowns. Transactions already using it keep their category.`,
      )
    ) {
      return;
    }
    try {
      await archiveCategory(id);
      setSuccess(`Deleted “${name}”.`);
      await load();
    } catch (e) {
      setError(formatErrorMessage(e, "Failed to delete category"));
    }
  }

  function startInlineAdd(parentId: number) {
    setInlineAddParentId(parentId);
    setInlineAddName("");
    setNewParentId(String(parentId));
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader
        title="Categories"
        description="Organize spending into groups and subcategories"
      />

      <div className="flex-1 overflow-y-auto p-8">
        <div className="mx-auto max-w-3xl space-y-6">
          {error && (
            <ErrorBanner message={error} onDismiss={() => setError(null)} />
          )}
          {success && (
            <div className="rounded-lg border border-emerald-900/50 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-400">
              {success}
            </div>
          )}

          <Card className="border-emerald-900/30 bg-emerald-950/10">
            <CardHeader>
              <CardTitle className="text-base text-zinc-100">
                Add a category
              </CardTitle>
              <p className="text-xs text-zinc-500">
                Choose a group, then name the subcategory.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <form
                onSubmit={(e) => void handleQuickAdd(e)}
                className="flex flex-col gap-3 sm:flex-row sm:items-end"
              >
                <div className="min-w-0 flex-1 sm:max-w-[200px]">
                  <Select
                    label="Under group"
                    value={newParentId}
                    onChange={(e) => setNewParentId(e.target.value)}
                    placeholder="Choose group…"
                    options={parentOptions}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <Input
                    label="Category name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Meal delivery"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={submitting || !newParentId || !newName.trim()}
                  className="shrink-0 sm:mb-0.5"
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  Add
                </Button>
              </form>

              <div className="border-t border-zinc-800/80 pt-3">
                <button
                  type="button"
                  onClick={() => setShowNewGroup((v) => !v)}
                  className="text-xs text-zinc-500 hover:text-zinc-300"
                >
                  {showNewGroup ? "− Hide" : "+ New group"}
                </button>
                {showNewGroup && (
                  <form
                    onSubmit={(e) => void handleCreateGroup(e)}
                    className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end"
                  >
                    <div className="min-w-0 flex-1">
                      <Input
                        label="Group name"
                        value={groupName}
                        onChange={(e) => setGroupName(e.target.value)}
                        placeholder="e.g. Pets"
                      />
                    </div>
                    <div className="w-full sm:w-36">
                      <Select
                        label="Type"
                        value={groupType}
                        onChange={(e) =>
                          setGroupType(e.target.value as CategoryType)
                        }
                        options={TYPE_OPTIONS.map((t) => ({
                          value: t.value,
                          label: t.label,
                        }))}
                      />
                    </div>
                    <Button
                      type="submit"
                      variant="outline"
                      disabled={submitting || !groupName.trim()}
                      className="shrink-0 sm:mb-0.5"
                    >
                      Add group
                    </Button>
                  </form>
                )}
              </div>
            </CardContent>
          </Card>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-zinc-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading categories…
            </div>
          ) : categories.length === 0 ? (
            <Card>
              <EmptyState
                icon={FolderTree}
                title="No categories"
                description="Categories are created on first launch. Restart the app if this looks wrong."
              />
            </Card>
          ) : (
            (["expense", "income", "transfer"] as const).map((type) => (
              <TypeSection
                key={type}
                type={type}
                roots={byType[type]}
                editingId={editingId}
                editName={editName}
                inlineAddParentId={inlineAddParentId}
                inlineAddName={inlineAddName}
                inlineInputRef={inlineInputRef}
                submitting={submitting}
                onStartEdit={(id, name) => {
                  setEditingId(id);
                  setEditName(name);
                }}
                onEditNameChange={setEditName}
                onSaveRename={(id) => void saveRename(id)}
                onCancelEdit={() => setEditingId(null)}
                onDelete={(id, name) => void handleDelete(id, name)}
                onStartInlineAdd={startInlineAdd}
                onInlineAddNameChange={setInlineAddName}
                onCancelInlineAdd={() => {
                  setInlineAddParentId(null);
                  setInlineAddName("");
                }}
                onSubmitInlineAdd={(parentId) =>
                  void handleInlineAdd(parentId)
                }
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function typeSectionLabel(type: CategoryType): string {
  switch (type) {
    case "income":
      return "Income";
    case "transfer":
      return "Transfers";
    default:
      return "Expense";
  }
}

function groupHeaderRedundant(root: Category, type: CategoryType): boolean {
  const label = typeSectionLabel(type).toLowerCase();
  return root.name.trim().toLowerCase() === label;
}

function TypeSection({
  type,
  roots,
  editingId,
  editName,
  inlineAddParentId,
  inlineAddName,
  inlineInputRef,
  submitting,
  onStartEdit,
  onEditNameChange,
  onSaveRename,
  onCancelEdit,
  onDelete,
  onStartInlineAdd,
  onInlineAddNameChange,
  onCancelInlineAdd,
  onSubmitInlineAdd,
}: {
  type: CategoryType;
  roots: Category[];
  editingId: number | null;
  editName: string;
  inlineAddParentId: number | null;
  inlineAddName: string;
  inlineInputRef: React.RefObject<HTMLInputElement | null>;
  submitting: boolean;
  onStartEdit: (id: number, name: string) => void;
  onEditNameChange: (name: string) => void;
  onSaveRename: (id: number) => void;
  onCancelEdit: () => void;
  onDelete: (id: number, name: string) => void;
  onStartInlineAdd: (parentId: number) => void;
  onInlineAddNameChange: (name: string) => void;
  onCancelInlineAdd: () => void;
  onSubmitInlineAdd: (parentId: number) => void;
}) {
  if (roots.length === 0) return null;

  const singleRedundantLeaf =
    roots.length === 1 &&
    roots[0].children.length === 0 &&
    groupHeaderRedundant(roots[0], type);

  if (singleRedundantLeaf) {
    return (
      <Card>
        <CardContent className="p-0 py-0.5">
          <ul>
            <CategoryRow
              category={roots[0]}
              editingId={editingId}
              editName={editName}
              onStartEdit={onStartEdit}
              onEditNameChange={onEditNameChange}
              onSaveRename={onSaveRename}
              onCancelEdit={onCancelEdit}
              onDelete={onDelete}
            />
          </ul>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0 pb-2">
        <p className="border-b border-zinc-800/60 px-4 py-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
          {typeSectionLabel(type)}
        </p>
        {roots.map((root) => {
          const isLeaf = root.children.length === 0;
          const hideHeader = groupHeaderRedundant(root, type);

          return (
            <div key={root.id}>
              {!hideHeader && !isLeaf && (
                <div className="flex items-center gap-2 border-b border-zinc-800/40 bg-zinc-900/30 px-4 py-2">
                  <p className="text-sm font-medium text-zinc-300">{root.name}</p>
                  <button
                    type="button"
                    onClick={() => onStartInlineAdd(root.id)}
                    className="ml-auto rounded-md p-1 text-emerald-400 hover:bg-emerald-950/40"
                    aria-label={`Add subcategory under ${root.name}`}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              <ul className="py-0.5">
                {isLeaf ? (
                  <CategoryRow
                    category={root}
                    editingId={editingId}
                    editName={editName}
                    onStartEdit={onStartEdit}
                    onEditNameChange={onEditNameChange}
                    onSaveRename={onSaveRename}
                    onCancelEdit={onCancelEdit}
                    onDelete={onDelete}
                  />
                ) : (
                  root.children.map((child) => (
                    <CategoryRow
                      key={child.id}
                      category={child}
                      indent={!hideHeader}
                      editingId={editingId}
                      editName={editName}
                      onStartEdit={onStartEdit}
                      onEditNameChange={onEditNameChange}
                      onSaveRename={onSaveRename}
                      onCancelEdit={onCancelEdit}
                      onDelete={onDelete}
                    />
                  ))
                )}

                {!isLeaf && hideHeader && inlineAddParentId !== root.id && (
                  <li className="px-4 py-0.5 pl-4">
                    <button
                      type="button"
                      onClick={() => onStartInlineAdd(root.id)}
                      className="rounded-md p-1 text-zinc-600 hover:bg-zinc-800/60 hover:text-emerald-400"
                      aria-label="Add subcategory"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </li>
                )}

                {!isLeaf && inlineAddParentId === root.id && (
                  <InlineAddRow
                    indent={!hideHeader}
                    inlineInputRef={inlineInputRef}
                    inlineAddName={inlineAddName}
                    submitting={submitting}
                    onInlineAddNameChange={onInlineAddNameChange}
                    onSubmit={() => onSubmitInlineAdd(root.id)}
                    onCancel={onCancelInlineAdd}
                  />
                )}
              </ul>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function InlineAddRow({
  indent = true,
  inlineInputRef,
  inlineAddName,
  submitting,
  onInlineAddNameChange,
  onSubmit,
  onCancel,
}: {
  indent?: boolean;
  inlineInputRef: React.RefObject<HTMLInputElement | null>;
  inlineAddName: string;
  submitting: boolean;
  onInlineAddNameChange: (name: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <li
      className={cn(
        "flex items-center gap-2 px-4 py-1.5",
        indent ? "pl-8" : "pl-4",
      )}
    >
      <input
        ref={inlineInputRef}
        value={inlineAddName}
        onChange={(e) => onInlineAddNameChange(e.target.value)}
        placeholder="New category…"
        className="h-8 min-w-0 flex-1 rounded-md border border-emerald-700/50 bg-zinc-900 px-2 text-sm text-zinc-100 focus:border-emerald-600 focus:outline-none"
        onKeyDown={(e) => {
          if (e.key === "Enter") onSubmit();
          if (e.key === "Escape") onCancel();
        }}
      />
      <button
        type="button"
        disabled={submitting || !inlineAddName.trim()}
        onClick={onSubmit}
        className="rounded-md p-1.5 text-emerald-400 hover:bg-emerald-600/20 disabled:opacity-40"
        aria-label="Add"
      >
        <Check className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded p-1 text-zinc-500 hover:text-zinc-300"
        aria-label="Cancel"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

function CategoryRow({
  category,
  indent = false,
  editingId,
  editName,
  onStartEdit,
  onEditNameChange,
  onSaveRename,
  onCancelEdit,
  onDelete,
}: {
  category: Category;
  indent?: boolean;
  editingId: number | null;
  editName: string;
  onStartEdit: (id: number, name: string) => void;
  onEditNameChange: (name: string) => void;
  onSaveRename: (id: number) => void;
  onCancelEdit: () => void;
  onDelete: (id: number, name: string) => void;
}) {
  const isEditing = editingId === category.id;
  const canDelete = !category.is_system;
  const rowPad = indent ? "pl-8" : "pl-4";

  if (isEditing) {
    return (
      <li className={cn("flex items-center gap-2 px-4 py-1.5", rowPad)}>
        <input
          value={editName}
          onChange={(e) => onEditNameChange(e.target.value)}
          className="h-8 w-48 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-sm text-zinc-100 focus:border-emerald-600 focus:outline-none"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") onSaveRename(category.id);
            if (e.key === "Escape") onCancelEdit();
          }}
        />
        <button
          type="button"
          onClick={() => onSaveRename(category.id)}
          className="rounded-md p-1.5 text-emerald-400 hover:bg-emerald-600/20"
          aria-label="Save"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onCancelEdit}
          className="rounded p-1 text-zinc-500 hover:text-zinc-300"
          aria-label="Cancel"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </li>
    );
  }

  return (
    <li
      className={cn(
        "group flex items-center gap-2 px-4 py-1.5 hover:bg-zinc-800/20",
        rowPad,
      )}
    >
      <span className="text-sm text-zinc-300">{category.name}</span>
      <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          onClick={() => onStartEdit(category.id, category.name)}
          className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
          aria-label={`Rename ${category.name}`}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        {canDelete && (
          <button
            type="button"
            onClick={() => onDelete(category.id, category.name)}
            className="rounded-md p-1.5 text-zinc-500 hover:bg-red-950/40 hover:text-red-400"
            aria-label={`Delete ${category.name}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </li>
  );
}