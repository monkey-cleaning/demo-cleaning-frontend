import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { DateTime } from 'luxon';
import { ChevronLeft, ChevronRight, MapPin, Users, Repeat, X, LogOut, ArrowLeft } from 'lucide-react';
import { getStaffWeekEvents, type StaffCalendarEvent } from '../api/staffCalendar';
import { STAFF_TOKEN_KEY } from '../api/staffClient';
import { htmlToPlainText } from '../lib/htmlToPlainText';

const TZ = 'America/Vancouver';
const HOUR_H = 60; // px per hour — same scale as AdminCalendarPage's WeekView/DayView
const START_H = 0;
const END_H = 24;
const VISIBLE_HOURS = END_H - START_H;
// Wide enough for "12:00 PM" at staff-a11y.css's bumped font-size without
// crowding the right-aligned label against the grid line.
const GUTTER_W = 64;
// Minimum rendered height for an event block, so the title/time/address
// labels have room to breathe on a short event (e.g. a 15min Lunch slot).
const MIN_EVENT_PX = 40;
const MIN_EVENT_HOURS = MIN_EVENT_PX / HOUR_H;
// Single neutral accent for every event — the ticket explicitly drops the
// per-team color coding / "Team N" badge from this read-only view.
const EVENT_COLOR = '#2563eb';

type ViewMode = 'week' | 'day';

// LAB423 — grid-based read-only calendar for cleaners: a trimmed-down
// week/day view in the same visual language as AdminCalendarPage.tsx's
// WeekView/DayView (hour gutter, day columns, click-to-open detail popover),
// but with no drag-and-drop, no team columns/conflict logic, and no editing
// of any kind — this page never writes anything back to the API.

function useIsMobile(): boolean {
  const QUERY = '(max-width: 767px)';
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(QUERY).matches : false
  );
  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return isMobile;
}

// Sunday-aligned week start (matches AdminCalendarPage's startOfWeek), in
// America/Vancouver — Luxon's own startOf('week') defaults to Monday (ISO).
function startOfWeekVan(dt: DateTime): DateTime {
  const dow = dt.weekday % 7; // Luxon: Mon=1..Sun=7 → Sunday becomes 0
  return dt.minus({ days: dow }).startOf('day');
}

function fmtWeekRange(weekStart: DateTime): string {
  const end = weekStart.plus({ days: 6 });
  return weekStart.month === end.month
    ? `${weekStart.toFormat('LLLL d')} – ${end.toFormat('d, yyyy')}`
    : `${weekStart.toFormat('LLL d')} – ${end.toFormat('LLL d, yyyy')}`;
}

function fmtHour(h: number): string {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return DateTime.fromObject({ hour: hh % 24, minute: mm }).toFormat('h:mm a');
}

// Returns startHour/endHour in decimal hours — endHour is the EFFECTIVE end
// used for both rendering and overlap layout: it's floored at
// startHour + MIN_EVENT_HOURS so a short event (a 15min Lunch block) reserves
// enough visual space for its labels. Without this, layoutDayEvents' overlap
// clustering only "sees" the event's true (tiny) duration, decides it
// doesn't overlap the next event, and gives both cols=1/full-width — but the
// rendered box (clamped to a minimum px height) then visually spills over
// the following block, which paints on top of it since it comes later in
// the same absolute-positioned stacking context. Inflating the end time
// BEFORE layout makes the two genuinely be treated as overlapping, so they
// correctly get split into side-by-side columns instead.
function eventHours(event: StaffCalendarEvent) {
  const start = DateTime.fromISO(event.startIso, { zone: TZ });
  const end = DateTime.fromISO(event.endIso, { zone: TZ });
  const startHour = start.hour + start.minute / 60;
  let endHour = end.hour + end.minute / 60;
  if (endHour <= startHour) endHour = 24; // guard against a zero/negative-length span
  endHour = Math.max(endHour, startHour + MIN_EVENT_HOURS);
  return { startHour, endHour };
}

// ── Overlap layout: packs same-day timed events into side-by-side columns ──
// Simple greedy interval-column packing — cleaners rarely have more than one
// or two overlapping entries (e.g. a job running long into the next lunch
// block), so this doesn't need AdminCalendarPage's team-macro-column logic.
interface LaidEvent {
  event: StaffCalendarEvent;
  startHour: number;
  endHour: number;
  col: number;
  cols: number;
}

