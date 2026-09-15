import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { DateTime } from 'luxon';
import { ChevronLeft, ChevronRight, MapPin, Users, Repeat, X, LogOut, ArrowLeft, Send } from 'lucide-react';
import {
  getStaffWeekEvents,
  getStaffMonthEvents,
  getEventNotes,
  addEventNote,
  type StaffCalendarEvent,
  type EventNote,
} from '../api/staffCalendar';
import { STAFF_TOKEN_KEY } from '../api/staffClient';
import { htmlToPlainText } from '../lib/htmlToPlainText';

const TZ = 'America/Vancouver';
const HOUR_H = 60; // px per hour at zoom=1 — same base scale as AdminCalendarPage's WeekView/DayView
const START_H = 0;
const END_H = 24;
const VISIBLE_HOURS = END_H - START_H;
// Wide enough for "12:00 PM" at staff-a11y.css's bumped font-size without
// crowding the right-aligned label against the grid line. This is the
// LEFTMOST grid column, so a label that's too wide doesn't get an internal
// scrollbar or wrap — it silently clips off its own left edge against the
// viewport edge ("00 AM" instead of "10:00 AM"), reported on a real
// iPhone/Brave 2026-09-11. 64px measured too narrow there; 88px leaves
// real headroom instead of matching to the pixel.
const GUTTER_W = 88;
// Minimum rendered height for an event block, so the title/time/address
// labels have room to breathe on a short event (e.g. a 15min Lunch slot).
const MIN_EVENT_PX = 40;
// Daily 2026-09-11 — pinch-to-zoom range for the Day view's hour grid.
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.5;
// Single neutral accent for every event — the ticket explicitly drops the
// per-team color coding / "Team N" badge from this read-only view.
const EVENT_COLOR = '#2563eb';
// Daily 2026-09-11 — horizontal swipe to change day/week/month.
const SWIPE_MIN_PX = 50;

type ViewMode = 'month' | 'week' | 'day';

// LAB423 — grid-based read-only calendar for cleaners: a trimmed-down
// month/week/day view in the same visual language as AdminCalendarPage.tsx's
// MonthView/WeekView/DayView (hour gutter, day columns, click-to-open detail
// popover), but with no drag-and-drop, no team columns/conflict logic, and no
// editing of any kind — this page never writes anything back to the GCal API
// (event notes are the one exception, a separate side table — see
// eventNotesController.js on the backend).

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

// Returns startHour/endHour/trueEndHour in decimal hours. `endHour` is the
// EFFECTIVE end used for BOX HEIGHT and overlap layout only: it's floored at
// startHour + (MIN_EVENT_PX / hourPx) so a short event (a 15min Lunch block)
// reserves enough visual space for its labels. Without this, layoutDayEvents'
// overlap clustering only "sees" the event's true (tiny) duration, decides it
// doesn't overlap the next event, and gives both cols=1/full-width — but the
// rendered box (clamped to a minimum px height) then visually spills over
// the following block, which paints on top of it since it comes later in
// the same absolute-positioned stacking context. Inflating the end time
// BEFORE layout makes the two genuinely be treated as overlapping, so they
// correctly get split into side-by-side columns instead. `hourPx` (HOUR_H *
// zoom) is threaded through so the floor stays correct as the user pinches —
// which is exactly why `trueEndHour` (the real, un-floored end) has to be
// kept separate and used for the TEXT label: reusing the floored `endHour`
// there made a short event's displayed end time visibly change as you
// pinched (reported from a real-device recording), since the floor's size
// depends on hourPx/zoom.
function eventHours(event: StaffCalendarEvent, hourPx: number) {
  const start = DateTime.fromISO(event.startIso, { zone: TZ });
  const end = DateTime.fromISO(event.endIso, { zone: TZ });
  const startHour = start.hour + start.minute / 60;
  let trueEndHour = end.hour + end.minute / 60;
  if (trueEndHour <= startHour) trueEndHour = 24; // guard against a zero/negative-length span
  const endHour = Math.max(trueEndHour, startHour + MIN_EVENT_PX / hourPx);
  return { startHour, endHour, trueEndHour };
}

