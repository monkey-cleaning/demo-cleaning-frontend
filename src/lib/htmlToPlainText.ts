// lib/htmlToPlainText.ts
//
// Some fields (event descriptions, appointment special_instructions) are
// stored as inner HTML (<p>, <strong>, <br>, …) instead of plain text — e.g.
// events created via Zoho/GCal integrations. This converts that HTML into
// readable plain text — preserving paragraph breaks and emojis, dropping the
// tags — so it never leaks into the UI as literal "<p>", "<strong>", etc.
// Safe to run on already-plain text (no-op if there are no tags to strip).
//
// Was a local function in AdminCalendarPage.tsx; moved here (LAB418) so
// lib/historyFormat.ts can reuse it for the audit trail's old/new values.
export function htmlToPlainText(html: string | null | undefined): string {
  if (!html) return "";
  if (!/<[a-z][\s\S]*>/i.test(html)) return html; // no HTML tags, leave as-is
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li)>/gi, "\n\n")
    .replace(/<(p|div|li)[^>]*>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
