// LAB413 — Página standalone de la encuesta post-servicio.
//
// Destino de los links del email "How did we do?". El cliente llega a
// /survey/:token/:rating; la página graba la nota apenas monta (POST) y según
// el resultado:
//   - nota 5  → agradece y ofrece dejar una reseña en Google
//   - nota 1–4 → pide un comentario (sin ninguna mención a Google)
// En los estados finales muestra un botón "Back to our site" y auto-redirige
// a la home a los ~8s.
//
// Sin navbar/footer del sitio: página enfocada (logo + card).

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import logo from '../assets/logo-desktop.png';
import { BRAND_NAME } from '../config/brand';
import {
  submitRating,
  submitFeedback,
  goReviewUrl,
  type SurveyState,
} from '../api/survey';

const HOME_URL = '/';
const AUTO_REDIRECT_MS = 8000;

type View =
  | { kind: 'loading' }
  | { kind: 'review'; state: SurveyState }
  | { kind: 'feedbackForm'; state: SurveyState }
  | { kind: 'done'; title: string; message: string }
  | { kind: 'error'; message: string };

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4 py-12 font-montserrat">
      <img src={logo} alt={BRAND_NAME} className="h-10 w-auto mb-8" />
      <div className="w-full max-w-md rounded-2xl border border-navy/10 shadow-sm p-8 text-center">
        {children}
      </div>
      <p className="mt-6 text-[12px] text-navy/40">{BRAND_NAME}</p>
    </div>
  );
}

function BackButton() {
  return (
    <a
      href={HOME_URL}
      className="inline-flex items-center justify-center gap-2 bg-navy text-white font-medium text-[15px] rounded-[24px] px-8 py-3.5 hover:bg-navy/90 active:scale-95 transition-all duration-200"
    >
      Back to our site
    </a>
  );
}

export default function SurveyPage() {
  const { token = '', rating: ratingParam = '' } = useParams();
  const rating = Number.parseInt(ratingParam, 10);
  const ratingValid = Number.isInteger(rating) && rating >= 1 && rating <= 5;

  const [view, setView] = useState<View>({ kind: 'loading' });
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const ranRef = useRef(false);

  // Auto-redirect en los estados finales.
  useEffect(() => {
    if (view.kind === 'done' || view.kind === 'error') {
      const t = setTimeout(() => {
        window.location.href = HOME_URL;
      }, AUTO_REDIRECT_MS);
      return () => clearTimeout(t);
    }
  }, [view.kind]);

  // Graba la nota al montar (guard contra el doble-run de StrictMode).
  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    if (!token || !ratingValid) {
      setView({
        kind: 'error',
        message:
          "This link doesn't look valid. If you'd like to share feedback, just reply to our email.",
      });
      return;
    }

    submitRating(token, rating)
      .then((state) => {
        if (state.rating === 5) {
          if (state.hasClickedReview) {
            setView({
              kind: 'done',
              title: 'Thanks again! 🎉',
              message: 'You already left us a rating — we appreciate it.',
            });
          } else {
            setView({ kind: 'review', state });
          }
        } else if (state.hasFeedback) {
          setView({
            kind: 'done',
            title: "We've got your feedback",
            message:
              'Thanks — the team already has your comment and is looking at it.',
          });
        } else {
          setView({ kind: 'feedbackForm', state });
        }
      })
      .catch(() => {
        setView({
          kind: 'error',
          message:
            "We couldn't record your rating just now. Please try again in a moment, or reply to our email.",
        });
      });
  }, [token, rating, ratingValid]);

  async function onSubmitFeedback(e: React.FormEvent) {
    e.preventDefault();
    if (!comment.trim() || submitting) return;
    setSubmitting(true);
    try {
      await submitFeedback(token, comment.trim());
      setView({
        kind: 'done',
        title: 'Thank you — we hear you',
        message:
          "Your feedback went straight to our team. We take it seriously and we'll use it to do better next time.",
      });
    } catch {
      setView({
        kind: 'error',
        message:
          "We couldn't save your feedback just now. Please try again in a moment, or reply to our email.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (view.kind === 'loading') {
    return (
      <Shell>
        <p className="text-navy/60 text-[15px]">Saving your rating…</p>
      </Shell>
    );
  }

  if (view.kind === 'error') {
    return (
      <Shell>
        <h1 className="text-[20px] font-bold text-navy mb-3">Something went wrong</h1>
        <p className="text-[15px] text-navy/60 leading-relaxed mb-7">{view.message}</p>
        <BackButton />
      </Shell>
    );
  }

  if (view.kind === 'done') {
    return (
      <Shell>
        <h1 className="text-[20px] font-bold text-navy mb-3">{view.title}</h1>
        <p className="text-[15px] text-navy/60 leading-relaxed mb-7">{view.message}</p>
        <BackButton />
        <p className="mt-4 text-[12px] text-navy/40">Taking you back to our site…</p>
      </Shell>
    );
  }

  if (view.kind === 'review') {
    const name = view.state.name?.split(' ')[0];
    return (
      <Shell>
        <h1 className="text-[22px] font-bold text-navy mb-3">
          You made our day{name ? `, ${name}` : ''}! 🎉
        </h1>
        <p className="text-[15px] text-navy/60 leading-relaxed mb-7">
          Thank you for the 5-star rating. If you have a moment, a quick Google
          review helps our small local team more than you know.
        </p>
        <a
          href={goReviewUrl(token)}
          className="inline-flex items-center justify-center gap-2 bg-[#0b8043] text-white font-semibold text-[15px] rounded-[24px] px-8 py-3.5 hover:brightness-95 active:scale-95 transition-all duration-200"
        >
          Leave a Google review
        </a>
        <div className="mt-5">
          <a href={HOME_URL} className="text-[13px] text-navy/50 underline hover:text-navy">
            No thanks, back to the site
          </a>
        </div>
      </Shell>
    );
  }

  // feedbackForm
  const name = view.state.name?.split(' ')[0];
  return (
    <Shell>
      <h1 className="text-[20px] font-bold text-navy mb-3">
        Thanks{name ? `, ${name}` : ''} — we hear you
      </h1>
      <p className="text-[15px] text-navy/60 leading-relaxed mb-5">
        We're sorry it wasn't a 5-star experience. We'd really like to understand
        what we could have done better:
      </p>
      <form onSubmit={onSubmitFeedback} className="text-left">
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={5}
          required
          placeholder="What could we have done better?"
          className="w-full rounded-xl border border-navy/20 p-3 text-[14px] focus:outline-none focus:ring-2 focus:ring-navy/30 resize-y"
        />
        <button
          type="submit"
          disabled={submitting || !comment.trim()}
          className="mt-3 w-full bg-navy text-white font-semibold text-[15px] rounded-[24px] px-8 py-3.5 hover:bg-navy/90 active:scale-95 transition-all duration-200 disabled:opacity-50 disabled:active:scale-100"
        >
          {submitting ? 'Sending…' : 'Send feedback'}
        </button>
      </form>
      <div className="mt-4">
        <a href={HOME_URL} className="text-[13px] text-navy/50 underline hover:text-navy">
          Skip, back to the site
        </a>
      </div>
    </Shell>
  );
}
