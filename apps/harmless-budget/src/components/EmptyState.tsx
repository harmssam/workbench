import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "./ui/Button";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: { label: string; to: string };
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-800/80 ring-1 ring-zinc-700/50">
        <Icon className="h-7 w-7 text-zinc-500" strokeWidth={1.5} />
      </div>
      <h3 className="text-base font-medium text-zinc-200">{title}</h3>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-zinc-500">
        {description}
      </p>
      {action && (
        <Link to={action.to} className="mt-6">
          <Button>{action.label}</Button>
        </Link>
      )}
    </div>
  );
}