function layoutDayEvents(events: StaffCalendarEvent[]): LaidEvent[] {
  const timed = events
    .filter((e) => !e.isAllDay)
    .map((e) => ({ event: e, ...eventHours(e) }))
    .sort((a, b) => a.startHour - b.startHour || b.endHour - a.endHour);

  const laid: LaidEvent[] = [];
  let cluster: typeof timed = [];
  let clusterEnd = -Infinity;

  function flushCluster() {
    if (!cluster.length) return;
    const colEnds: number[] = [];
    const assigned: { item: (typeof timed)[number]; col: number }[] = [];
    for (const item of cluster) {
      let col = colEnds.findIndex((end) => end <= item.startHour);
      if (col === -1) {
        col = colEnds.length;
        colEnds.push(item.endHour);
      } else {
        colEnds[col] = item.endHour;
      }
      assigned.push({ item, col });
    }
    const cols = colEnds.length;
    for (const { item, col } of assigned) {
      laid.push({ event: item.event, startHour: item.startHour, endHour: item.endHour, col, cols });
    }
    cluster = [];
    clusterEnd = -Infinity;
  }

  for (const item of timed) {
    if (cluster.length && item.startHour >= clusterEnd) flushCluster();
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, item.endHour);
  }
  flushCluster();

  return laid;
}

function nowTopPx(): number {
  const now = DateTime.now().setZone(TZ);
  return (now.hour + now.minute / 60) * HOUR_H;
}