// ── Overlap layout: packs same-day timed events into side-by-side columns ──
// Simple greedy interval-column packing — cleaners rarely have more than one
// or two overlapping entries (e.g. a job running long into the next lunch
// block), so this doesn't need AdminCalendarPage's team-macro-column logic.
interface LaidEvent {
  event: StaffCalendarEvent;
  startHour: number;
  endHour: number; // floored for box height/overlap layout — NOT for display
  trueEndHour: number; // real end time — use this for the text label
  col: number;
  cols: number;
}

function layoutDayEvents(events: StaffCalendarEvent[], hourPx: number): LaidEvent[] {
  const timed = events
    .filter((e) => !e.isAllDay)
    .map((e) => ({ event: e, ...eventHours(e, hourPx) }))
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
      laid.push({
        event: item.event,
        startHour: item.startHour,
        endHour: item.endHour,
        trueEndHour: item.trueEndHour,
        col,
        cols,
      });
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

function nowTopPx(hourPx: number): number {
  const now = DateTime.now().setZone(TZ);
  return (now.hour + now.minute / 60) * hourPx;
}

function CurrentTimeLine({ hourPx }: { hourPx: number }) {
  // `top` is derived straight from hourPx on every render (reacts to zoom
  // immediately) — the effect only owns a tick counter to force a re-render
  // once a minute, never calls setState synchronously in its own body.
  const [, forceTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => forceTick((v) => v + 1), 60_000);
    return () => clearInterval(t);
  }, []);
  const top = nowTopPx(hourPx);
  return (
    <div className="absolute left-0 right-0 z-10 pointer-events-none" style={{ top }}>
      <div className="h-px bg-red-500" />
      <div className="absolute -left-1 -top-1 w-2 h-2 rounded-full bg-red-500" />
    </div>
  );
}

