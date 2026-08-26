import { Link } from 'react-router-dom';
import { Users, ArrowRight } from 'lucide-react';
import { useTeamsToday, type TeamCard } from '../../hooks/useTeamsToday';

// ── Helpers ───────────────────────────────────────────────────────────────────

const SERVICE_TYPE_LABELS: Record<string, string> = {
  Residential:        'Residential',
  Commercial:         'Commercial',
  'Post-construction': 'Post-construction',
  Special:            'Special',
};

function serviceTypeLabel(type: string | null) {
  if (!type) return null;
  return SERVICE_TYPE_LABELS[type] ?? type;
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function TeamCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3 animate-pulse">
      <div className="h-4 bg-gray-100 rounded w-1/3" />
      <div className="space-y-2">
        <div className="h-3 bg-gray-100 rounded w-2/3" />
        <div className="h-3 bg-gray-100 rounded w-1/2" />
      </div>
      <div className="flex gap-2 pt-1">
        <div className="h-5 bg-gray-100 rounded-full w-16" />
        <div className="h-5 bg-gray-100 rounded-full w-12" />
      </div>
    </div>
  );
}

// ── Individual team card ──────────────────────────────────────────────────────

function TeamCardItem({ card }: { card: TeamCard }) {
  const isUnassigned = card.teamId === null;

  // Border style: color del equipo o punteado para "Disponibles"
  const borderStyle = isUnassigned
    ? { borderStyle: 'dashed' as const, borderColor: '#d1d5db', borderWidth: 2 }
    : card.color
      ? { borderLeftWidth: 4, borderLeftColor: card.color, borderLeftStyle: 'solid' as const }
      : {};

  const activeMembers = card.members.filter(m => m.is_active);
  const leader = activeMembers.find(m => m.is_team_leader);
  const others = activeMembers.filter(m => !m.is_team_leader);

  return (
    <div
      className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-3"
      style={borderStyle}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {card.emojis[0] && (
            <span className="text-base leading-none">{card.emojis[0]}</span>
          )}
          <h3 className="font-bold text-navy text-sm">{card.label}</h3>
        </div>

        {/* Service count badge */}
        <span
          className="text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
          style={
            card.serviceCount > 0 && card.color
              ? { backgroundColor: `${card.color}18`, color: card.color }
              : { backgroundColor: '#f3f4f6', color: '#6b7280' }
          }
        >
          {card.serviceCount} {card.serviceCount === 1 ? 'service' : 'services'}
        </span>
      </div>

      {/* Members */}
      {activeMembers.length === 0 ? (
        <p className="text-xs text-gray-400 italic">No active members</p>
      ) : (
        <ul className="space-y-1">
          {leader && (
            <li className="flex items-center gap-1.5">
              <span className="text-xs">👑</span>
              <span className="text-xs font-semibold text-navy truncate">{leader.name}</span>
            </li>
          )}
          {others.map(m => (
            <li key={m.email} className="flex items-center gap-1.5 pl-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-300 flex-shrink-0" />
              <span className="text-xs text-gray-600 truncate">{m.name}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Dominant service type */}
      {card.dominantType && (
        <span className="self-start text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
          {serviceTypeLabel(card.dominantType)}
        </span>
      )}
    </div>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────

export default function TeamsTodaySection() {
  const { teams, loading, error } = useTeamsToday();

  // Ocultar tarjeta "Disponibles" si no tiene miembros (CA3: solo aparece si hay)
  const visibleTeams = teams.filter(t => t.teamId !== null || t.members.length > 0);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 sm:px-6 py-4 flex items-center justify-between border-b border-gray-50">
        <h2 className="font-bold text-navy text-sm sm:text-base flex items-center gap-2">
          <Users size={15} className="text-gold" />
          Today's Teams
        </h2>
        <Link
          to="/admin/staff"
          className="text-xs text-gold hover:underline flex items-center gap-1"
        >
          View staff <ArrowRight size={12} />
        </Link>
      </div>

      <div className="p-4 sm:p-5">
        {error ? (
          <p className="text-xs text-red-500 text-center py-4">{error}</p>
        ) : loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <TeamCardSkeleton />
            <TeamCardSkeleton />
          </div>
        ) : visibleTeams.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">No team data available</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {visibleTeams.map(card => (
              <TeamCardItem
                key={card.teamId ?? 'unassigned'}
                card={card}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}