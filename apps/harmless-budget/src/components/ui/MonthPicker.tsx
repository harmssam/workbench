import { useRef } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { cn, formatMonthLabel, offsetMonthKey } from "../../lib/utils";

export interface MonthPickerProps {
  value: string;
  onChange: (monthKey: string) => void;
  label?: string;
  className?: string;
  id?: string;
}

export function MonthPicker({
  value,
  onChange,
  label,
  className,
  id,
}: MonthPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pickerId = id ?? label?.toLowerCase().replace(/\s+/g, "-");

  function openPicker() {
    const input = inputRef.current;
    if (!input) return;
    if (typeof input.showPicker === "function") {
      try {
        input.showPicker();
        return;
      } catch {
        // WebKit may throw if not triggered from a direct user gesture.
      }
    }
    input.click();
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <span
          id={pickerId ? `${pickerId}-label` : undefined}
          className="text-xs font-medium text-zinc-400"
        >
          {label}
        </span>
      )}
      <div className="inline-flex items-center rounded-lg border border-zinc-700 bg-zinc-900">
        <button
          type="button"
          onClick={() => onChange(offsetMonthKey(value, -1))}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-l-lg text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={openPicker}
          className="flex h-9 min-w-[9.5rem] items-center justify-center gap-2 border-x border-zinc-700 px-3 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-800/80"
          aria-labelledby={label && pickerId ? `${pickerId}-label` : undefined}
        >
          <Calendar className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
          <span className="whitespace-nowrap tabular-nums">
            {formatMonthLabel(value)}
          </span>
        </button>
        <input
          ref={inputRef}
          id={pickerId}
          type="month"
          value={value}
          onChange={(e) => {
            if (e.target.value) onChange(e.target.value);
          }}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
        />
        <button
          type="button"
          onClick={() => onChange(offsetMonthKey(value, 1))}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-r-lg text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}