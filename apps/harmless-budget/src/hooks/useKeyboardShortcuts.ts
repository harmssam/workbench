import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const SHORTCUTS: Record<string, string> = {
  "1": "/",
  "2": "/transactions",
  "3": "/import",
  "4": "/budget",
  "5": "/rules",
  "6": "/accounts",
  "7": "/settings",
};

export function useKeyboardShortcuts() {
  const navigate = useNavigate();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) {
        return;
      }

      if (e.key === "i") {
        e.preventDefault();
        navigate("/import");
        return;
      }

      const route = SHORTCUTS[e.key];
      if (route) {
        e.preventDefault();
        navigate(route);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate]);
}