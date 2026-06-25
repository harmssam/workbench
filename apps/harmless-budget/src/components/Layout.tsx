import { useEffect } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { listen } from "@tauri-apps/api/event";
import {
  LayoutDashboard,
  Receipt,
  Upload,
  PiggyBank,
  BarChart3,
  Wand2,
  Landmark,
  FolderTree,
  Settings,
  Wallet,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useSidebarCollapsed } from "../hooks/useSidebarCollapsed";
import { cn } from "../lib/utils";

const navItems: {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
}[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/transactions", label: "Transactions", icon: Receipt },
  { to: "/import", label: "Import", icon: Upload },
  { to: "/budget", label: "Budget", icon: PiggyBank },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/rules", label: "Rules", icon: Wand2 },
  { to: "/accounts", label: "Accounts", icon: Landmark },
  { to: "/categories", label: "Categories", icon: FolderTree },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function Layout() {
  const navigate = useNavigate();
  const { collapsed, toggle } = useSidebarCollapsed();
  useKeyboardShortcuts();

  useEffect(() => {
    const unlisten = listen<string>("menu-navigate", (event) => {
      if (event.payload) navigate(event.payload);
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [navigate]);

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950">
      <aside
        className={cn(
          "flex shrink-0 flex-col border-r border-zinc-800 bg-zinc-900 transition-[width] duration-200",
          collapsed ? "w-[4.25rem]" : "w-56",
        )}
      >
        <div
          className={cn(
            "flex items-center border-b border-zinc-800 py-5",
            collapsed ? "justify-center px-2" : "gap-2.5 px-5",
          )}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-600/20">
            <Wallet className="h-4 w-4 text-emerald-400" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-sm font-semibold text-zinc-100">Harmless Budget</p>
              <p className="text-[10px] text-zinc-500">Local & private</p>
            </div>
          )}
        </div>

        <nav className="flex-1 space-y-0.5 p-2">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              title={collapsed ? label : undefined}
              className={({ isActive }) =>
                cn(
                  "flex items-center rounded-lg py-2 text-sm font-medium transition-colors",
                  collapsed ? "justify-center px-2" : "gap-3 px-3",
                  isActive
                    ? "bg-emerald-600/15 text-emerald-400"
                    : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200",
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="truncate">{label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-zinc-800 p-2">
          <button
            type="button"
            onClick={toggle}
            className={cn(
              "flex w-full items-center rounded-lg py-2 text-sm text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300",
              collapsed ? "justify-center px-2" : "gap-3 px-3",
            )}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4 shrink-0" />
            ) : (
              <>
                <PanelLeftClose className="h-4 w-4 shrink-0" />
                <span className="text-xs">Collapse</span>
              </>
            )}
          </button>
          {!collapsed && (
            <div className="space-y-2 px-3 pb-2 pt-1">
              <p className="text-[10px] leading-relaxed text-zinc-600">
                Your data stays on this device. No cloud sync.
              </p>
              <p className="text-[10px] text-zinc-700">
                ⌘1–7 navigate · ⌘I import
              </p>
            </div>
          )}
        </div>
      </aside>

      <main className="flex flex-1 flex-col overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}