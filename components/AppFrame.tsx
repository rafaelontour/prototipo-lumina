"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  BookCheck,
  BriefcaseBusiness,
  FileCheck2,
  Home,
  ListTree,
  Loader2,
  LogIn,
  Menu,
  Moon,
  PanelLeftClose,
  Sun
} from "lucide-react";
import { useEffect, useState } from "react";
import { signInWithFixedCredentials } from "@/lib/auth";

type Theme = "light" | "dark";
type ToastState = {
  message: string;
  type: "success" | "error";
} | null;

const navItems = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/oiac-ia", label: "Oiac IA", icon: Bot },
  { href: "/documentos", label: "Documentos", icon: BriefcaseBusiness },
  { href: "/tipificacoes", label: "Tipificações", icon: ListTree },
  { href: "/conformidade-template", label: "Conformidade Template", icon: FileCheck2 },
  { href: "/conformidade-abnt", label: "Conformidade ABNT", icon: BookCheck }
];

export function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [theme, setTheme] = useState<Theme>("light");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  useEffect(() => {
    const storedTheme = window.localStorage.getItem("theme");
    const preferredTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    const nextTheme = storedTheme === "dark" || storedTheme === "light" ? storedTheme : preferredTheme;
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
  }, []);

  function toggleTheme() {
    setTheme((currentTheme) => {
      const nextTheme = currentTheme === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = nextTheme;
      window.localStorage.setItem("theme", nextTheme);
      return nextTheme;
    });
  }

  useEffect(() => {
    if (!toast) return;

    const timeout = window.setTimeout(() => {
      setToast(null);
    }, 3200);

    return () => window.clearTimeout(timeout);
  }, [toast]);

  async function handleLogin() {
    setIsLoggingIn(true);

    try {
      await signInWithFixedCredentials();
      setToast({ message: "Login realizado com sucesso.", type: "success" });
    } catch (error) {
      setToast({
        message: error instanceof Error ? error.message : "Não foi possível fazer login.",
        type: "error"
      });
    } finally {
      setIsLoggingIn(false);
    }
  }

  return (
    <main className={`app-shell ${isSidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <header className="app-header">
        <div className="app-header-left">
          <button
            className="sidebar-toggle"
            type="button"
            onClick={() => setIsSidebarCollapsed((value) => !value)}
            aria-label={isSidebarCollapsed ? "Expandir menu lateral" : "Recolher menu lateral"}
            title={isSidebarCollapsed ? "Expandir menu" : "Recolher menu"}
          >
            {isSidebarCollapsed ? <Menu size={20} /> : <PanelLeftClose size={20} />}
          </button>
          <Link className="app-header-brand" href="/" aria-label="Ir para inicio">
            <img className="theme-logo-light" src="/fiocruz_logos/lumina_azul.png" alt="Lumina" />
            <img className="theme-logo-dark" src="/fiocruz_logos/lumina_branco.png" alt="Lumina" />
          </Link>
        </div>
        <div className="app-header-actions">
          <button className="login-button" type="button" onClick={handleLogin} disabled={isLoggingIn}>
            {isLoggingIn ? <Loader2 className="spin" size={18} /> : <LogIn size={18} />}
            <span>Login</span>
          </button>
          <button className="theme-toggle" type="button" onClick={toggleTheme} aria-label="Alternar tema">
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            <span>{theme === "dark" ? "Claro" : "Escuro"}</span>
          </button>
        </div>
      </header>
      <aside className="side-nav" aria-label="Menu principal">
        <nav className="side-nav-list">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link className={`side-nav-link ${isActive ? "active" : ""}`} href={item.href} key={item.href} title={item.label}>
                <Icon size={20} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
      <section className="app-content">{children}</section>
      {toast && (
        <div className={`app-toast ${toast.type}`} role="status" aria-live="polite">
          {toast.message}
        </div>
      )}
    </main>
  );
}
