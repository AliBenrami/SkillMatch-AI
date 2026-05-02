import { CheckCircle2, LogOut, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { SessionUser } from "@/lib/auth-model";

export function AmazonLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "amazon-logo compact" : "amazon-logo"} aria-label="Amazon">
      <span>amazon</span>
      <i aria-hidden="true" />
    </div>
  );
}

export function NavigationRail<TView extends string>({
  currentView,
  items,
  onSelect
}: {
  currentView: TView;
  items: Array<{ id: TView; label: string; icon: LucideIcon }>;
  onSelect: (view: TView) => void;
}) {
  return (
    <aside className="side-nav" aria-label="Primary">
      <AmazonLogo compact />
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            className={`nav-item ${currentView === item.id ? "active" : ""}`}
            key={item.id}
            onClick={() => onSelect(item.id)}
            title={item.label}
          >
            <Icon aria-hidden="true" />
            {item.label}
          </button>
        );
      })}
    </aside>
  );
}

export function AppHeader({
  children,
  user,
  onLogout
}: {
  children: ReactNode;
  user: SessionUser;
  onLogout: () => void;
}) {
  return (
    <header className="app-header">
      <div className="brand-block">
        <div>
          <AmazonLogo />
          <h1>Talent Match Console</h1>
        </div>
        {children}
      </div>
      <div className="audit-status">
        <CheckCircle2 aria-hidden="true" />
        <div>
          <strong>Session Protected</strong>
          <span>{user.name} ({user.role.replace("_", " ")})</span>
        </div>
      </div>
      <button className="icon-text-button" onClick={onLogout}>
        <LogOut aria-hidden="true" />
        Sign out
      </button>
    </header>
  );
}
