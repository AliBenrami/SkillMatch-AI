import { CheckCircle2, LogOut, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { SessionUser } from "@/lib/auth-model";

export function AmazonLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "amazon-logo compact" : "amazon-logo"} aria-label="SkillMatch AI">
      <span>AI</span>
      {!compact && "SkillMatch"}
    </div>
  );
}

export function NavigationRail<TView extends string>({
  currentView,
  items,
  onSelect,
  onLogout
}: {
  currentView: TView;
  items: Array<{ id: TView; label: string; icon: LucideIcon }>;
  onSelect: (view: TView) => void;
  onLogout?: () => void;
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
      {onLogout ? (
        <div className="nav-logout">
          <button className="nav-item" onClick={onLogout} title="Sign out">
            <LogOut aria-hidden="true" />
            Sign out
          </button>
        </div>
      ) : null}
    </aside>
  );
}

export function AppHeader({
  children,
  user
}: {
  children: ReactNode;
  user: SessionUser;
}) {
  return (
    <header className="app-header">
      <div className="brand-block">
        <div>
          <AmazonLogo />
          <h1>SkillMatch AI</h1>
        </div>
        {children}
      </div>
      <div className="audit-status">
        <CheckCircle2 aria-hidden="true" />
        <div>
          <strong>Session protected</strong>
          <span>{user.name} &middot; {user.role.replace(/_/g, " ")}</span>
        </div>
      </div>
    </header>
  );
}
