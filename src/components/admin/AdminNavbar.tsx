// components/admin/AdminNavbar.tsx
//
// Shared top-bar for every admin page.
//
// Usage – Dashboard (no back arrow, owns its own refresh):
//   <AdminNavbar
//     onRefresh={() => { load(); operational.refresh(); }}
//     refreshing={loading || opLoading}
//   />
//
// Usage – inner pages (back arrow + optional page-specific right slot):
//   <AdminNavbar rightSlot={<button …>New client</button>} />
//
// The `title` / `subtitle` props let each page push its own heading into the
// shared bar so the left side always reads consistently.

import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Menu,
  X,
  RefreshCw,
  Calendar,
  Users,
  Settings2,
  CreditCard,
  FileText,
  LayoutDashboard,
  History,
} from 'lucide-react';

// ── Nav items ─────────────────────────────────────────────────────────────────

interface NavItem {
  label: string;
  to: string;
  icon: React.ElementType;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', to: '/admin',          icon: LayoutDashboard },
  { label: 'Calendar',  to: '/admin/calendar', icon: Calendar },
  { label: 'Clients',   to: '/admin/clients',  icon: Users },
  { label: 'Staff',     to: '/admin/staff',    icon: Users },
  { label: 'Payments',  to: '/admin/payments', icon: CreditCard },
  { label: 'Invoices',  to: '/admin/invoices', icon: FileText },
  { label: 'Activity',  to: '/admin/activity', icon: History },
  { label: 'Settings',  to: '/admin/settings', icon: Settings2 },
];

// ── Props ─────────────────────────────────────────────────────────────────────

interface AdminNavbarProps {
  /** Page title shown in the left section (after the brand label). */
  title?: string;
  /** Small label above the title (e.g. "Finance", "Operations"). */
  sectionLabel?: string;
  /**
   * Callback for the refresh button.
   * When omitted the refresh button is hidden.
   */
  onRefresh?: () => void;
  /** Controls the spin animation on the refresh icon. */
  refreshing?: boolean;
  /**
   * Extra controls rendered to the right of the refresh button (desktop).
   * Use this for page-specific actions such as "New client", "Save settings", etc.
   */
  rightSlot?: React.ReactNode;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminNavbar({
  title = 'Admin Dashboard',
  sectionLabel = 'Demo Cleaning Co.',
  onRefresh,
  refreshing = false,
  rightSlot,
}: AdminNavbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();

  // Exact match for /admin, prefix match for everything else
  function isActive(to: string) {
    if (to === '/admin') return pathname === '/admin';
    return pathname.startsWith(to);
  }

  return (
    <div className="bg-navy text-white px-4 sm:px-6 py-4 sm:py-5">
      <div className="flex items-center justify-between gap-3">

        {/* ── Left: brand + title ─────────────────────────────────────────── */}
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/admin" className="flex-shrink-0">
            <p className="text-gold text-xs font-semibold uppercase tracking-widest leading-none mb-0.5">
              {sectionLabel}
            </p>
            <h1 className="text-lg sm:text-xl font-bold leading-tight">{title}</h1>
          </Link>
        </div>

        {/* ── Right: desktop nav + actions ────────────────────────────────── */}
        <div className="flex items-center gap-1 flex-shrink-0">

          {/* Desktop nav */}
          <nav className="hidden sm:flex items-center gap-0.5 mr-1" aria-label="Admin navigation">
            {NAV_ITEMS.filter(n => n.label !== 'Dashboard').map(({ label, to }) => (
              <Link
                key={to}
                to={to}
                className={[
                  'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap',
                  isActive(to)
                    ? 'bg-white/15 text-white'
                    : 'text-white/60 hover:text-white hover:bg-white/10',
                ].join(' ')}
              >
                {label}
              </Link>
            ))}
          </nav>

          {/* Page-specific right actions (desktop) */}
          {rightSlot && (
            <div className="hidden sm:flex items-center gap-2 ml-1">
              {rightSlot}
            </div>
          )}

          {/* Refresh */}
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={refreshing}
              title="Refresh"
              className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white/70 hover:text-white disabled:opacity-50"
            >
              <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            </button>
          )}

          {/* Mobile hamburger */}
          <button
            onClick={() => setMenuOpen(v => !v)}
            className="sm:hidden p-2 rounded-lg hover:bg-white/10 transition-colors text-white/70 hover:text-white"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          >
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {/* ── Mobile dropdown ─────────────────────────────────────────────────── */}
      {menuOpen && (
        <nav className="sm:hidden mt-3 pt-3 border-t border-white/10 flex flex-col gap-0.5" aria-label="Admin navigation mobile">
          {NAV_ITEMS.map(({ label, to, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              onClick={() => setMenuOpen(false)}
              className={[
                'flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive(to)
                  ? 'bg-white/15 text-white'
                  : 'text-white/70 hover:text-white hover:bg-white/10',
              ].join(' ')}
            >
              <Icon size={15} />
              {label}
            </Link>
          ))}

          {/* Page-specific actions also exposed on mobile */}
          {rightSlot && (
            <div className="mt-2 pt-2 border-t border-white/10 flex flex-col gap-1">
              {rightSlot}
            </div>
          )}
        </nav>
      )}
    </div>
  );
}