import { useCallback, useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Check,
  ChevronRight,
  Clock,
  FileSpreadsheet,
  History,
  Loader2,
  Save,
  Upload,
} from "lucide-react";
import { BANK_PRESETS } from "../core/import/bank-presets";
import { applyBankPreset } from "../core/import/suggest-mapping";
import {
  applyMapping,
  deduplicateDrafts,
  parseCsv,
  validateDrafts,
} from "../core/import/pipeline";
import { detectEncoding } from "../core/import/encoding";
import type {
  AmountMappingMode,
  ColumnMapping,
  SuggestedColumnMapping,
  TransactionDraft,
} from "../core/types";
import {
  getAccounts,
  getDefaultImportProfile,
  getImportHashes,
  getImportHistory,
  importTransactions,
  readFileText,
  saveImportProfile,
  type Account,
  type ImportHistoryEntry,
} from "../lib/api";
import { formatCents } from "../lib/money";
import { cn, formatErrorMessage } from "../lib/utils";
import { ErrorBanner } from "../components/ErrorBanner";
import { PageHeader } from "../components/PageHeader";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";

const STEPS = [
  { id: 1, label: "Pick file" },
  { id: 2, label: "Map columns" },
  { id: 3, label: "Preview" },
  { id: 4, label: "Done" },
] as const;

const EMPTY_MAPPING: ColumnMapping = {
  date: "",
  amount: "",
  memo: "",
  name: "",
  transaction: "",
  debit: "",
  credit: "",
  amountMode: "single",
};

function toFullMapping(partial: SuggestedColumnMapping): ColumnMapping {
  return {
    date: partial.date ?? "",
    amount: partial.amount ?? "",
    memo: partial.memo ?? "",
    name: partial.name ?? "",
    transaction: partial.transaction ?? "",
    debit: partial.debit ?? "",
    credit: partial.credit ?? "",
    amountMode: partial.amountMode ?? "single",
  };
}

function mappingIsValid(mapping: ColumnMapping, accountId: string): boolean {
  if (!accountId || !mapping.date) return false;
  if (mapping.amountMode === "debit_credit") {
    return Boolean(mapping.debit || mapping.credit);
  }
  return Boolean(mapping.amount);
}

function mappingHints(
  mapping: ColumnMapping,
  accountId: string,
  accounts: Account[],
): string[] {
  const hints: string[] = [];
  if (accounts.length === 0) {
    hints.push("Create an account first (Accounts page), then return here.");
  } else if (!accountId) {
    hints.push("Select a target account.");
  }
  if (!mapping.date) {
    hints.push("Map the Date column.");
  }
  if (mapping.amountMode === "debit_credit") {
    if (!mapping.debit && !mapping.credit) {
      hints.push("Map at least one of Debit or Credit.");
    }
  } else if (!mapping.amount) {
    hints.push("Map the Amount column.");
  }
  return hints;
}

interface PreviewState {
  rows: TransactionDraft[];
  newRows: TransactionDraft[];
  newCount: number;
  duplicateCount: number;
  conflictCount: number;
  invalidCount: number;
}

