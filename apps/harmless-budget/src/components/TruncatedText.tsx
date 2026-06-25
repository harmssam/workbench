import { cn } from "../lib/utils";

interface TruncatedTextProps {
  text: string | null | undefined;
  className?: string;
  empty?: string;
}

export function TruncatedText({
  text,
  className,
  empty = "—",
}: TruncatedTextProps) {
  const display = text?.trim() ? text : empty;
  const showTip = Boolean(text?.trim());

  return (
    <span
      className={cn("block min-w-0 truncate", className)}
      title={showTip ? text! : undefined}
    >
      {display}
    </span>
  );
}