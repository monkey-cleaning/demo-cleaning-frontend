import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, isSameDay } from "date-fns";
import { RefreshCw, Home } from "lucide-react";
import CalendarPicker from "../components/CalendarPicker";

function loadRecaptchaScript(siteKey: string) {
  return new Promise<void>((resolve, reject) => {
    if (window.grecaptcha) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = `https://www.google.com/recaptcha/api.js?render=${siteKey}`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load reCAPTCHA'));
    document.head.appendChild(script);
  });
}

type Slot = {
  id:       string;
  team:     "team_1" | "team_2" | "team_3";
  start_at: string;
  end_at:   string;
  // windows returned by the lead-aware endpoint also carry slotIds
  slotIds?: string[];
};

type BookingForm = {
  name:    string;
  phone:   string;
  address: string;
  email?:  string;
};

declare global {
  interface Window {
    grecaptcha?: {
      execute: (siteKey: string, opts: { action: string }) => Promise<string>;
    };
  }
}

const API_BASE          = (import.meta as any).env?.VITE_API_URL?.replace(/\/$/, "") || "";
const RECAPTCHA_SITE_KEY = (import.meta as any).env?.VITE_RECAPTCHA_SITE_KEY || "";
const TZ                = "America/Vancouver";
const SLOTS_PER_PAGE    = 4;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatSlotRange(slot: Slot) {
  const start = new Date(slot.start_at);
  const end   = new Date(slot.end_at);

  const day = start.toLocaleDateString("en-US", {
    timeZone: TZ,
    weekday:  "short",
    month:    "short",
    day:      "numeric",
  });

  const startTime = start.toLocaleTimeString("en-US", {
    timeZone: TZ,
    hour:     "numeric",
    minute:   "2-digit",
  });

  const endTime = end.toLocaleTimeString("en-US", {
    timeZone: TZ,
    hour:     "numeric",
    minute:   "2-digit",
  });

  return `${day} — ${startTime} to ${endTime}`;
}

function formatTimeOnly(slot: Slot) {
  const start = new Date(slot.start_at);
  const end   = new Date(slot.end_at);

  const startTime = start.toLocaleTimeString("en-US", {
    timeZone: TZ,
    hour:     "numeric",
    minute:   "2-digit",
  });

  const endTime = end.toLocaleTimeString("en-US", {
    timeZone: TZ,
    hour:     "numeric",
    minute:   "2-digit",
  });

  return `${startTime} - ${endTime}`;
}

function getSlotDate(slot: Slot): Date {
  // Extract date components in America/Vancouver, NOT UTC.
  // A slot at 2026-04-28T00:15:00Z is April 27 at 17:15 in Vancouver —
  // using getUTCDate() would put it one day ahead in the calendar.
  const localDateStr = new Date(slot.start_at).toLocaleDateString("en-CA", {
    timeZone: TZ, // "America/Vancouver"
  }); // → "YYYY-MM-DD"
  const [year, month, day] = localDateStr.split("-").map(Number);
  return new Date(year, month - 1, day); // month is 0-indexed
}

