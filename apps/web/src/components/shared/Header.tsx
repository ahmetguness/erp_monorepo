'use client';

import { ChevronDown, LogOut, PanelLeft, PanelLeftClose } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useUIStore } from '@/store/ui.store';
import { useCurrentUser, useLogout } from '@/hooks/useAuth';
import { cn, initials } from '@/lib/utils';
import { GlobalSearch } from './GlobalSearch';
import { NotificationDropdown } from './NotificationDropdown';
import { Tooltip } from '@/components/ui/Tooltip';
import { Breadcrumb } from './Breadcrumb';

// ─────────────────────────────────────────────
// User dropdown
// ─────────────────────────────────────────────

function UserDropdown() {
  const { user } = useCurrentUser();
  const logout = useLogout();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!user) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-800 transition-colors"
        aria-expanded={open}
        aria-haspopup="true"
      >
        {/* Avatar */}
        <div className="w-7 h-7 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center text-xs font-semibold shrink-0">
          {initials(user.name)}
        </div>
        <span className="text-sm text-slate-300 max-w-[120px] truncate hidden sm:block">
          {user.name}
        </span>
        <ChevronDown
          className={cn('w-3.5 h-3.5 text-slate-500 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-48 bg-slate-900 border border-slate-800 rounded-xl shadow-xl z-50 py-1 overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-800">
            <p className="text-sm font-medium text-slate-200 truncate">{user.name}</p>
            <p className="text-xs text-slate-500 truncate">{user.email}</p>
          </div>
          <button
            onClick={() => { setOpen(false); logout(); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-400 hover:text-red-400 hover:bg-red-500/5 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Çıkış Yap
          </button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Sidebar Toggle Button
// ─────────────────────────────────────────────

function SidebarToggle() {
  const sidebarMode = useUIStore((s) => s.sidebarMode);
  const cycleSidebarMode = useUIStore((s) => s.cycleSidebarMode);
  const setSidebarMode = useUIStore((s) => s.setSidebarMode);

  const isExpanded = sidebarMode === 'expanded';
  const tooltipLabel =
    sidebarMode === 'hidden'
      ? 'Menüyü göster'
      : sidebarMode === 'collapsed'
      ? 'Menüyü genişlet'
      : 'Menüyü daralt';

  return (
    <Tooltip content={tooltipLabel} placement="bottom">
      <button
        onClick={cycleSidebarMode}
        onDoubleClick={() => setSidebarMode(sidebarMode === 'hidden' ? 'expanded' : 'hidden')}
        aria-label={tooltipLabel}
        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
      >
        {isExpanded ? (
          <PanelLeftClose className="w-5 h-5" />
        ) : (
          <PanelLeft className="w-5 h-5" />
        )}
      </button>
    </Tooltip>
  );
}

// ─────────────────────────────────────────────
// Header
// ─────────────────────────────────────────────

export function Header() {
  return (
    <header className="h-14 flex items-center justify-between gap-3 px-4 bg-slate-900 border-b border-slate-800 shrink-0">
      {/* Left section: Sidebar toggle & Breadcrumb */}
      <div className="flex items-center gap-3 min-w-0">
        <SidebarToggle />
        <Breadcrumb />
      </div>

      {/* Center / Search */}
      <div className="flex-1 max-w-md mx-2">
        <GlobalSearch />
      </div>

      {/* Right section: Notifications & User */}
      <div className="flex items-center gap-2 shrink-0">
        <NotificationDropdown />
        <UserDropdown />
      </div>
    </header>
  );
}