// Daily 2026-09-11 — grilla mensual estilo Google Calendar, vista por
// defecto al entrar al calendario. `onSelectDay` cambia a Day view (misma
// UX que Google Calendar mobile: tocar un día del mes abre su agenda).
function MonthView({
  anchor,
  eventsByDate,
  onSelectDay,
}: {
  anchor: DateTime;
  eventsByDate: Map<string, StaffCalendarEvent[]>;
  onSelectDay: (d: DateTime) => void;
}) {
  const first = anchor.startOf('month');
  const gridStart = startOfWeekVan(first);
  const cells = Array.from({ length: 42 }, (_, i) => gridStart.plus({ days: i }));
  const todayKey = DateTime.now().setZone(TZ).toISODate();
  const MAX_VISIBLE = 3;

  return (
    <div className="flex-1 overflow-y-auto flex flex-col">
      <div className="grid grid-cols-7 border-b border-gray-200 bg-white flex-shrink-0">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div key={i} className="py-2 text-center text-[11px] font-medium text-gray-500 tracking-widest">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 flex-1" style={{ gridAutoRows: 'minmax(72px, 1fr)' }}>
        {cells.map((cell) => {
          const key = cell.toISODate()!;
          const inMonth = cell.month === anchor.month;
          const isToday = key === todayKey;
          const dayEvents = (eventsByDate.get(key) ?? []).slice().sort((a, b) => a.startIso.localeCompare(b.startIso));
          return (
            <button
              key={key}
              onClick={() => onSelectDay(cell)}
              className="border-r border-b border-gray-100 p-1 text-left hover:bg-gray-50 active:bg-gray-100 flex flex-col min-h-0"
            >
              <span
                className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs mb-0.5 flex-shrink-0 ${
                  isToday ? 'bg-blue-600 text-white font-semibold' : inMonth ? 'text-gray-800' : 'text-gray-300'
                }`}
              >
                {cell.day}
              </span>
              <div className="space-y-0.5 min-w-0 overflow-hidden">
                {dayEvents.slice(0, MAX_VISIBLE).map((e) => (
                  <div
                    key={e.id}
                    className="truncate text-[9px] sm:text-[10px] leading-tight rounded px-1 text-white"
                    style={{ background: EVENT_COLOR, opacity: inMonth ? 1 : 0.5 }}
                  >
                    {e.summary}
                  </div>
                ))}
                {dayEvents.length > MAX_VISIBLE && (
                  <div className="text-[9px] sm:text-[10px] leading-tight text-gray-400 px-1">
                    +{dayEvents.length - MAX_VISIBLE} more
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function StaffCalendarPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  // `view` is the user's stored choice (Month/Week/Day). On mobile Week is
  // never offered (a 7-column week on a phone makes each column ~44px and
  // the event text unreadable — same reason Google Calendar's phone app
  // doesn't offer week view), so `effectiveView` forces Day if a stale
  // 'week' value is ever reached on a phone. Default is Month per the
  // 2026-09-11 daily — it's what should show "from the moment you open the
  // calendar".
  const [view, setView] = useState<ViewMode>('month');
  const effectiveView: ViewMode = isMobile && view === 'week' ? 'day' : view;
  const [anchor, setAnchor] = useState(() => DateTime.now().setZone(TZ).startOf('day'));
  const [events, setEvents] = useState<StaffCalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ event: StaffCalendarEvent; rect?: DOMRect } | null>(null);
  // Daily 2026-09-11 — pinch-to-zoom on the Day view's hour grid (1 = default).
  const [zoom, setZoom] = useState(1);
  const hourPx = HOUR_H * zoom;

  // Cheap pure computations — plain consts recomputed each render, no need
  // for useMemo (and it sidesteps eslint's dependency-array restrictions on
  // calling .toISODate() inline).
  const weekStart = startOfWeekVan(anchor);
  const weekKey = weekStart.toISODate()!;
  const monthGridStart = startOfWeekVan(anchor.startOf('month'));
  const monthKey = monthGridStart.toISODate()!;
  const rangeKey = effectiveView === 'month' ? `month:${monthKey}` : `week:${weekKey}`;

  // Reset loading/error as soon as the requested range changes, during
  // render (not inside the effect below) — avoids the cascading-render
  // anti-pattern of calling setState synchronously at the top of an effect.
  const [loadedRangeKey, setLoadedRangeKey] = useState(rangeKey);
  if (rangeKey !== loadedRangeKey) {
    setLoadedRangeKey(rangeKey);
    setLoading(true);
    setError(null);
  }

  useEffect(() => {
    let cancelled = false;
    const fetcher = effectiveView === 'month' ? getStaffMonthEvents(anchor) : getStaffWeekEvents(weekStart);
    fetcher
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
    // rangeKey captures every input that should trigger a refetch (view kind
    // + week/month start) — depending on it instead of the DateTime/ViewMode
    // instances avoids refetching on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeKey]);

  const days = effectiveView === 'week' ? Array.from({ length: 7 }, (_, i) => weekStart.plus({ days: i })) : [anchor];

  const eventsByDate = useMemo(() => {
    const map = new Map<string, StaffCalendarEvent[]>();
    for (const e of events) {
      const list = map.get(e.startDate) ?? [];
      list.push(e);
      map.set(e.startDate, list);
    }
    return map;
  }, [events]);

  // Scroll the grid to 7am every time a day/week grid finishes loading — not
  // just once. It only mounts once `loading` turns false (it's behind
  // `{!loading && !error && ...}` below) — running this on an empty deps
  // array fired before that, against a still-null ref, which is why the grid
  // used to open pinned at 0am. `scrollKey` is what makes it stick to 7am on
  // every day/week navigation, not just the very first load: `rangeKey`
  // alone doesn't change when moving day-to-day INSIDE the same week (Day
  // view fetches by week, see rangeKey above) — a previous version keyed
  // only on rangeKey (or a one-shot ref) and so only reset the scroll once,
  // leaving day 2 onward wherever the grid happened to already be scrolled.
  // Reads the CURRENT hourPx (zoom) via closure rather than depending on it,
  // so a pinch-zoom doesn't itself trigger a re-scroll.
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollKey = effectiveView === 'day' ? anchor.toISODate() : rangeKey;
  useEffect(() => {
    if (!loading && effectiveView !== 'month' && scrollRef.current) {
      scrollRef.current.scrollTop = 7 * hourPx;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, effectiveView, scrollKey]);

  // ── Pinch-to-zoom (Day view only) ───────────────────────────────────────
  // Native listeners (not React's synthetic onTouch*) so preventDefault()
  // during an active 2-finger pinch reliably stops the browser's own
  // page-zoom gesture from firing at the same time as ours. Safari/WebKit is
  // the tricky one: its native pinch-to-zoom is driven by proprietary
  // gesturestart/gesturechange/gestureend events, NOT by touch events —
  // preventDefault()ing touchmove alone (what Chrome/Brave need) doesn't
  // reliably stop it there, so those three are also wired up and prevented
  // whenever a gesture starts inside the grid.
  // `zoomRef` always holds the LAST APPLIED zoom (kept in sync below), so the
  // touch/gesture handlers — set up once, in a plain closure — can read a
  // fresh value instead of whatever `zoom` happened to be when the effect
  // was set up.
  const zoomRef = useRef(zoom);
  // The scroll compensation for a zoom change can't be applied in the same
  // tick as setZoom() — the DOM still has the OLD (shorter) grid height at
  // that point (React hasn't re-rendered yet), so the browser just clamps
  // scrollTop back down against the stale scrollHeight and the anchor point
  // drifts anyway. `pendingAnchorRef` hands the target anchor off to a
  // useLayoutEffect keyed on `zoom`, which runs after the DOM reflects the
  // new (taller/shorter) grid but before the browser paints.
  const pendingAnchorRef = useRef<{ anchorHour: number; viewportY: number } | null>(null);
  useLayoutEffect(() => {
    zoomRef.current = zoom;
    const pending = pendingAnchorRef.current;
    if (pending && scrollRef.current) {
      scrollRef.current.scrollTop = pending.anchorHour * HOUR_H * zoom - pending.viewportY;
      pendingAnchorRef.current = null;
    }
  }, [zoom]);

  // `pinchRef` only tracks per-gesture bookkeeping needed to turn each new
  // touch/gesture event into an INCREMENTAL zoom step (this frame vs the
  // last one) — `lastDist` for the touch path, `lastScale` for Safari's
  // (whose GestureEvent.scale is cumulative since gesturestart, not
  // incremental, so it needs dividing out each frame instead).
  const pinchRef = useRef<{ lastDist?: number; lastScale?: number } | null>(null);
  useEffect(() => {
    // Bug (found via real-device testing, pinch did nothing in ANY browser):
    // the Day grid only exists in the DOM once `loading` is false (it's
    // behind `{!loading && !error && ...}` in the JSX below). Switching into
    // Day view flips effectiveView to 'day' immediately, but the fetch for
    // the new range is still in flight — so THIS effect used to run while
    // scrollRef.current was still null, bail out on `!el`, and then never
    // run again (its deps were only [effectiveView], which doesn't change
    // again once loading finishes) — no listener ever got attached. `loading`
    // is now a dep too, so this re-attaches once the grid actually mounts.
    const el = scrollRef.current;
    if (!el || effectiveView !== 'day' || loading) return;

    function dist(t: TouchList) {
      const [a, b] = [t[0], t[1]];
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    }
    // `midClientY` is re-read from the CURRENT touches/gesture on every
    // single frame, not just at gesture start — real fingers don't move in
    // perfectly mirrored motion, so the true midpoint drifts a little as a
    // pinch progresses. Anchoring once at gesture start (the previous
    // version) let that drift accumulate until the zoomed content visibly
    // slipped out from under the fingers (reported from a real-device
    // recording); recomputing anchorHour fresh every frame, from
    // wherever the fingers currently are, keeps it glued to them instead.
    function applyZoom(targetZoom: number, midClientY: number) {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const viewportY = midClientY - rect.top;
      const anchorHour = (el.scrollTop + viewportY) / (HOUR_H * zoomRef.current);
      const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, targetZoom));
      if (clamped === zoomRef.current) {
        // Already at MIN_ZOOM/MAX_ZOOM and still being pinched past it (or a
        // sub-pixel no-op step): the grid's height genuinely isn't changing,
        // so there's no pending re-render to wait for — apply the scrollTop
        // compensation immediately instead of going through setZoom(), which
        // would bail out (same value) and never run the layout effect that
        // normally does this. Without this, fingers kept moving past the
        // zoom cap while scrollTop silently froze — it looked like the pinch
        // "let go" of the anchor even though zoom itself was still capped.
        el.scrollTop = anchorHour * HOUR_H * clamped - viewportY;
        return;
      }
      pendingAnchorRef.current = { anchorHour, viewportY };
      setZoom(clamped);
    }
    function onTouchStart(e: TouchEvent) {
      if (e.touches.length === 2) {
        e.preventDefault();
        pinchRef.current = { lastDist: dist(e.touches) };
      }
    }
    function onTouchMove(e: TouchEvent) {
      if (e.touches.length === 2 && pinchRef.current?.lastDist) {
        e.preventDefault();
        const d = dist(e.touches);
        const ratio = d / pinchRef.current.lastDist;
        pinchRef.current.lastDist = d;
        const [a, b] = [e.touches[0], e.touches[1]];
        applyZoom(zoomRef.current * ratio, (a.clientY + b.clientY) / 2);
      }
    }
    function onTouchEnd(e: TouchEvent) {
      if (e.touches.length < 2) pinchRef.current = null;
    }
    // Safari-only (TS doesn't know these — cast to unknown Event handlers).
    function onGestureStart(e: Event) {
      e.preventDefault();
      pinchRef.current = { lastScale: 1 };
    }
    function onGestureChange(e: Event) {
      e.preventDefault();
      if (!pinchRef.current) return;
      // Safari GestureEvent: `scale` is cumulative since gesturestart, so
      // dividing by the last frame's scale turns it into this frame's
      // incremental ratio, same as the touch path above.
      const ge = e as unknown as { scale: number; clientY: number };
      const ratio = ge.scale / (pinchRef.current.lastScale ?? 1);
      pinchRef.current.lastScale = ge.scale;
      applyZoom(zoomRef.current * ratio, ge.clientY);
    }
    function onGestureEnd(e: Event) {
      e.preventDefault();
      pinchRef.current = null;
    }

    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);
    el.addEventListener('gesturestart', onGestureStart as EventListener);
    el.addEventListener('gesturechange', onGestureChange as EventListener);
    el.addEventListener('gestureend', onGestureEnd as EventListener);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
      el.removeEventListener('gesturestart', onGestureStart as EventListener);
      el.removeEventListener('gesturechange', onGestureChange as EventListener);
      el.removeEventListener('gestureend', onGestureEnd as EventListener);
    };
    // zoom itself is read through zoomRef (always current), not as a direct
    // dependency — re-subscribing on every zoom tick would drop the
    // in-progress gesture.
  }, [effectiveView, loading]);

  const todayKey = DateTime.now().setZone(TZ).toISODate();

  function goPrev() {
    setSelected(null);
    setAnchor((a) => {
      if (effectiveView === 'month') return a.minus({ months: 1 });
      if (effectiveView === 'week') return a.minus({ weeks: 1 });
      return a.minus({ days: 1 });
    });
  }
  function goNext() {
    setSelected(null);
    setAnchor((a) => {
      if (effectiveView === 'month') return a.plus({ months: 1 });
      if (effectiveView === 'week') return a.plus({ weeks: 1 });
      return a.plus({ days: 1 });
    });
  }
  function goToday() {
    setSelected(null);
    setAnchor(DateTime.now().setZone(TZ).startOf('day'));
  }
  function changeView(v: ViewMode) {
    setSelected(null);
    setView(v);
  }
  function selectDay(d: DateTime) {
    setSelected(null);
    setAnchor(d);
    setView('day');
  }

  // ── Horizontal swipe to change day/week/month ───────────────────────────
  // Plain React touch handlers (no preventDefault) — only measures, so it
  // never fights the grid's native vertical scroll. A 2-finger touch is left
  // alone entirely (that's the pinch-zoom gesture, handled above).
  const swipeRef = useRef<{ x: number; y: number } | null>(null);
  function handleTouchStart(e: React.TouchEvent) {
    if (e.touches.length !== 1) {
      swipeRef.current = null;
      return;
    }
    swipeRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
  function handleTouchEnd(e: React.TouchEvent) {
    const start = swipeRef.current;
    swipeRef.current = null;
    if (!start) return;
    const end = e.changedTouches[0];
    const dx = end.clientX - start.x;
    const dy = end.clientY - start.y;
    if (Math.abs(dx) >= SWIPE_MIN_PX && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) goNext();
      else goPrev();
    }
  }

  const handleLogout = () => {
    localStorage.removeItem(STAFF_TOKEN_KEY);
    navigate('/staff/login');
  };

  const rangeLabel =
    effectiveView === 'month'
      ? anchor.toFormat('LLLL yyyy')
      : effectiveView === 'week'
        ? fmtWeekRange(weekStart)
        : anchor.toFormat('cccc, LLLL d, yyyy');

  return (
    // Daily 2026-09-11 follow-up — iPhone Safari screenshot showed the last
    // Month-view row barely clipped by Safari's floating bottom bar (it
    // overlays content instead of pushing it, so h-dvh alone doesn't clear
    // it). safe-area-inset-bottom is the standard iOS fix; the plain 8px
    // covers Chrome/Brave-on-Android's own gesture-nav bar, which doesn't
    // report a safe-area inset at all.
    <div className="h-dvh flex flex-col bg-gray-50" style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}>
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

        {/* View toggle — Month/Day on mobile, Month/Week/Day on desktop
            (Week stays hidden on phones — see effectiveView above). */}
        <div className="flex rounded-md border border-gray-300 overflow-hidden text-xs font-medium">
          <button
            onClick={() => changeView('month')}
            className={`px-3 py-1.5 ${view === 'month' ? 'bg-[#031634] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
          >
            Month
          </button>
          {!isMobile && (
            <button
              onClick={() => changeView('week')}
              className={`px-3 py-1.5 border-l border-gray-300 ${view === 'week' ? 'bg-[#031634] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              Week
            </button>
          )}
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

      {!loading && !error && effectiveView === 'month' && (
        <div className="flex-1 overflow-hidden flex flex-col" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
          <MonthView anchor={anchor} eventsByDate={eventsByDate} onSelectDay={selectDay} />
        </div>
      )}

      {!loading && !error && effectiveView !== 'month' && (
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

          {/* Scrollable hour grid — touch-action: pan-y so a vertical drag
              always scrolls (native), while our own listeners intercept the
              2-finger pinch and (via handleTouchStart/End below) a fast
              1-finger horizontal swipe. */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto"
            style={{ touchAction: 'pan-y' }}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <div className="grid" style={{ gridTemplateColumns: `${GUTTER_W}px repeat(${days.length}, 1fr)` }}>
              <div className="relative border-r border-gray-200" style={{ height: VISIBLE_HOURS * hourPx }}>
                {Array.from({ length: VISIBLE_HOURS }, (_, i) =>
                  i > 0 ? (
                    <div key={i} className="absolute w-full pr-2 text-right" style={{ top: i * hourPx - 8 }}>
                      <span className="text-[11px] text-gray-400 leading-none whitespace-nowrap">{fmtHour(i)}</span>
                    </div>
                  ) : null
                )}
              </div>

              {days.map((d) => {
                const key = d.toISODate()!;
                const isToday = key === todayKey;
                const laid = layoutDayEvents(eventsByDate.get(key) ?? [], hourPx);
                return (
                  <div
                    key={key}
                    className={`relative border-l border-gray-100 ${isToday ? 'bg-blue-50/30' : ''}`}
                    style={{ height: VISIBLE_HOURS * hourPx }}
                  >
                    {Array.from({ length: VISIBLE_HOURS }, (_, i) => (
                      <div key={i} className="absolute left-0 right-0 border-t border-gray-100" style={{ top: i * hourPx }} />
                    ))}
                    {isToday && <CurrentTimeLine hourPx={hourPx} />}
                    {laid.map(({ event, startHour, endHour, trueEndHour, col, cols }) => (
                      <button
                        key={event.id}
                        onClick={(ev) => setSelected({ event, rect: ev.currentTarget.getBoundingClientRect() })}
                        className="absolute rounded-md px-1.5 py-0.5 text-left text-white overflow-hidden shadow-sm hover:brightness-95 transition-[filter]"
                        style={{
                          top: startHour * hourPx,
                          // endHour is already floored at MIN_EVENT_PX/hourPx
                          // above (see eventHours) — no separate Math.max
                          // needed here, and it's what layoutDayEvents used
                          // to decide overlap, so this box never paints over
                          // a genuinely-earlier neighboring block.
                          height: (endHour - startHour) * hourPx - 2,
                          left: `calc(${(col / cols) * 100}% + 2px)`,
                          width: `calc(${100 / cols}% - 4px)`,
                          background: EVENT_COLOR,
                        }}
                      >
                        <span className="block text-[11px] font-semibold leading-tight truncate">{event.summary}</span>
                        <span className="block text-[10px] leading-tight truncate opacity-90">
                          {/* trueEndHour, NOT endHour — endHour is a zoom-dependent floor
                              for box height only; using it here made a short event's
                              displayed end time visibly change as you pinched. */}
                          {fmtHour(startHour)} – {fmtHour(trueEndHour)}
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

        <EventNotesSection event={event} />
      </div>
    </div>,
    document.body
  );
}

// Daily 2026-09-11 — notas de cleaners sobre este evento/serie ("para el
// próximo cleaner que le toque esta casa"), visibles para admin y staff (el
// admin las lee en AdminCalendarPage's EventDetailPopover); solo el staff
// puede agregarlas.
function EventNotesSection({ event }: { event: StaffCalendarEvent }) {
  const [notes, setNotes] = useState<EventNote[] | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getEventNotes(event.seriesKey)
      .then((n) => {
        if (!cancelled) setNotes(n);
      })
      .catch(() => {
        if (!cancelled) setNotes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [event.seriesKey]);

  async function handleSend() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setNotesError(null);
    try {
      const note = await addEventNote(event.seriesKey, event.id, body);
      setNotes((prev) => [...(prev ?? []), note]);
      setDraft('');
    } catch {
      setNotesError('Could not save the note. Please try again.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="border-t border-gray-100 pt-2.5 space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
        Notes for the next cleaner
      </p>

      {notes === null && <p className="text-xs text-gray-400">Loading notes...</p>}

      {notes && notes.length > 0 && (
        <div className="space-y-2 max-h-32 overflow-y-auto pr-1">
          {notes.map((n) => (
            <div key={n.id} className="text-xs text-gray-600 bg-gray-50 rounded-lg px-2.5 py-1.5">
              <p className="whitespace-pre-line">{n.body}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">
                {n.author_name} · {DateTime.fromISO(n.created_at).toFormat('LLL d')}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-1.5">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="e.g. the key is under the mat, the dog is friendly..."
          rows={2}
          className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
        <button
          onClick={handleSend}
          disabled={!draft.trim() || sending}
          aria-label="Add note"
          className="p-2 rounded-lg bg-[#031634] text-white disabled:opacity-40 flex-shrink-0"
        >
          <Send size={14} />
        </button>
      </div>
      {notesError && <p className="text-[11px] text-red-500">{notesError}</p>}
    </div>
  );
}