/** Read ?leadId= from the current URL (works with any router). */
function getLeadIdFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get("leadId");
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AvailablePage() {
  const navigate = useNavigate();

  // leadId is read once on mount and stays stable
  const [leadId] = useState<string | null>(() => getLeadIdFromUrl());

  const [slots,   setSlots]   = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState<string | null>(null);
  const [_recaptchaLoaded, setRecaptchaLoaded] = useState(false);

  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [currentPage,  setCurrentPage]  = useState(1);
  const [selected,     setSelected]     = useState<Slot | null>(null);
  const [booking,      setBooking]      = useState<BookingForm>({
    name:    "",
    phone:   "",
    address: "",
    email:   "",
  });

  // Lead data fetched from the backend — used to pre-fill the booking modal.
  const [leadData, setLeadData] = useState<{ fullName: string; email: string; phone: string; address: string } | null>(null);

  const [submitting,      setSubmitting]      = useState(false);
  const [modalSuccessMsg, setModalSuccessMsg] = useState<string | null>(null);
  const [modalErrorMsg,   setModalErrorMsg]   = useState<string | null>(null);

  // ── reCAPTCHA ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (RECAPTCHA_SITE_KEY) {
      loadRecaptchaScript(RECAPTCHA_SITE_KEY)
        .then(() => setRecaptchaLoaded(true))
        .catch(err => {
          console.error('reCAPTCHA load error:', err);
          setErr('Failed to load security verification');
        });
    }
  }, []);

  // ── Fetch lead data for pre-fill ──────────────────────────────────────────
  useEffect(() => {
    if (!leadId) return;
    fetch(`${API_BASE}/api/leads/${encodeURIComponent(leadId)}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Lead not found')))
      .then(data => setLeadData({
        fullName: data.fullName || '',
        email:    data.email    || '',
        phone:    data.phone    || '',
        address:  data.address  || '',
      }))
      .catch(err => console.warn('[AvailablePage] Could not pre-fill lead data:', err.message));
  }, [leadId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived state ──────────────────────────────────────────────────────────
  const canBook = useMemo(() => (
    !!selected &&
    booking.name.trim().length    >= 2 &&
    booking.phone.trim().length   >= 6 &&
    booking.address.trim().length >= 5
  ), [selected, booking]);

  const availableDates = useMemo(() => {
    const dates = new Set<string>();
    slots.forEach(slot => {
      const date = getSlotDate(slot);
      dates.add(date.toDateString());
    });
    return Array.from(dates).map(d => new Date(d));
  }, [slots]);

  const slotsForSelectedDate = useMemo(() => {
    if (!selectedDate) return [];
    return slots.filter(slot => isSameDay(getSlotDate(slot), selectedDate));
  }, [slots, selectedDate]);

  // Group slots that fall in the same time window (same start_at + end_at).
  // Users don't need to know which team they book with, or that more than
  // one team is free at the same time — collapse those into a single
  // bookable entry. The displayed slot is the first one in the group
  // (by team order in the source data); that's the one sent to the backend.
  const groupedSlotsForSelectedDate = useMemo(() => {
    const byWindow = new Map<string, Slot[]>();

    slotsForSelectedDate.forEach(slot => {
      const key = `${slot.start_at}__${slot.end_at}`;
      const group = byWindow.get(key);
      if (group) {
        group.push(slot);
      } else {
        byWindow.set(key, [slot]);
      }
    });

    return Array.from(byWindow.values())
      .map(group => group[0]) // first team in the group is the one we book
      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
  }, [slotsForSelectedDate]);

  const totalPages = useMemo(
    () => Math.ceil(groupedSlotsForSelectedDate.length / SLOTS_PER_PAGE),
    [groupedSlotsForSelectedDate]
  );

  const paginatedSlots = useMemo(() => {
    const start = (currentPage - 1) * SLOTS_PER_PAGE;
    return groupedSlotsForSelectedDate.slice(start, start + SLOTS_PER_PAGE);
  }, [groupedSlotsForSelectedDate, currentPage]);

  // ── Reset page when date changes ───────────────────────────────────────────
  useEffect(() => { setCurrentPage(1); }, [selectedDate]);

  // ── Fetch slots ────────────────────────────────────────────────────────────

  async function fetchSlots() {
    setLoading(true);
    setErr(null);

    try {
      // Append leadId if present so the backend returns correctly-sized windows
      const url = leadId
        ? `${API_BASE}/api/availability?leadId=${encodeURIComponent(leadId)}`
        : `${API_BASE}/api/availability`;

      const r = await fetch(url, {
        method:  "GET",
        headers: { "Content-Type": "application/json" },
      });

      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "Failed to load availability");

      const fetchedSlots = data.slots || [];
      console.log(`[fetchSlots] received ${fetchedSlots.length} slots from backend (requiredHours=${data.requiredHours ?? "n/a"})`);
      fetchedSlots.forEach((s: Slot) => {
        const localDate = new Date(s.start_at).toLocaleDateString("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" });
        const localTime = new Date(s.start_at).toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
        console.log(`  slot team=${s.team} | UTC: ${s.start_at} | ${TZ}: ${localDate} ${localTime}`);
      });

      setSlots(fetchedSlots);

      if (fetchedSlots.length > 0 && !selectedDate) {
        const firstDate = getSlotDate(fetchedSlots[0]);
        console.log(`[fetchSlots] auto-selecting first date: ${firstDate.toDateString()}`);
        setSelectedDate(firstDate);
      }
    } catch (e: any) {
      setErr(e.message || "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchSlots(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Modal helpers ──────────────────────────────────────────────────────────

  function handleSelectDate(date: Date) { setSelectedDate(date); }

  function openBooking(slot: Slot) {
    setSelected(slot);
    setModalSuccessMsg(null);
    setModalErrorMsg(null);
    // Pre-fill with lead data if available; user can still edit all fields.
    setBooking({
      name:    leadData?.fullName || "",
      phone:   leadData?.phone    || "",
      address: leadData?.address  || "",
      email:   leadData?.email    || "",
    });
  }

  function closeBooking() {
    setSelected(null);
    setSubmitting(false);
    setModalSuccessMsg(null);
    setModalErrorMsg(null);
  }

  // ── Submit booking ─────────────────────────────────────────────────────────

  async function submitBooking() {
    console.log('🐒 submitBooking STARTED', { selected, leadId });

    if (!selected) {
      console.log('🐒 No slot selected, aborting');
      return;
    }

    setSubmitting(true);
    setModalErrorMsg(null);
    setModalSuccessMsg(null);

    try {
      if (!RECAPTCHA_SITE_KEY) {
        throw new Error("Missing VITE_RECAPTCHA_SITE_KEY in frontend env");
      }

      if (!window.grecaptcha?.execute) {
        throw new Error("reCAPTCHA is not loaded (grecaptcha.execute missing)");
      }

      const recaptchaToken = await window.grecaptcha.execute(RECAPTCHA_SITE_KEY, {
        action: "book_cleaning",
      });

      // New backend contract: leadId + startIso + team (no longer slotId)
      const payload: Record<string, unknown> = {
        leadId:         leadId ?? undefined,
        startIso:       selected.start_at,
        team:           selected.team,
        name:           booking.name.trim(),
        phone:          booking.phone.trim(),
        address:        booking.address.trim(),
        email:          (booking.email || "").trim() || null,
        recaptchaToken,
      };

      console.log('🐒 Sending booking request', payload);

      const r = await fetch(`${API_BASE}/api/availability/book`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });

      const data = await r.json();
      console.log('🐒 Response', r.status, data);

      if (r.status === 409) {
        // Slot was taken — show message and refresh so the list updates
        setModalErrorMsg(
          "That time slot is no longer available. Please choose another."
        );
        await fetchSlots();
        return;
      }

      if (!r.ok) {
        throw new Error(data?.error || "Booking failed");
      }

      console.log('🐒 Booking SUCCESS');
      setModalSuccessMsg("Booking confirmed! We'll contact you shortly to confirm the details.");

      await fetchSlots();

      setTimeout(() => { closeBooking(); }, 3000);

    } catch (e: any) {
      console.error('🐒 Booking ERROR:', e);
      setModalErrorMsg(e.message || "Unexpected booking error");
    } finally {
      setSubmitting(false);
      console.log('🐒 submitBooking FINISHED');
    }
  }

  // ── Pagination ─────────────────────────────────────────────────────────────

  function goToPage(page: number) {
    if (page >= 1 && page <= totalPages) setCurrentPage(page);
  }

  function goToNextPage() {
    if (currentPage < totalPages) setCurrentPage(currentPage + 1);
  }

  function goToPrevPage() {
    if (currentPage > 1) setCurrentPage(currentPage - 1);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <div className="text-center mb-8 sm:mb-10">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-slate-900">
            Book Your Cleaning
          </h1>
          <p className="mt-3 text-base sm:text-lg text-slate-600">
            Select a date, choose a time slot, and we'll take care of the rest
          </p>
        </div>

        <div className="mb-6 flex justify-center">
          <button
            onClick={() => navigate('/')}
            className="
              inline-flex items-center justify-center gap-2
              px-5 py-2.5 rounded-lg
              border border-slate-300 bg-white text-slate-800
              hover:bg-slate-50 active:scale-95
              transition-all duration-200 shadow-sm
            "
          >
            <Home className="w-4 h-4" />
            Back to Home
          </button>
        </div>

        {err && (
          <div className="mb-6 max-w-2xl mx-auto rounded-lg border border-rose-200 bg-rose-50 px-5 py-4 text-rose-800 shadow-sm">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <p>{err}</p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-slate-300 border-t-slate-900"></div>
              <p className="mt-4 text-slate-600">Loading availability...</p>
            </div>
          </div>
        ) : slots.length === 0 ? (
          <div className="max-w-2xl mx-auto rounded-xl border border-slate-200 bg-white p-10 text-center shadow-sm">
            <svg className="w-16 h-16 mx-auto text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <h3 className="mt-4 text-lg font-medium text-slate-900">No availability right now</h3>
            <p className="mt-2 text-slate-600">Please check back later or contact us directly.</p>
            <button
              onClick={() => navigate('/')}
              className="
                inline-flex items-center justify-center gap-2
                mt-6 px-6 py-3 rounded-[24px]
                bg-slate-900 text-white font-medium
                hover:bg-slate-800 active:scale-95
                transition-all duration-200 shadow-md hover:shadow-lg
              "
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
              Back to Home
            </button>
          </div>
        ) : (
          <div className="grid lg:grid-cols-2 gap-6 lg:gap-8 max-w-6xl mx-auto">
            {/* Calendar */}
            <div>
              <h2 className="text-lg sm:text-xl font-semibold text-slate-900 mb-4">Select a Date</h2>
              <CalendarPicker
                availableDates={availableDates}
                selectedDate={selectedDate}
                onSelectDate={handleSelectDate}
              />
            </div>

            {/* Slot list */}
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-4">
                <h2 className="text-lg sm:text-xl font-semibold text-slate-900">
                  {selectedDate ? (
                    <>Available Times for {format(selectedDate, 'EEEE, MMMM d')}</>
                  ) : (
                    <>Select a date to see available times</>
                  )}
                </h2>
                {groupedSlotsForSelectedDate.length > 0 && (
                  <div className="text-sm text-slate-600 whitespace-nowrap">
                    {groupedSlotsForSelectedDate.length} slot{groupedSlotsForSelectedDate.length !== 1 ? 's' : ''} available
                  </div>
                )}
              </div>

              {selectedDate && groupedSlotsForSelectedDate.length === 0 && (
                <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
                  <p className="text-slate-600">No slots available for this date</p>
                </div>
              )}

              {groupedSlotsForSelectedDate.length > 0 && (
                <>
                  <div className="space-y-3 mb-6">
                    {paginatedSlots.map((slot) => (
                      <div
                        key={`${slot.start_at}__${slot.end_at}`}
                        className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm hover:shadow-md transition-shadow"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                          <div className="text-lg font-semibold text-slate-900">
                            {formatTimeOnly(slot)}
                          </div>

                          <button
                            onClick={() => openBooking(slot)}
                            className="w-full sm:w-auto px-6 py-2.5 rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-colors font-medium shadow-sm"
                          >
                            Book Now
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-slate-200 pt-4">
                      <div className="text-sm text-slate-600 text-center sm:text-left">
                        Page {currentPage} of {totalPages}
                      </div>

                      <div className="flex items-center justify-center gap-2 flex-wrap">
                        <button
                          onClick={goToPrevPage}
                          disabled={currentPage === 1}
                          className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                          </svg>
                        </button>

                        <div className="flex items-center gap-1">
                          {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => {
                            const isCurrentPage = page === currentPage;
                            const showPage =
                              page === 1 ||
                              page === totalPages ||
                              (page >= currentPage - 1 && page <= currentPage + 1);

                            if (!showPage) {
                              if (page === currentPage - 2 || page === currentPage + 2) {
                                return <span key={page} className="px-2 text-slate-400">...</span>;
                              }
                              return null;
                            }

                            return (
                              <button
                                key={page}
                                onClick={() => goToPage(page)}
                                className={`
                                  min-w-[2.5rem] px-3 py-2 rounded-lg font-medium transition-colors
                                  ${isCurrentPage
                                    ? 'bg-slate-900 text-white'
                                    : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}
                                `}
                              >
                                {page}
                              </button>
                            );
                          })}
                        </div>

                        <button
                          onClick={goToNextPage}
                          disabled={currentPage === totalPages}
                          className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}

              <div className="mt-6 flex justify-center sm:justify-start">
                <button
                  onClick={fetchSlots}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                  Refresh availability
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Booking modal */}
      {selected && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200 flex items-start justify-between gap-3 sticky top-0 bg-white z-10">
              <div>
                <div className="text-xl font-semibold text-slate-900">Complete Your Booking</div>
                <div className="text-sm text-slate-600 mt-1">
                  {formatSlotRange(selected)}
                </div>
              </div>
              <button
                onClick={closeBooking}
                className="text-slate-400 hover:text-slate-600 transition-colors"
                aria-label="Close"
                disabled={submitting && !modalSuccessMsg}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Success message */}
              {modalSuccessMsg && (
                <div className="rounded-xl border-2 border-emerald-400 bg-emerald-50 p-6 shadow-lg">
                  <div className="flex items-start gap-4">
                    <div className="rounded-full bg-emerald-500 p-2 flex-shrink-0">
                      <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-xl text-emerald-900">Booking Confirmed!</p>
                      <p className="text-emerald-800 mt-2">{modalSuccessMsg}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Error message */}
              {modalErrorMsg && !modalSuccessMsg && (
                <div className="rounded-xl border-2 border-rose-400 bg-rose-50 p-6 shadow-lg">
                  <div className="flex items-start gap-4">
                    <div className="rounded-full bg-rose-500 p-2 flex-shrink-0">
                      <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-xl text-rose-900">Error</p>
                      <p className="text-rose-800 mt-2">{modalErrorMsg}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Form — hidden after success */}
              {!modalSuccessMsg && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Full Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      value={booking.name}
                      onChange={(e) => setBooking(b => ({ ...b, name: e.target.value }))}
                      className="w-full rounded-lg border border-slate-300 px-4 py-2.5 outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400 transition-shadow"
                      placeholder="John Smith"
                      disabled={submitting}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Phone Number <span className="text-rose-500">*</span>
                    </label>
                    <input
                      value={booking.phone}
                      onChange={(e) => setBooking(b => ({ ...b, phone: e.target.value }))}
                      className="w-full rounded-lg border border-slate-300 px-4 py-2.5 outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400 transition-shadow"
                      placeholder="(604) 555-1234"
                      type="tel"
                      disabled={submitting}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Service Address <span className="text-rose-500">*</span>
                    </label>
                    <input
                      value={booking.address}
                      onChange={(e) => setBooking(b => ({ ...b, address: e.target.value }))}
                      className="w-full rounded-lg border border-slate-300 px-4 py-2.5 outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400 transition-shadow"
                      placeholder="123 Main St, Vancouver, BC"
                      disabled={submitting}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Email <span className="text-slate-400">(optional)</span>
                    </label>
                    <input
                      value={booking.email}
                      onChange={(e) => setBooking(b => ({ ...b, email: e.target.value }))}
                      className="w-full rounded-lg border border-slate-300 px-4 py-2.5 outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400 transition-shadow"
                      placeholder="you@email.com"
                      type="email"
                      disabled={submitting}
                    />
                  </div>

                  <div className="flex items-start gap-2 p-4 bg-slate-50 rounded-lg border border-slate-200">
                    <svg className="w-5 h-5 text-slate-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    <p className="text-xs text-slate-600">
                      This booking is protected by reCAPTCHA to prevent spam and automated submissions.
                    </p>
                  </div>
                </>
              )}
            </div>

            <div className="p-6 border-t border-slate-200 flex items-center justify-end gap-3 sticky bottom-0 bg-white z-10">
              {modalSuccessMsg ? (
                <button
                  onClick={closeBooking}
                  className="px-6 py-2.5 rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-colors font-medium shadow-sm"
                >
                  Close
                </button>
              ) : (
                <>
                  <button
                    onClick={closeBooking}
                    className="px-5 py-2.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors font-medium"
                    disabled={submitting}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={submitBooking}
                    className="px-6 py-2.5 rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium shadow-sm"
                    disabled={!canBook || submitting}
                  >
                    {submitting ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Booking...
                      </span>
                    ) : (
                      "Confirm Booking"
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}