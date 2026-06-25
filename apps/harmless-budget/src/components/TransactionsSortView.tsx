import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import {
  GripVertical,
  Loader2,
  PartyPopper,
  SkipForward,
  Sparkles,
} from "lucide-react";
import type { Transaction } from "../lib/api";
import type { CategoryOptionGroup } from "../lib/categories";
import { formatCents } from "../lib/money";
import { cn } from "../lib/utils";
import { CompactDate } from "./CompactDate";
import { TruncatedText } from "./TruncatedText";
import { Button } from "./ui/Button";
import { useDragAutoScroll } from "../hooks/useDragAutoScroll";

const BATCH_SIZE = 3;
const DRAG_THRESHOLD_PX = 6;

function matchesBinFilter(
  groupLabel: string,
  optionLabel: string,
  filter: string,
): boolean {
  const query = filter.trim().toLowerCase();
  if (!query) return true;
  const haystack = `${groupLabel} ${optionLabel}`.toLowerCase();
  return query
    .split(/\s+/)
    .every((token) => haystack.includes(token));
}

function filterCategoryGroups(
  groups: CategoryOptionGroup[],
  filter: string,
): CategoryOptionGroup[] {
  if (!filter.trim()) return groups;
  return groups
    .map((group) => ({
      ...group,
      options: group.options.filter((opt) =>
        matchesBinFilter(group.label, opt.label, filter),
      ),
    }))
    .filter((group) => group.options.length > 0);
}

interface TransactionsSortViewProps {
  sessionKey: string;
  inbox: Transaction[];
  categoryGroups: CategoryOptionGroup[];
  updatingId: number | null;
  scrollContainerRef: RefObject<HTMLElement | null>;
  onCategorize: (transactionId: number, categoryId: string) => void;
}

