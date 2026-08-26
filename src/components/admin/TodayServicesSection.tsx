// src/components/admin/TodayServicesSection.tsx
//
// E1-S3 — Lista de próximos servicios del día
//
// Satisfies:
//   CA1 – list ordered by start time; shows time, duration, client name,
//         service-type badge, team label
//   CA2 – "View calendar" link to /admin/calendar
//   CA3 – empty state with "+ New service" CTA

import { Link }       from 'react-router-dom';
import { Calendar, ArrowRight, Clock, AlertCircle } from 'lucide-react';

import { type TodayService } from '../../hooks/useOperationalData';

// ── Service-type badge ────────────────────────────────────────────────────────

const TYPE_BADGE: Record<string, string> = {
  'Commercial':        'bg-blue-50   text-blue-700',
  'Post-construction': 'bg-orange-50 text-orange-700',
  'Special':           'bg-purple-50 text-purple-700',
  'Residential':       'bg-emerald-50 text-emerald-700',
};

function TypeBadge({ type }: { type: string }) {
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${TYPE_BADGE[type] ?? 'bg-gray-100 text-gray-500'}`}>
      {type}
    </span>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  events:   TodayService[];
  loading:  boolean;
  error:    string | null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TodayServicesSection({ events, loading, error }: Props) {
  const visible = events.slice(0, 8);
  const hasMore = events.length > 8;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="px-4 sm:px-6 py-4 flex items-center justify-between border-b border-gray-50">
        <h2 className="font-bold text-navy text-sm sm:text-base flex items-center gap-2">
          <Calendar size={15} className="text-gold" />
          Today's Services
          {!loading && events.length > 0 && (
            <span className="ml-1 bg-navy/10 text-navy text-xs font-bold px-1.5 py-0.5 rounded-full">
              {events.length}
            </span>
          )}
        </h2>
        <Link
          to="/admin/calendar"
          className="text-xs text-gold hover:underline flex items-center gap-1"
        >
          View calendar <ArrowRight size={12} />
        </Link>
      </div>

      {/* ── Error ──────────────────────────────────────────────────────────── */}
      {error && (
        <div className="px-4 sm:px-6 py-4 flex items-center gap-2 text-sm text-amber-700">
          <AlertCircle size={15} className="flex-shrink-0" />
          Could not load today's services: {error}
        </div>
      )}

      {/* ── Loading skeleton ───────────────────────────────────────────────── */}
      {loading && !error && (
        <ul className="divide-y divide-gray-50">
          {[...Array(3)].map((_, i) => (
            <li key={i} className="px-4 sm:px-6 py-3 flex items-center gap-3 animate-pulse">
              <div className="min-w-[52px] space-y-1.5">
                <div className="h-3.5 w-10 bg-gray-100 rounded" />
                <div className="h-2.5 w-6  bg-gray-100 rounded" />
              </div>
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 w-40 bg-gray-100 rounded" />
                <div className="h-2.5 w-24 bg-gray-100 rounded" />
              </div>
              <div className="h-5 w-20 bg-gray-100 rounded-full" />
            </li>
          ))}
        </ul>
      )}

      {/* ── CA3: Empty state ───────────────────────────────────────────────── */}
      {!loading && !error && events.length === 0 && (
        <div className="px-4 sm:px-6 py-8 text-center">
          <Clock size={28} className="mx-auto text-gray-200 mb-3" />
          <p className="text-sm text-gray-400">No services scheduled for today</p>
          <Link
            to="/admin/calendar"
            className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-gold hover:underline"
          >
            + New service
          </Link>
        </div>
      )}

      {/* ── CA1: Event list ────────────────────────────────────────────────── */}
      {!loading && !error && events.length > 0 && (
        <>
          <ul className="divide-y divide-gray-50">
            {visible.map(svc => {
              const startTime = new Date(svc.startIso).toLocaleTimeString("en-CA", {
                timeZone: "America/Vancouver",
                hour: "2-digit", minute: "2-digit", hour12: false,
              });
              const durLabel  = svc.durationH > 0
                ? svc.durationH % 1 === 0
                  ? `${svc.durationH}h`
                  : `${svc.durationH.toFixed(1)}h`
                : '—';

              return (
                <li
                  key={svc.id}
                  className="px-4 sm:px-6 py-3 flex items-center gap-3 hover:bg-gray-50/50 transition-colors"
                >
                  {/* Time + duration */}
                  <div className="min-w-[52px] text-center flex-shrink-0">
                    <p className="text-sm font-bold text-navy tabular-nums">{startTime}</p>
                    <p className="text-xs text-gray-400 tabular-nums">{durLabel}</p>
                  </div>

                  {/* Name + team */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-navy truncate">{svc.summary}</p>
                    <p className="text-xs truncate">
                      {svc.teamLabel
                        ? <span className="text-gray-400">{svc.teamLabel}</span>
                        : <span className="text-amber-500 font-medium">Unassigned</span>
                      }
                    </p>
                  </div>

                  {/* Service-type badge */}
                  <TypeBadge type={svc.serviceType} />
                </li>
              );
            })}
          </ul>

          {hasMore && (
            <div className="px-4 sm:px-6 py-3 border-t border-gray-50">
              <Link to="/admin/calendar" className="text-xs text-gold hover:underline">
                +{events.length - 8} more — view in calendar →
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}