function CurrentTimeLine() {
  const [top, setTop] = useState(nowTopPx);
  useEffect(() => {
    const t = setInterval(() => setTop(nowTopPx()), 60_000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="absolute left-0 right-0 z-10 pointer-events-none" style={{ top }}>
      <div className="h-px bg-red-500" />
      <div className="absolute -left-1 -top-1 w-2 h-2 rounded-full bg-red-500" />
    </div>
  );
}

export default function StaffCalendarPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const [view, setView] = useState<ViewMode>(() => (isMobile ? 'day' : 'week'));
  const [anchor, setAnchor] = useState(() => DateTime.now().setZone(TZ).startOf('day'));
  const [events, setEvents] = useState<StaffCalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ event: StaffCalendarEvent; rect?: DOMRect } | null>(null);

  // Cheap pure computations — plain consts recomputed each render, no need
  // for useMemo (and it sidesteps eslint's dependency-array restrictions on
  // calling .toISODate() inline).
  const weekStart = startOfWeekVan(anchor);
  const weekKey = weekStart.toISODate()!;

  // Reset loading/error as soon as the requested week changes, during render
  // (not inside the effect below) — avoids the cascading-render anti-pattern
  // of calling setState synchronously at the top of an effect.
  const [loadedWeekKey, setLoadedWeekKey] = useState(weekKey);
  if (weekKey !== loadedWeekKey) {
    setLoadedWeekKey(weekKey);
    setLoading(true);
    setError(null);
  }

  useEffect(() => {
    let cancelled = false;
    getStaffWeekEvents(weekStart)
      .then((data) => {
        if (cancelled) return;
        setEvents(data);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError('Could not load your schedule. Please try again.');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // weekStart is derived from weekKey every render (see above) — depending
    // on the string key instead of the DateTime instance avoids refetching
    // on every render (a new DateTime object, even for the same day).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekKey]);

  const days = view === 'week' ? Array.from({ length: 7 }, (_, i) => weekStart.plus({ days: i })) : [anchor];

  const eventsByDate = useMemo(() => {
    const map = new Map<string, StaffCalendarEvent[]>();
    for (const e of events) {
      const list = map.get(e.startDate) ?? [];
      list.push(e);
      map.set(e.startDate, list);
    }
    return map;
  }, [events]);

  // Scroll the grid to 6am once the grid actually exists in the DOM. It only
  // mounts once `loading` turns false (it's behind `{!loading && !error && ...}`
  // below) — running this on an empty deps array fired before that, against a
  // still-null ref, which is why the grid used to open pinned at 0am. The
  // hasScrolledRef guard keeps this a one-time "open here" jump instead of
  // re-centering every time a week/day navigation flips loading true→false.
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasScrolledRef = useRef(false);
  useEffect(() => {
    if (!loading && !hasScrolledRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = 6 * HOUR_H;
      hasScrolledRef.current = true;
    }
  }, [loading]);

  const todayKey = DateTime.now().setZone(TZ).toISODate();

  function goPrev() {
    setSelected(null);
    setAnchor((a) => (view === 'week' ? a.minus({ weeks: 1 }) : a.minus({ days: 1 })));
  }
  function goNext() {
    setSelected(null);
    setAnchor((a) => (view === 'week' ? a.plus({ weeks: 1 }) : a.plus({ days: 1 })));
  }
  function goToday() {
    setSelected(null);
    setAnchor(DateTime.now().setZone(TZ).startOf('day'));
  }
  function changeView(v: ViewMode) {
    setSelected(null);
    setView(v);
  }

  const handleLogout = () => {
    localStorage.removeItem(STAFF_TOKEN_KEY);
    navigate('/staff/login');
  };

  const rangeLabel = view === 'week' ? fmtWeekRange(weekStart) : anchor.toFormat('cccc, LLLL d, yyyy');

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <header className="bg-[#031634] text-white px-4 py-3 flex items-center justify-between flex-shrink-0">
        <button
          onClick={() => navigate('/staff')}
          className="flex items-center gap-1.5 text-base font-montserrat font-bold"
        >
          <ArrowLeft size={16} /> My Calendar
        </button>
        <button onClick={handleLogout} className="flex items-center gap-1 text-xs text-gray-300 hover:text-white">
          <LogOut size={13} /> Log out
        </button>
      </header>

      <div className="px-3 py-2 border-b border-gray-200 bg-white flex-shrink-0 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          <button onClick={goToday} className="px-2.5 py-1.5 text-xs font-medium rounded-md border border-gray-300 hover:bg-gray-50">
            Today
          </button>
          <button onClick={goPrev} aria-label="Previous" className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500">
            <ChevronLeft size={16} />
          </button>
          <button onClick={goNext} aria-label="Next" className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500">
            <ChevronRight size={16} />
          </button>
          <span className="text-sm font-medium text-[#031634] ml-1">{rangeLabel}</span>
        </div>

        <div className="flex rounded-md border border-gray-300 overflow-hidden text-xs font-medium">
          <button
            onClick={() => changeView('week')}
            className={`px-3 py-1.5 ${view === 'week' ? 'bg-[#031634] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
          >
            Week
          </button>
          <button
            onClick={() => changeView('day')}
            className={`px-3 py-1.5 border-l border-gray-300 ${view === 'day' ? 'bg-[#031634] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
          >
            Day
          </button>
        </div>
      </div>

      {loading && <p className="text-center text-gray-500 text-sm py-8">Loading...</p>}
      {error && <p className="text-center text-red-500 text-sm py-8">{error}</p>}

      {!loading && !error && (
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Day headers */}
          <div
            className="grid border-b border-gray-200 bg-white flex-shrink-0"
            style={{ gridTemplateColumns: `${GUTTER_W}px repeat(${days.length}, 1fr)` }}
          >
            <div />
            {days.map((d) => {
              const key = d.toISODate()!;
              const isToday = key === todayKey;
              const dayEvents = eventsByDate.get(key) ?? [];
              const allDay = dayEvents.filter((e) => e.isAllDay);
              return (
                <div key={key} className="py-2 text-center border-l border-gray-100">
                  <p className={`text-[11px] font-medium uppercase tracking-widest ${isToday ? 'text-blue-600' : 'text-gray-500'}`}>
                    {d.toFormat('ccc')}
                  </p>
                  <span
                    className={`inline-flex items-center justify-center w-8 h-8 mt-0.5 rounded-full text-lg font-light ${
                      isToday ? 'bg-blue-600 text-white font-medium' : 'text-gray-800'
                    }`}
                  >
                    {d.day}
                  </span>
                  {allDay.length > 0 && (
                    <div className="mt-1 space-y-0.5 px-1">
                      {allDay.map((e) => (
                        <button
                          key={e.id}
                          onClick={(ev) => setSelected({ event: e, rect: ev.currentTarget.getBoundingClientRect() })}
                          className="w-full truncate text-[10px] text-white rounded px-1"
                          style={{ background: EVENT_COLOR }}
                        >
                          {e.summary}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Scrollable hour grid */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto">
            <div className="grid" style={{ gridTemplateColumns: `${GUTTER_W}px repeat(${days.length}, 1fr)` }}>
              <div className="relative border-r border-gray-200" style={{ height: VISIBLE_HOURS * HOUR_H }}>
                {Array.from({ length: VISIBLE_HOURS }, (_, i) =>
                  i > 0 ? (
                    <div key={i} className="absolute w-full pr-2 text-right" style={{ top: i * HOUR_H - 8 }}>
                      <span className="text-[11px] text-gray-400 leading-none whitespace-nowrap">{fmtHour(i)}</span>
                    </div>
                  ) : null
                )}
              </div>

              {days.map((d) => {
                const key = d.toISODate()!;
                const isToday = key === todayKey;
                const laid = layoutDayEvents(eventsByDate.get(key) ?? []);
                return (
                  <div
                    key={key}
                    className={`relative border-l border-gray-100 ${isToday ? 'bg-blue-50/30' : ''}`}
                    style={{ height: VISIBLE_HOURS * HOUR_H }}
                  >
                    {Array.from({ length: VISIBLE_HOURS }, (_, i) => (
                      <div key={i} className="absolute left-0 right-0 border-t border-gray-100" style={{ top: i * HOUR_H }} />
                    ))}
                    {isToday && <CurrentTimeLine />}
                    {laid.map(({ event, startHour, endHour, col, cols }) => (
                      <button
                        key={event.id}
                        onClick={(ev) => setSelected({ event, rect: ev.currentTarget.getBoundingClientRect() })}
                        className="absolute rounded-md px-1.5 py-0.5 text-left text-white overflow-hidden shadow-sm hover:brightness-95 transition-[filter]"
                        style={{
                          top: startHour * HOUR_H,
                          // endHour is already floored at MIN_EVENT_HOURS
                          // above (see eventHours) — no separate Math.max
                          // needed here, and it's what layoutDayEvents used
                          // to decide overlap, so this box never paints over
                          // a genuinely-earlier neighboring block.
                          height: (endHour - startHour) * HOUR_H - 2,
                          left: `calc(${(col / cols) * 100}% + 2px)`,
                          width: `calc(${100 / cols}% - 4px)`,
                          background: EVENT_COLOR,
                        }}
                      >
                        <span className="block text-[11px] font-semibold leading-tight truncate">{event.summary}</span>
                        <span className="block text-[10px] leading-tight truncate opacity-90">
                          {fmtHour(startHour)} – {fmtHour(endHour)}
                        </span>
                        {event.location && (
                          <span className="block text-[10px] leading-tight truncate opacity-90">📍 {event.location}</span>
                        )}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {selected && <EventPopover event={selected.event} anchorRect={selected.rect} onClose={() => setSelected(null)} />}
    </div>
  );
}

function EventPopover({
  event,
  anchorRect,
  onClose,
}: {
  event: StaffCalendarEvent;
  anchorRect?: DOMRect;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    const t = setTimeout(() => document.addEventListener('mousedown', handler), 50);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', handler);
    };
  }, [onClose]);

  const start = DateTime.fromISO(event.startIso, { zone: TZ });
  const end = DateTime.fromISO(event.endIso, { zone: TZ });
  const dateStr = start.toFormat('cccc, LLLL d');
  const timeStr = event.isAllDay ? 'All day' : `${start.toFormat('h:mm a')} – ${end.toFormat('h:mm a')}`;
  const notes = htmlToPlainText(event.notes);

  return createPortal(
    <div
      ref={ref}
      className="fixed z-[70] bg-white rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.2)] border border-gray-100 w-80 max-w-[calc(100vw-2rem)] max-h-[80vh] overflow-hidden flex flex-col"
      onMouseDown={(e) => e.stopPropagation()}
      style={(() => {
        if (isMobile || !anchorRect) return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
        const W = 320;
        const H = 380;
        const spaceAbove = anchorRect.top;
        const spaceBelow = window.innerHeight - anchorRect.bottom;
        const top =
          spaceAbove >= H || spaceAbove >= spaceBelow
            ? Math.max(8, anchorRect.top - H - 8)
            : Math.min(anchorRect.bottom + 8, window.innerHeight - H - 8);
        const left = Math.min(Math.max(8, anchorRect.left), window.innerWidth - W - 8);
        return { top, left };
      })()}
    >
      <div className="h-2 flex-shrink-0" style={{ background: EVENT_COLOR }} />

      <div className="flex items-center justify-end px-3 pt-2 flex-shrink-0">
        <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500">
          <X size={15} />
        </button>
      </div>

      <div className="px-5 pb-5 space-y-3 overflow-y-auto">
        <h3 className="text-lg font-medium text-gray-800 leading-snug">{event.summary}</h3>

        <div className="space-y-2.5 text-sm text-gray-600">
          <div>
            <p>{dateStr}</p>
            <p className="text-gray-400 text-xs">{timeStr}</p>
          </div>

          {event.location && (
            <div className="flex items-start gap-2">
              <MapPin size={15} className="mt-0.5 text-gray-400 flex-shrink-0" />
              <span>{event.location}</span>
            </div>
          )}

          {event.teammates.length > 0 && (
            <div className="flex items-start gap-2">
              <Users size={15} className="mt-0.5 text-gray-400 flex-shrink-0" />
              <span className="text-xs">With you: {event.teammates.join(', ')}</span>
            </div>
          )}

          {event.isRecurring && (
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Repeat size={13} /> Recurring
            </div>
          )}

          {notes && (
            <div className="flex items-start gap-2 border-t border-gray-100 pt-2.5">
              <span className="text-gray-400 mt-0.5 text-base leading-none flex-shrink-0">📝</span>
              <p className="text-xs text-gray-500 whitespace-pre-line">{notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
