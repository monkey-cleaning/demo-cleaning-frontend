import { useState } from 'react';
import { X } from 'lucide-react';
import { createComplaint } from '../../api/staffRequests';

// LAB425 — modal simple para mandar un reclamo a ops. Solo texto libre por
// ahora — sin categorías ni adjuntos.
export default function ComplaintModal({
  onClose,
  onSubmitted,
}: {
  onClose: () => void;
  onSubmitted?: () => void;
}) {
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) {
      setError('Please write your issue before sending.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await createComplaint(message.trim());
      setDone(true);
      onSubmitted?.();
    } catch {
      setError('Could not send your message. Please try again.');
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
          <h2 className="text-base font-semibold text-[#031634]">Report an issue</h2>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-100 text-gray-500">
            <X size={16} />
          </button>
        </div>

        {done ? (
          <div className="py-4 text-center">
            <p className="text-sm text-gray-700">Sent — ops will follow up with you.</p>
            <button
              onClick={onClose}
              className="mt-4 w-full py-2 rounded-md bg-[#031634] text-white text-sm"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">What's going on?</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                className="w-full border rounded-md px-2 py-1.5 text-sm resize-none"
                placeholder="Describe the issue..."
                autoFocus
              />
            </div>

            {error && <p className="text-xs text-red-500">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2 rounded-md bg-[#031634] text-white text-sm disabled:opacity-60"
            >
              {submitting ? 'Sending...' : 'Send'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
