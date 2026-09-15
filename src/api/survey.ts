// LAB413 — cliente de la API pública de la encuesta post-servicio.
// Sin auth. La consume src/pages/SurveyPage.tsx.

import { API_BASE_URL } from './client';

export interface SurveyState {
  ok: boolean;
  name: string | null;
  rating: number | null;
  alreadyResponded: boolean;
  hasFeedback: boolean;
  hasClickedReview: boolean;
  reviewUrl?: string | null;
  error?: string;
}

/** Graba la nota (idempotente). Devuelve el estado resultante. */
export async function submitRating(
  token: string,
  rating: number,
): Promise<SurveyState> {
  const res = await fetch(
    `${API_BASE_URL}/api/public/survey/${encodeURIComponent(token)}/${rating}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' } },
  );
  const data = (await res.json().catch(() => ({}))) as SurveyState;
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `survey_error_${res.status}`);
  }
  return data;
}

/** Guarda el comentario para una nota < 5. */
export async function submitFeedback(
  token: string,
  comment: string,
): Promise<void> {
  const res = await fetch(
    `${API_BASE_URL}/api/public/survey/${encodeURIComponent(token)}/feedback`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment }),
    },
  );
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!res.ok || !data.ok) throw new Error(data.error || `feedback_error_${res.status}`);
}

/**
 * URL del endpoint que graba el click y redirige a Google Reviews.
 * Tiene que ser navegación real del browser (window.location), no fetch —
 * el backend responde 302.
 */
export function goReviewUrl(token: string): string {
  return `${API_BASE_URL}/api/public/survey/${encodeURIComponent(token)}/go-review`;
}
