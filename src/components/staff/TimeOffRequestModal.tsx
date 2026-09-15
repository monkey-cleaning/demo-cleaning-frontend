import { useState } from 'react';
import { X } from 'lucide-react';
import { createTimeOffRequest } from '../../api/staffRequests';

// LAB425 — modal simple para pedir licencia/vacaciones. Esto NO bloquea la
// agenda por sí solo (ver time_off_requests en la migración LAB425): es solo
// el pedido + un mail a ops, que carga el bloqueo real a mano si lo aprueba.
export default function TimeOffRequestModal({
  onClose,
  onSubmitted,
}: {
  onClose: () => void;
  onSubmitted?: () => void;
}) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDate || !endDate) {
      setError('Please pick a start and end date.');
      return;
    }
    if (endDate < startDate) {
      setError('End date must be on or after the start date.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await createTimeOffRequest({
        start_date: startDate,
        end_date: endDate,
        reason: reason.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      setDone(true);
      onSubmitted?.();
    } catch {
      setError('Could not send your request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/40 flex items-center justify-center px-4"
      onMouseDown={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-[#031634]">Request time off</h2>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-100 text-gray-500">
            <X size={16} />
          </button>
        </div>

        {done ? (
          <div className="py-4 text-center">
            <p className="text-sm text-gray-700">
              Sent — ops will follow up with you.
            </p>
            <button
              onClick={onClose}
              className="mt-4 w-full py-2 rounded-md bg-[#031634] text-white text-sm"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Start date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full border rounded-md px-2 py-1.5 text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">End date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full border rounded-md px-2 py-1.5 text-sm"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Reason (optional)</label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full border rounded-md px-2 py-1.5 text-sm"
                placeholder="e.g. Personal, medical, travel"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Notes (optional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full border rounded-md px-2 py-1.5 text-sm resize-none"
              />
            </div>

            {error && <p className="text-xs text-red-500">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2 rounded-md bg-[#031634] text-white text-sm disabled:opacity-60"
            >
              {submitting ? 'Sending...' : 'Send request'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
