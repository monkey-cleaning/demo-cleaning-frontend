// Reschedule assistant — validates client scheduling preferences
// before confirming a drag-and-drop move.
//
// Resolution strategy for clientId:
//   1. Primary:  client_id:<uuid> tag embedded in the GCal event description
//      (written by createCalendarEvent/updateCalendarEvent when clientId is known)
//   2. Fallback: fuzzy name match via /api/admin/clients/search using the
//      event summary (format: "Client Name – Service Type")
//      For events created directly in Google Calendar or before the tag existed.

import { useState, useEffect } from "react";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

function authHeaders(): Record<string, string> {
    const token = localStorage.getItem("admin_blog_token") ?? "";
    return { Authorization: `Bearer ${token}` };
}

export interface PreferenceCheck {
    compatible: boolean;
    message: string;
    hasPreferences: boolean;
    preferredDays: string[];       // ej: ["Tuesday", "Thursday", "Sunday"]
    preferredTime: string | null;  // ej: "9:00 AM - 2:00 PM" o null
    expectedFrequency: string | null; // ej: "Weekly", "Biweekly", "Monthly"
}

// ── Fetch preferences for a known clientId ────────────────────────────────────
async function fetchPreferences(clientId: string) {
    const res = await fetch(
        `${API_BASE}/api/admin/clients/${clientId}/preferences`,
        { headers: authHeaders() },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.preferences ?? null;
}

// ── Resolve clientId from event summary via typeahead search ──────────────────
// Extracts the name part from summaries like "Jane Doe – Deep Cleaning"
async function resolveClientIdByName(summary: string): Promise<string | null> {
    // Take everything before " – " or " - " as the candidate name
    const name = summary.split(/\s[–-]\s/)[0].trim();
    if (name.length < 2) return null;

    const res = await fetch(
        `${API_BASE}/api/admin/clients/search?q=${encodeURIComponent(name)}&limit=1`,
        { headers: authHeaders() },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.clients?.[0]?.id ?? null;
}

// ── Build the PreferenceCheck result from raw prefs + target date ─────────────
function buildCheck(prefs: Record<string, unknown> | null, newStartIso: string): PreferenceCheck {
    if (!prefs) return { compatible: true, message: "", hasPreferences: false, preferredDays: [], preferredTime: null, expectedFrequency: null };
    const DAY_NAME_TO_NUM: Record<string, number> = {
        sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
        thursday: 4, friday: 5, saturday: 6,
    };

    const raw = (prefs.preferred_days as (number | string)[] | null) ?? [];
    const days: number[] = raw.map(d => {
        const n = Number(d);
        if (!isNaN(n)) return n;
        return DAY_NAME_TO_NUM[String(d).toLowerCase()] ?? -1;
    }).filter(n => n >= 0);

    // Preserve original string labels for display (Tuesday, Thursday…)
    const preferredDays: string[] = raw
        .map(d => String(d))
        .filter(d => isNaN(Number(d))); // si son strings los usa directo
    // fallback si eran números: convertir a nombre
    const NUM_TO_DAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const displayDays = preferredDays.length > 0
        ? preferredDays
        : days.map(n => NUM_TO_DAY[n]);

    const preferredTime = (prefs.preferred_time as string | null) ?? null;
    const expectedFrequency = (prefs.expected_frequency as string | null) ?? null;

    // Un cliente puede tener expected_frequency/preferred_time sin
    // preferred_days — antes esto se descartaba entero (hasPreferences:
    // false) y nunca se mostraba nada. Ahora cuenta como "tiene preferencias"
    // igual, solo que sin chequeo de día compatible/incompatible.
    const hasAnyPreference = days.length > 0 || !!preferredTime || !!expectedFrequency;
    if (!hasAnyPreference) {
        return { compatible: true, message: "", hasPreferences: false, preferredDays: [], preferredTime: null, expectedFrequency: null };
    }
    if (days.length === 0) {
        return { compatible: true, message: "", hasPreferences: true, preferredDays: [], preferredTime, expectedFrequency };
    }

    const dow = new Date(newStartIso).getDay();
    const compatible = days.includes(dow);
    const DAY_LABELS = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];
    const message = compatible
        ? `Client prefers ${DAY_LABELS[dow]} ✓`
        : `Client doesn't usually receive services on ${DAY_LABELS[dow]}`;

    return { compatible, message, hasPreferences: true, preferredDays: displayDays, preferredTime, expectedFrequency };
 }

// ── Main hook ─────────────────────────────────────────────────────────────────

/**
 * Given a GCal event and the proposed new start time, returns whether
 * the reschedule is compatible with the client's saved day preferences.
 *
 * @param explicitClientId  client_id parsed from the event description (may be null)
 * @param eventSummary      event title — used as fallback to resolve client by name
 * @param newStartIso       proposed new start datetime (ISO string)
 */
export function useClientPreferences(
    explicitClientId: string | null,
    eventSummary: string,
    newStartIso: string,
) {
    const [preferenceCheck, setPreferenceCheck] = useState<PreferenceCheck | null>(null);
    const [loadingPreference, setLoadingPreference] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setLoadingPreference(true);
        setPreferenceCheck(null);

        (async () => {
            try {
                let clientId = explicitClientId;

                // 🔍 DEBUG — sacar después de confirmar
                console.log("[useClientPreferences] explicitClientId=", explicitClientId, "summary=", eventSummary);

                if (!clientId && eventSummary.trim().length >= 2) {
                    clientId = await resolveClientIdByName(eventSummary);
                    console.log("[useClientPreferences] resolved by name=", clientId);
                }

                if (!clientId) {
                    if (!cancelled) setPreferenceCheck({ compatible: true, message: "", hasPreferences: false, preferredDays: [], preferredTime: null, expectedFrequency: null});
                    return;
                }

                const prefs = await fetchPreferences(clientId);
                console.log("[useClientPreferences] prefs=", prefs);  // 🔍 DEBUG
                if (!cancelled) setPreferenceCheck(buildCheck(prefs, newStartIso));
            } catch (e) {
                console.error("[useClientPreferences] error:", e);  // 🔍 DEBUG — era silencioso antes
                if (!cancelled) setPreferenceCheck({ compatible: true, message: "", hasPreferences: false, preferredDays: [], preferredTime: null, expectedFrequency: null });
            } finally {
                if (!cancelled) setLoadingPreference(false);
            }
        })();

        return () => { cancelled = true; };
    }, [explicitClientId, eventSummary, newStartIso]);

    return { preferenceCheck, loadingPreference };
}