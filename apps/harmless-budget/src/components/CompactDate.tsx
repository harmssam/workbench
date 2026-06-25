import { formatDateFull, formatDateShort } from "../lib/utils";

export function CompactDate({ date }: { date: string }) {
  return (
    <span className="tabular-nums" title={formatDateFull(date)}>
      {formatDateShort(date)}
    </span>
  );
}