export function TransactionsSortView({
  sessionKey,
  inbox,
  categoryGroups,
  updatingId,
  scrollContainerRef,
  onCategorize,
}: TransactionsSortViewProps) {
  const [batchIndex, setBatchIndex] = useState(0);
  const [activeDropZone, setActiveDropZone] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [binFilter, setBinFilter] = useState("");
  const [selectedTxnId, setSelectedTxnId] = useState<number | null>(null);
  const [ghostPos, setGhostPos] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [celebrateBin, setCelebrateBin] = useState<string | null>(null);
  const [binsGlowing, setBinsGlowing] = useState(false);
  const celebrateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draggingIdRef = useRef<number | null>(null);
  const pointerXRef = useRef(0);
  const pointerYRef = useRef(0);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const didDragRef = useRef(false);

  const getClientY = useCallback(() => pointerYRef.current, []);
  useDragAutoScroll(draggingId !== null, scrollContainerRef, getClientY);

  const batchCount = Math.max(1, Math.ceil(inbox.length / BATCH_SIZE));
  const safeBatchIndex = Math.min(batchIndex, batchCount - 1);

  const batch = useMemo(
    () =>
      inbox.slice(
        safeBatchIndex * BATCH_SIZE,
        safeBatchIndex * BATCH_SIZE + BATCH_SIZE,
      ),
    [inbox, safeBatchIndex],
  );

  const draggingTxn = useMemo(
    () => inbox.find((t) => t.id === draggingId) ?? null,
    [inbox, draggingId],
  );

  const filteredCategoryGroups = useMemo(
    () => filterCategoryGroups(categoryGroups, binFilter),
    [categoryGroups, binFilter],
  );

  const visibleBinCount = useMemo(
    () =>
      filteredCategoryGroups.reduce(
        (sum, group) => sum + group.options.length,
        0,
      ),
    [filteredCategoryGroups],
  );

  const isAssigning = isDragging || selectedTxnId !== null;

  const [queueTotal, setQueueTotal] = useState(0);

  useEffect(() => {
    setBatchIndex(0);
    if (inbox.length > 0) {
      setQueueTotal(inbox.length);
    } else {
      setQueueTotal(0);
    }
  }, [sessionKey]);

  useEffect(() => {
    if (queueTotal === 0 && inbox.length > 0) {
      setQueueTotal(inbox.length);
    }
    if (inbox.length === 0) {
      setQueueTotal(0);
      setBatchIndex(0);
      setSelectedTxnId(null);
    }
  }, [inbox.length, queueTotal]);

  useEffect(() => {
    setBatchIndex((current) => Math.min(current, Math.max(0, batchCount - 1)));
  }, [batchCount]);

  useEffect(() => {
    if (selectedTxnId && !inbox.some((t) => t.id === selectedTxnId)) {
      setSelectedTxnId(null);
      setBinFilter("");
      setBinsGlowing(false);
    }
  }, [inbox, selectedTxnId]);

  const progressPct =
    queueTotal > 0
      ? Math.round(((queueTotal - inbox.length) / queueTotal) * 100)
      : inbox.length === 0
        ? 100
        : 0;

  useEffect(() => {
    return () => {
      if (celebrateTimer.current) clearTimeout(celebrateTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!isDragging) return;
    setActiveDropZone(
      hitTestBin(pointerXRef.current, pointerYRef.current),
    );
  }, [binFilter, isDragging]);

  useEffect(() => {
    if (!isAssigning) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === "Escape") {
        event.preventDefault();
        if (binFilter) setBinFilter("");
        else {
          setSelectedTxnId(null);
          setBinsGlowing(false);
          endDragGesture();
        }
        return;
      }

      if (event.key === "Backspace") {
        event.preventDefault();
        setBinFilter((current) => current.slice(0, -1));
        return;
      }

      if (event.key.length === 1) {
        event.preventDefault();
        setBinFilter((current) => current + event.key);
      }
    }

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () =>
      window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [isAssigning, binFilter]);

  function hitTestBin(clientX: number, clientY: number): string | null {
    const target = document.elementFromPoint(clientX, clientY);
    const bin = target?.closest("[data-category-id]") as HTMLElement | null;
    return bin?.dataset.categoryId ?? null;
  }

  function celebrate(categoryId: string) {
    setCelebrateBin(categoryId);
    if (celebrateTimer.current) clearTimeout(celebrateTimer.current);
    celebrateTimer.current = setTimeout(() => setCelebrateBin(null), 700);
  }

  function endDragGesture() {
    draggingIdRef.current = null;
    dragStartRef.current = null;
    didDragRef.current = false;
    setDraggingId(null);
    setIsDragging(false);
    setGhostPos(null);
    setActiveDropZone(null);
  }

  function clearAssignment() {
    endDragGesture();
    setSelectedTxnId(null);
    setBinFilter("");
    setBinsGlowing(false);
  }

  function assignToCategory(txnId: number, categoryId: string) {
    celebrate(categoryId);
    onCategorize(txnId, categoryId);
    clearAssignment();
  }

  function handlePointerDown(event: React.PointerEvent, txnId: number) {
    if (updatingId === txnId) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingIdRef.current = txnId;
    dragStartRef.current = { x: event.clientX, y: event.clientY };
    didDragRef.current = false;
    pointerXRef.current = event.clientX;
    pointerYRef.current = event.clientY;
    setDraggingId(txnId);
    setGhostPos({ x: event.clientX, y: event.clientY });
  }

  function handlePointerMove(event: React.PointerEvent) {
    if (draggingIdRef.current === null) return;
    pointerXRef.current = event.clientX;
    pointerYRef.current = event.clientY;
    setGhostPos({ x: event.clientX, y: event.clientY });

    const start = dragStartRef.current;
    if (
      start &&
      Math.hypot(event.clientX - start.x, event.clientY - start.y) >=
        DRAG_THRESHOLD_PX
    ) {
      didDragRef.current = true;
      setIsDragging(true);
      setBinsGlowing(true);
    }

    setActiveDropZone(hitTestBin(event.clientX, event.clientY));
  }

  function handlePointerUp(event: React.PointerEvent, txnId: number) {
    if (draggingIdRef.current !== txnId) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const categoryId = hitTestBin(event.clientX, event.clientY);

    if (didDragRef.current && categoryId) {
      assignToCategory(txnId, categoryId);
    } else if (!didDragRef.current) {
      setSelectedTxnId((current) => {
        const next = current === txnId ? null : txnId;
        setBinsGlowing(next !== null);
        if (next === null) setBinFilter("");
        return next;
      });
      endDragGesture();
      return;
    }

    endDragGesture();
  }

  function handlePointerCancel(event: React.PointerEvent) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    endDragGesture();
  }

  function handleBinClick(categoryId: string) {
    if (selectedTxnId) {
      assignToCategory(selectedTxnId, categoryId);
    }
  }

  function handleSkip() {
    if (inbox.length <= BATCH_SIZE) return;
    setBatchIndex((current) => (current + 1) % batchCount);
    setSelectedTxnId(null);
    setBinFilter("");
    setBinsGlowing(false);
  }

  return (
    <div className="space-y-6">
      {isDragging &&
        draggingTxn &&
        ghostPos &&
        createPortal(
          <DragGhost txn={draggingTxn} x={ghostPos.x} y={ghostPos.y} />,
          document.body,
        )}

      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50">
        <div className="h-1.5 bg-zinc-800">
          <div
            className="h-full bg-gradient-to-r from-emerald-600 via-teal-400 to-emerald-300 transition-all duration-500 ease-out"
            style={{
              width: `${Math.max(inbox.length === 0 ? 100 : 4, progressPct)}%`,
            }}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-400" />
            <p className="text-sm text-zinc-300">
              {inbox.length === 0 ? (
                <span className="font-medium text-emerald-400">
                  Queue cleared!
                </span>
              ) : (
                <>
                  <span className="font-semibold tabular-nums text-zinc-100">
                    {inbox.length}
                  </span>{" "}
                  left to sort
                </>
              )}
            </p>
          </div>
          {inbox.length > 0 && (
            <p className="text-xs text-zinc-500">
              Batch {safeBatchIndex + 1} of {batchCount}
            </p>
          )}
        </div>
      </div>

      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium text-zinc-200">
              Pick one — drag it home
            </h2>
            <p className="mt-0.5 text-xs text-zinc-600">
              Click or drag a card — type to filter bins, then drop or tap a
              category.
            </p>
          </div>
          {inbox.length > BATCH_SIZE && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSkip}
              className="shrink-0"
            >
              <SkipForward className="h-4 w-4" />
              Skip batch
            </Button>
          )}
        </div>

        {inbox.length === 0 ? (
          <div className="relative overflow-hidden rounded-2xl border border-emerald-900/40 bg-gradient-to-br from-emerald-950/40 via-zinc-900 to-zinc-950 px-6 py-14 text-center">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(52,211,153,0.15),transparent_55%)]" />
            <PartyPopper className="mx-auto h-10 w-10 text-emerald-400" />
            <p className="mt-4 text-lg font-semibold text-zinc-100">
              All sorted for now
            </p>
            <p className="mt-1 text-sm text-zinc-500">
              Nice work — analytics will love you.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {batch.map((txn, index) => (
              <TransactionChip
                key={txn.id}
                txn={txn}
                slot={index + 1}
                selected={selectedTxnId === txn.id}
                dragging={draggingId === txn.id && isDragging}
                updating={updatingId === txn.id}
                onPointerDown={(e) => handlePointerDown(e, txn.id)}
                onPointerMove={handlePointerMove}
                onPointerUp={(e) => handlePointerUp(e, txn.id)}
                onPointerCancel={handlePointerCancel}
              />
            ))}
            {batch.length < BATCH_SIZE &&
              Array.from({ length: BATCH_SIZE - batch.length }).map((_, i) => (
                <div
                  key={`placeholder-${i}`}
                  className="hidden min-h-[6.5rem] rounded-xl border border-dashed border-zinc-800/80 bg-zinc-900/20 md:block"
                />
              ))}
          </div>
        )}
      </section>

      {inbox.length > 0 && (
        <section className="space-y-6">
          {isAssigning && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-center gap-2 rounded-lg border border-emerald-900/40 bg-emerald-950/25 px-3 py-2">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                <span className="text-xs text-emerald-400/90">
                  {isDragging ? "Type to filter bins" : "Type to filter · tap a bin"}
                </span>
                <span className="min-w-[4rem] rounded-md bg-zinc-900/80 px-2 py-0.5 font-mono text-sm text-emerald-300">
                  {binFilter || "…"}
                  <span className="animate-pulse text-emerald-500">|</span>
                </span>
                {binFilter && (
                  <span className="text-xs text-zinc-500">
                    {visibleBinCount} match{visibleBinCount === 1 ? "" : "es"} ·
                    Esc clears
                  </span>
                )}
              </div>
              {isDragging && (
                <p className="text-center text-xs text-zinc-600">
                  Drag near screen edges to scroll · release over a glowing bin
                </p>
              )}
            </div>
          )}

          {isAssigning && binFilter && visibleBinCount === 0 && (
            <p className="rounded-lg border border-dashed border-zinc-800 bg-zinc-900/40 px-4 py-8 text-center text-sm text-zinc-500">
              No categories match &ldquo;{binFilter}&rdquo; — backspace to
              edit, Esc to clear
            </p>
          )}

          {filteredCategoryGroups.map((group) => (
            <div key={group.label}>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                {group.label}
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {group.options.map((option) => (
                  <CategoryBin
                    key={option.value}
                    categoryId={option.value}
                    label={option.label}
                    active={activeDropZone === option.value}
                    celebrating={celebrateBin === option.value}
                    glowing={binsGlowing || selectedTxnId !== null}
                    tapReady={selectedTxnId !== null}
                    filtered={Boolean(binFilter.trim())}
                    onClick={() => handleBinClick(option.value)}
                  />
                ))}
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function TransactionChip({
  txn,
  slot,
  selected,
  dragging,
  updating,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  txn: Transaction;
  slot: number;
  selected: boolean;
  dragging: boolean;
  updating: boolean;
  onPointerDown: (event: React.PointerEvent) => void;
  onPointerMove: (event: React.PointerEvent) => void;
  onPointerUp: (event: React.PointerEvent) => void;
  onPointerCancel: (event: React.PointerEvent) => void;
}) {
  const label = txn.payee?.trim() || txn.memo?.trim() || "(no description)";
  const isExpense = txn.amount_cents < 0;

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      style={{ animationDelay: `${slot * 80}ms`, touchAction: "none" }}
      className={cn(
        "sort-chip-enter relative flex cursor-grab flex-col gap-2 rounded-xl border px-4 py-3 shadow-lg select-none active:cursor-grabbing",
        "bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950",
        isExpense
          ? "border-red-900/40 shadow-red-950/20"
          : "border-emerald-900/40 shadow-emerald-950/20",
        selected && "ring-2 ring-amber-400/60",
        dragging && "scale-95 opacity-30",
        updating && "cursor-wait opacity-70",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs font-bold tabular-nums text-zinc-400">
          {slot}
        </span>
        <GripVertical className="h-4 w-4 shrink-0 text-zinc-600" />
      </div>
      <div className="min-w-0">
        <p className="line-clamp-2 text-sm font-semibold leading-snug text-zinc-100">
          {label}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <CompactDate date={txn.date} />
          <span
            className={cn(
              "rounded-md px-1.5 py-0.5 tabular-nums font-semibold",
              txn.amount_cents >= 0
                ? "bg-emerald-950/60 text-emerald-400"
                : "bg-red-950/50 text-red-400",
            )}
          >
            {formatCents(txn.amount_cents)}
          </span>
        </div>
        {txn.memo && txn.payee && (
          <TruncatedText
            text={txn.memo}
            className="mt-2 text-[11px] text-zinc-500"
          />
        )}
      </div>
      {updating && (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-zinc-950/60">
          <Loader2 className="h-5 w-5 animate-spin text-emerald-400" />
        </div>
      )}
    </div>
  );
}

function DragGhost({
  txn,
  x,
  y,
}: {
  txn: Transaction;
  x: number;
  y: number;
}) {
  const label = txn.payee?.trim() || txn.memo?.trim() || "(no description)";

  return (
    <div
      className="pointer-events-none fixed z-[9999] w-56 rounded-xl border border-emerald-500/60 bg-zinc-900/95 px-3 py-2 shadow-2xl shadow-emerald-500/20 ring-2 ring-emerald-400/40"
      style={{ left: x + 14, top: y + 14 }}
    >
      <p className="truncate text-sm font-semibold text-zinc-100">{label}</p>
      <p className="mt-1 tabular-nums text-xs text-emerald-400">
        {formatCents(txn.amount_cents)}
      </p>
    </div>
  );
}

function CategoryBin({
  categoryId,
  label,
  active,
  celebrating,
  glowing,
  tapReady,
  filtered,
  onClick,
}: {
  categoryId: string;
  label: string;
  active: boolean;
  celebrating: boolean;
  glowing: boolean;
  tapReady: boolean;
  filtered?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-[5rem] w-full flex-col justify-center rounded-xl border border-dashed px-3 py-3 text-left transition-all duration-150",
        filtered &&
          !active &&
          !celebrating &&
          "border-sky-800/50 bg-sky-950/20",
        celebrating &&
          "scale-105 border-emerald-400 bg-emerald-500/20 shadow-lg shadow-emerald-500/20",
        active &&
          !celebrating &&
          "scale-[1.04] border-emerald-400 bg-emerald-950/50 shadow-md shadow-emerald-500/15 ring-2 ring-emerald-400/60",
        !active &&
          !celebrating &&
          tapReady &&
          "border-amber-700/50 bg-amber-950/20 hover:border-emerald-400/70 hover:bg-emerald-950/30",
        !active &&
          !celebrating &&
          !tapReady &&
          glowing &&
          "border-zinc-600 bg-zinc-900/60",
        !active &&
          !celebrating &&
          !tapReady &&
          !glowing &&
          "border-zinc-800 bg-zinc-900/40 hover:border-zinc-600 hover:bg-zinc-900/70",
      )}
      data-category-id={categoryId}
    >
      <p className="text-sm font-medium text-zinc-200">{label}</p>
      <p
        className={cn(
          "mt-1 text-[11px] transition-colors",
          active || celebrating
            ? "text-emerald-300"
            : tapReady
              ? "text-amber-400/80"
              : "text-zinc-600",
        )}
      >
        {celebrating
          ? "Nice!"
          : active
            ? "Release to categorize"
            : tapReady
              ? "Tap to assign"
              : "Drop here"}
      </p>
    </button>
  );
}