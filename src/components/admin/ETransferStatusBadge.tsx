export type ETransferStatus = 'received' | 'pending' | 'discrepancy';

const META: Record<ETransferStatus, { label: string; cls: string }> = {
  received:    { label: 'Received',    cls: 'bg-emerald-50 text-emerald-700' },
  pending:     { label: 'Pending',     cls: 'bg-gray-100   text-gray-500'    },
  discrepancy: { label: 'Discrepancy', cls: 'bg-red-50     text-red-600'     },
};

export function ETransferStatusBadge({ status }: { status: ETransferStatus }) {
  const { label, cls } = META[status] ?? META.pending;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold ${cls}`}>
      {label}
    </span>
  );
}