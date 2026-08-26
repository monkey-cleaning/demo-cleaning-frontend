import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, ChevronDown, ChevronUp } from 'lucide-react';
import { DateTime } from 'luxon';
import type { ConflictAlert } from '../../hooks/useOperationalData';

const TZ = 'America/Vancouver';
const VISIBLE_LIMIT = 5;

const CONFLICT_LABEL: Record<ConflictAlert['type'], string> = {
  unassigned: 'No team assigned',
  schedule: 'Schedule conflict',
  team_overlap: 'Team double-booked',
  over_capacity: 'Over capacity',
};

// team_overlap / over_capacity son más urgentes (requieren reasignar ya) →
// se muestran en rojo + parpadeo más marcado. unassigned/schedule quedan ámbar.
const SEVERE_TYPES = new Set<ConflictAlert['type']>(['team_overlap', 'over_capacity']);

function fmtDateParam(iso: string) {
  return DateTime.fromISO(iso, { zone: 'utc' }).setZone(TZ).toISODate();
}

function fmtTime(iso: string) {
  return DateTime.fromISO(iso, { zone: 'utc' }).setZone(TZ).toFormat('h:mm a');
}

export default function ConflictsAlertSection({
  conflicts,
  loading,
}: {
  conflicts: ConflictAlert[];
  loading: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showAll, setShowAll] = useState(false);

  // Oculto por completo si no hay conflictos — igual criterio que
  // "Clients needing attention" (Row 6 del dashboard).
  if (loading || conflicts.length === 0) return null;

  const visible = showAll ? conflicts : conflicts.slice(0, VISIBLE_LIMIT);
  const hiddenCount = conflicts.length - visible.length;

  return (
    <div className="bg-amber-50 rounded-2xl border border-amber-200 shadow-sm overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full px-4 sm:px-6 py-4 flex items-center justify-between gap-3 hover:bg-amber-100/50 transition-colors text-left"
      >
        <span className="font-bold text-amber-800 text-sm sm:text-base flex items-center gap-2">
          <AlertTriangle size={15} className="text-amber-600" />
          Calendar conflicts today
          <span className="bg-amber-200 text-amber-800 text-xs font-bold px-1.5 py-0.5 rounded-full">
            {conflicts.length}
          </span>
        </span>
        {expanded ? <ChevronUp size={16} className="text-amber-600" /> : <ChevronDown size={16} className="text-amber-600" />}
      </button>

      {expanded && (
        <>
          <ul className="divide-y divide-amber-100 border-t border-amber-100">
            {visible.map(c => {
              const isSevere = SEVERE_TYPES.has(c.type);

              return (
                <li key={c.id} className="px-4 sm:px-6 py-3 flex items-center gap-3 hover:bg-amber-100/30 transition-colors">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isSevere ? 'bg-red-500 conflict-blink-red' : 'bg-amber-500 conflict-blink-amber'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-navy truncate">{c.summary}</p>
                    <p className="text-xs text-gray-500">
                      {fmtTime(c.startIso)} ·{' '}
                      <span className={`font-semibold ${isSevere ? 'text-red-700' : 'text-amber-700'}`}>
                        {c.type === 'schedule'
                          ? `${c.employeeName}: ${c.reasons?.join(', ')}`
                          : c.type === 'team_overlap'
                            ? `${c.teamLabel ?? 'Team'} also booked: "${c.conflictingSummary}"`
                            : c.type === 'over_capacity'
                              ? `${c.simultaneousCount} simultaneous services, only ${c.maxTeams} team${c.maxTeams !== 1 ? 's' : ''} available`
                              : CONFLICT_LABEL[c.type]}
                      </span>
                    </p>
                  </div>
                  {c.type === 'unassigned' ? (
                    <Link to={`/admin/calendar?action=assign&eventId=${c.id}`} className="text-xs font-medium text-gold hover:underline flex-shrink-0">
                      Assign team
                    </Link>
                  ) : c.type === 'schedule' ? (
                    <Link to={`/admin/calendar?action=schedule&employeeId=${c.employeeId}&employeeName=${encodeURIComponent(c.employeeName ?? '')}`} className="text-xs font-medium text-gold hover:underline flex-shrink-0">
                      Edit schedule
                    </Link>
                  ) : (
                    <Link
                      to={`/admin/calendar?action=highlight&eventId=${encodeURIComponent(c.eventId ?? '')}&eventDate=${fmtDateParam(c.startIso)}`}
                      className="text-xs font-medium text-gold hover:underline flex-shrink-0"
                    >
                      View in calendar
                    </Link>
                  )}
                </li>
              );
            })} 
          </ul>

          {hiddenCount > 0 && (
            <div className="px-4 sm:px-6 py-3 border-t border-amber-100">
              <button
                onClick={() => setShowAll(true)}
                className="text-xs text-gold hover:underline flex items-center gap-1"
              >
                View {hiddenCount} more <ArrowRight size={12} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}