export function Import() {
  const [step, setStep] = useState(1);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [csvText, setCsvText] = useState("");
  const [encoding, setEncoding] = useState("utf-8");
  const [headers, setHeaders] = useState<string[]>([]);
  const [sampleRows, setSampleRows] = useState<string[][]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState("");
  const [presetId, setPresetId] = useState("generic");
  const [mapping, setMapping] = useState<ColumnMapping>(EMPTY_MAPPING);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [history, setHistory] = useState<ImportHistoryEntry[]>([]);
  const [saveProfile, setSaveProfile] = useState(true);
  const [profileName, setProfileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await getImportHistory(15));
    } catch {
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    void getAccounts()
      .then(setAccounts)
      .catch(() => setAccounts([]));
    void loadHistory();
  }, [loadHistory]);

  const applyPresetToHeaders = useCallback(
    (hdrs: string[], preset: string) => {
      const suggested = applyBankPreset(hdrs, preset);
      setMapping(toFullMapping(suggested));
    },
    [],
  );

  const loadProfileForAccount = useCallback(
    async (id: string, hdrs: string[]) => {
      if (!id) return;
      try {
        const profile = await getDefaultImportProfile(Number(id));
        if (profile) {
          const parsed = JSON.parse(profile.mapping_json) as ColumnMapping;
          setMapping({ ...EMPTY_MAPPING, ...parsed });
          setPresetId(profile.preset_id ?? "generic");
          setProfileName(profile.name);
          return;
        }
      } catch {
        /* fall through to preset */
      }
      applyPresetToHeaders(hdrs, presetId);
    },
    [applyPresetToHeaders, presetId],
  );

  const pickFile = useCallback(async () => {
    setError(null);
    setSuccess(null);
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "Spreadsheets", extensions: ["csv", "tsv", "txt"] }],
      });
      if (!selected || Array.isArray(selected)) return;

      setLoading(true);
      setFilePath(selected);
      const text = await readFileText(selected);
      const enc = detectEncoding(text);
      const parsed = parseCsv(text, enc);
      setCsvText(text);
      setEncoding(enc);
      setHeaders(parsed.headers);
      setSampleRows(
        parsed.rows.slice(0, 5).map((row) =>
          parsed.headers.map((h) => row[h] ?? ""),
        ),
      );

      if (accountId) {
        await loadProfileForAccount(accountId, parsed.headers);
      } else {
        applyPresetToHeaders(parsed.headers, presetId);
      }

      setPreview(null);
      setStep(2);
    } catch (e) {
      setError(formatErrorMessage(e, "Failed to open file"));
    } finally {
      setLoading(false);
    }
  }, [accountId, applyPresetToHeaders, loadProfileForAccount, presetId]);

  async function onAccountChange(id: string) {
    setAccountId(id);
    if (id && headers.length > 0) {
      await loadProfileForAccount(id, headers);
    }
    const acct = accounts.find((a) => a.id === Number(id));
    if (acct && !profileName) {
      setProfileName(`${acct.name} CSV`);
    }
  }

  function onPresetChange(id: string) {
    setPresetId(id);
    if (headers.length > 0) {
      applyPresetToHeaders(headers, id);
    }
  }

  function onAmountModeChange(mode: AmountMappingMode) {
    setMapping((m) => ({
      ...m,
      amountMode: mode,
      amount: mode === "debit_credit" ? "" : m.amount,
      debit: mode === "single" ? "" : m.debit,
      credit: mode === "single" ? "" : m.credit,
    }));
  }

  const headerOptions = headers.map((h) => ({ value: h, label: h }));
  const mappingValid = mappingIsValid(mapping, accountId);
  const hints = mappingHints(mapping, accountId, accounts);

  async function runPreview() {
    if (!csvText || !mappingValid) return;
    setLoading(true);
    setError(null);
    try {
      const parsed = parseCsv(csvText, encoding);
      const drafts = applyMapping(parsed.rows, mapping, Number(accountId));
      const validation = validateDrafts(drafts);
      const existingHashes = await getImportHashes(Number(accountId));
      const dedup = deduplicateDrafts(validation.valid, existingHashes);

      setPreview({
        rows: [...dedup.newRows, ...dedup.duplicates, ...dedup.conflicts],
        newRows: dedup.newRows,
        newCount: dedup.newRows.length,
        duplicateCount: dedup.duplicates.length,
        conflictCount: dedup.conflicts.length,
        invalidCount: validation.invalid.length,
      });
      setStep(3);
    } catch (e) {
      setError(formatErrorMessage(e, "Failed to build preview"));
    } finally {
      setLoading(false);
    }
  }

  async function handleCommit() {
    if (!preview || preview.newRows.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const payloads = preview.newRows.map((d) => ({
        date: d.date,
        amount_cents: d.amountCents,
        memo: d.memo,
        payee: d.payee,
        type: d.type,
      }));

      const filename = filePath?.split("/").pop();
      const result = await importTransactions(
        Number(accountId),
        payloads,
        "skip",
        filename,
      );

      if (saveProfile && profileName.trim()) {
        await saveImportProfile({
          account_id: Number(accountId),
          name: profileName.trim(),
          preset_id: presetId === "generic" ? null : presetId,
          mapping_json: JSON.stringify(mapping),
        });
      }

      await loadHistory();
      setSuccess(
        `Imported ${result.inserted} transactions (${result.skipped} duplicates skipped).`,
      );
      setStep(4);
    } catch (e) {
      setError(formatErrorMessage(e, "Failed to commit import"));
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setStep(1);
    setFilePath(null);
    setCsvText("");
    setHeaders([]);
    setSampleRows([]);
    setMapping(EMPTY_MAPPING);
    setPresetId("generic");
    setPreview(null);
    setError(null);
    setSuccess(null);
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader
        title="Import"
        description="CSV import with bank presets and saved profiles"
      />

      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="shrink-0 border-b border-zinc-800/50 px-8 pb-4">
            <StepIndicator step={step} />
          </div>

          <div className="flex-1 overflow-y-auto p-8">
            {error && (
              <ErrorBanner message={error} onDismiss={() => setError(null)} />
            )}
            {success && (
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-900/50 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-400">
                <Check className="h-4 w-4 shrink-0" />
                {success}
              </div>
            )}

            {step === 1 && (
              <Card className="max-w-lg">
                <CardHeader>
                  <CardTitle className="text-base text-zinc-200">
                    Choose a CSV file
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-zinc-500">
                    Export from your bank, then import here. Supports single
                    amount or separate debit/credit columns.
                  </p>
                  <Button onClick={() => void pickFile()} disabled={loading}>
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    Browse files…
                  </Button>
                </CardContent>
              </Card>
            )}

            {step === 2 && (
              <MappingStep
                filePath={filePath}
                encoding={encoding}
                accounts={accounts}
                accountId={accountId}
                presetId={presetId}
                mapping={mapping}
                headerOptions={headerOptions}
                sampleRows={sampleRows}
                headers={headers}
                profileName={profileName}
                loading={loading}
                mappingValid={mappingValid}
                mappingHints={hints}
                onAccountChange={(id) => void onAccountChange(id)}
                onPresetChange={onPresetChange}
                onAmountModeChange={onAmountModeChange}
                onMappingChange={setMapping}
                onProfileNameChange={setProfileName}
                onBack={reset}
                onPreview={() => void runPreview()}
              />
            )}

            {step === 3 && preview && (
              <PreviewStep
                preview={preview}
                loading={loading}
                saveProfile={saveProfile}
                profileName={profileName}
                onSaveProfileChange={setSaveProfile}
                onProfileNameChange={setProfileName}
                onBack={() => setStep(2)}
                onCommit={() => void handleCommit()}
              />
            )}

            {step === 4 && (
              <Card className="max-w-lg">
                <CardContent className="space-y-4 py-8 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600/20">
                    <Check className="h-6 w-6 text-emerald-400" />
                  </div>
                  <p className="text-lg font-medium text-zinc-100">
                    Import complete
                  </p>
                  {success && (
                    <p className="text-sm text-zinc-500">{success}</p>
                  )}
                  <Button onClick={reset}>Import another file</Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        <aside className="hidden w-72 shrink-0 border-l border-zinc-800 bg-zinc-900/50 xl:block">
          <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
            <History className="h-4 w-4 text-zinc-500" />
            <h2 className="text-sm font-medium text-zinc-300">Import history</h2>
          </div>
          <div className="overflow-y-auto p-3">
            {history.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-zinc-600">
                No imports yet
              </p>
            ) : (
              <ul className="space-y-2">
                {history.map((entry) => (
                  <li
                    key={entry.id}
                    className="rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-2.5"
                  >
                    <p className="truncate text-xs font-medium text-zinc-300">
                      {entry.filename ?? "Unknown file"}
                    </p>
                    <p className="mt-0.5 text-[10px] text-zinc-500">
                      {entry.account_name ?? "—"} · {entry.row_count} rows
                    </p>
                    <p className="mt-1 flex items-center gap-1 text-[10px] text-zinc-600">
                      <Clock className="h-3 w-3" />
                      {formatHistoryDate(entry.imported_at)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function StepIndicator({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-2">
      {STEPS.map((s, i) => (
        <div key={s.id} className="flex items-center gap-2">
          <div
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium",
              step > s.id
                ? "bg-emerald-600 text-white"
                : step === s.id
                  ? "bg-emerald-600/20 text-emerald-400 ring-1 ring-emerald-600/50"
                  : "bg-zinc-800 text-zinc-500",
            )}
          >
            {step > s.id ? <Check className="h-3.5 w-3.5" /> : s.id}
          </div>
          <span
            className={cn(
              "text-xs",
              step >= s.id ? "text-zinc-300" : "text-zinc-600",
            )}
          >
            {s.label}
          </span>
          {i < STEPS.length - 1 && (
            <ChevronRight className="h-4 w-4 text-zinc-700" />
          )}
        </div>
      ))}
    </div>
  );
}

function MappingStep({
  filePath,
  encoding,
  accounts,
  accountId,
  presetId,
  mapping,
  headerOptions,
  sampleRows,
  headers,
  profileName,
  loading,
  mappingValid,
  mappingHints,
  onAccountChange,
  onPresetChange,
  onAmountModeChange,
  onMappingChange,
  onProfileNameChange,
  onBack,
  onPreview,
}: {
  filePath: string | null;
  encoding: string;
  accounts: Account[];
  accountId: string;
  presetId: string;
  mapping: ColumnMapping;
  headerOptions: { value: string; label: string }[];
  sampleRows: string[][];
  headers: string[];
  profileName: string;
  loading: boolean;
  mappingValid: boolean;
  mappingHints: string[];
  onAccountChange: (id: string) => void;
  onPresetChange: (id: string) => void;
  onAmountModeChange: (mode: AmountMappingMode) => void;
  onMappingChange: (m: ColumnMapping) => void;
  onProfileNameChange: (name: string) => void;
  onBack: () => void;
  onPreview: () => void;
}) {
  const isDebitCredit = mapping.amountMode === "debit_credit";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-zinc-200">
            <FileSpreadsheet className="h-4 w-4" />
            {filePath?.split("/").pop()}
            <span className="text-xs font-normal text-zinc-600">
              ({encoding})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Target account *"
              value={accountId}
              onChange={(e) => onAccountChange(e.target.value)}
              placeholder="Select account…"
              options={accounts.map((a) => ({
                value: String(a.id),
                label: a.name,
              }))}
            />
            <Select
              label="Bank format"
              value={presetId}
              onChange={(e) => onPresetChange(e.target.value)}
              options={BANK_PRESETS.map((p) => ({
                value: p.id,
                label: p.name,
              }))}
            />
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-zinc-400">
              Amount columns
            </p>
            <div className="flex gap-2">
              {(["single", "debit_credit"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onAmountModeChange(mode)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                    mapping.amountMode === mode
                      ? "border-emerald-600/50 bg-emerald-600/15 text-emerald-400"
                      : "border-zinc-700 text-zinc-500 hover:border-zinc-600",
                  )}
                >
                  {mode === "single" ? "Single amount" : "Debit + Credit"}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Date *"
              value={mapping.date}
              onChange={(e) =>
                onMappingChange({ ...mapping, date: e.target.value })
              }
              placeholder="Select column…"
              options={headerOptions}
              className={mappedClass(mapping.date)}
            />
            {isDebitCredit ? (
              <>
                <Select
                  label="Debit"
                  value={mapping.debit ?? ""}
                  onChange={(e) =>
                    onMappingChange({ ...mapping, debit: e.target.value })
                  }
                  placeholder="Withdrawals column…"
                  options={headerOptions}
                  className={mappedClass(mapping.debit)}
                />
                <Select
                  label="Credit"
                  value={mapping.credit ?? ""}
                  onChange={(e) =>
                    onMappingChange({ ...mapping, credit: e.target.value })
                  }
                  placeholder="Deposits column…"
                  options={headerOptions}
                  className={mappedClass(mapping.credit)}
                />
              </>
            ) : (
              <Select
                label="Amount *"
                value={mapping.amount}
                onChange={(e) =>
                  onMappingChange({ ...mapping, amount: e.target.value })
                }
                placeholder="Select column…"
                options={headerOptions}
                className={mappedClass(mapping.amount)}
              />
            )}
            <Select
              label="Memo"
              value={mapping.memo}
              onChange={(e) =>
                onMappingChange({ ...mapping, memo: e.target.value })
              }
              placeholder="Optional"
              options={headerOptions}
              className={mappedClass(mapping.memo)}
            />
            <Select
              label="Payee / Name"
              value={mapping.name}
              onChange={(e) =>
                onMappingChange({ ...mapping, name: e.target.value })
              }
              placeholder="Optional"
              options={headerOptions}
              className={mappedClass(mapping.name)}
            />
          </div>

          <Input
            label="Profile name (saved on import)"
            value={profileName}
            onChange={(e) => onProfileNameChange(e.target.value)}
            placeholder="e.g. Chequing CSV"
          />

          {sampleRows.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium text-zinc-500">
                Raw file sample (first 5 rows — not yet parsed)
              </p>
              <PreviewTable headers={headers} rows={sampleRows} />
            </div>
          )}

          <p className="text-sm text-zinc-500">
            When mapping looks right, continue to the review step. The{" "}
            <span className="text-zinc-400">Import … transactions</span> button
            appears there after duplicate checks finish.
          </p>

          {mappingHints.length > 0 && (
            <ul className="space-y-1 text-sm text-amber-400/90">
              {mappingHints.map((hint) => (
                <li key={hint}>• {hint}</li>
              ))}
            </ul>
          )}

          <div className="flex gap-3">
            <Button variant="outline" onClick={onBack}>
              Back
            </Button>
            <Button onClick={onPreview} disabled={!mappingValid || loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Review &amp; import →
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PreviewStep({
  preview,
  loading,
  saveProfile,
  profileName,
  onSaveProfileChange,
  onProfileNameChange,
  onBack,
  onCommit,
}: {
  preview: PreviewState;
  loading: boolean;
  saveProfile: boolean;
  profileName: string;
  onSaveProfileChange: (v: boolean) => void;
  onProfileNameChange: (v: string) => void;
  onBack: () => void;
  onCommit: () => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500">
        Review parsed transactions below, then confirm import.
      </p>
      <div className="flex flex-wrap gap-4">
        <StatCard label="New" value={preview.newCount} color="emerald" />
        <StatCard
          label="Duplicates"
          value={preview.duplicateCount}
          color="zinc"
        />
        <StatCard
          label="Conflicts"
          value={preview.conflictCount}
          color="amber"
        />
        {preview.invalidCount > 0 && (
          <StatCard label="Invalid" value={preview.invalidCount} color="red" />
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <PreviewTable
            headers={["Date", "Payee", "Memo", "Amount"]}
            rows={preview.rows.slice(0, 50).map((r) => [
              r.date,
              r.payee ?? "—",
              r.memo ?? "—",
              formatCents(r.amountCents),
            ])}
          />
        </CardContent>
      </Card>

      <label className="flex items-center gap-2 text-sm text-zinc-400">
        <input
          type="checkbox"
          checked={saveProfile}
          onChange={(e) => onSaveProfileChange(e.target.checked)}
          className="h-4 w-4 rounded border-zinc-600 bg-zinc-900 text-emerald-600"
        />
        <Save className="h-3.5 w-3.5" />
        Save column mapping as &ldquo;{profileName || "profile"}&rdquo;
      </label>
      {saveProfile && (
        <Input
          value={profileName}
          onChange={(e) => onProfileNameChange(e.target.value)}
          placeholder="Profile name"
          className="max-w-xs"
        />
      )}

      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button
          onClick={onCommit}
          disabled={loading || preview.newCount === 0}
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Import {preview.newCount} transactions
        </Button>
      </div>
    </div>
  );
}

function PreviewTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: string[][];
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-800">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-zinc-800 bg-zinc-900">
            {headers.map((h) => (
              <th
                key={h}
                className="px-3 py-2 text-left font-medium text-zinc-500"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr
              key={ri}
              className="border-b border-zinc-800/50 last:border-0"
            >
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-2 text-zinc-400">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function mappedClass(value: string | undefined) {
  return value ? "border-emerald-700/60 bg-emerald-950/20" : undefined;
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: "emerald" | "zinc" | "amber" | "red";
}) {
  const colors = {
    emerald: "text-emerald-400",
    zinc: "text-zinc-400",
    amber: "text-amber-400",
    red: "text-red-400",
  };
  return (
    <Card className="min-w-[120px]">
      <CardContent className="py-4">
        <p className="text-xs text-zinc-500">{label}</p>
        <p className={cn("tabular-nums text-xl font-semibold", colors[color])}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function formatHistoryDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}