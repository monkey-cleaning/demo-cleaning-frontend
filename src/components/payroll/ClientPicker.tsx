// components/payroll/ClientPicker.tsx
// Selector de un cliente REAL del CRM para Payroll (propinas): escribís el
// nombre, sugiere los existentes y, si no está, permite crearlo con el mismo
// formulario del CRM. Nunca queda texto libre: el valor es siempre un cliente
// con id.
import { useEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { searchClients, clientDisplayName, type Client } from '../../pages/AdminInvoicesPage';
import { ClientFormModal } from '../admin/ClientFormModal';

export interface PickedClient {
  id: string;
  name: string;
}

export default function ClientPicker({
  value,
  onChange,
  initialQuery = '',
  className = '',
}: {
  value: PickedClient | null;
  onChange: (client: PickedClient | null) => void;
  /** Texto con el que arranca la búsqueda (p. ej. un nombre viejo escrito a mano). */
  initialQuery?: string;
  className?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<Client[]>([]);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Búsqueda con debounce; ignora respuestas viejas si el usuario siguió escribiendo.
  useEffect(() => {
    if (value || query.trim().length < 2) {
      setResults([]);
      return;
    }
    let stale = false;
    const t = setTimeout(async () => {
      try {
        const found = await searchClients(query.trim());
        if (!stale) setResults(found);
      } catch {
        if (!stale) setResults([]);
      }
    }, 250);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [query, value]);

  // Cierra el desplegable al hacer clic afuera.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  function pick(c: { id: string; name: string }) {
    onChange({ id: c.id, name: c.name });
    setQuery('');
    setOpen(false);
  }

  const inputCls =
    'text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-navy';

  if (value) {
    return (
      <div className={`flex items-center gap-1.5 ${className}`}>
        <span className="inline-flex items-center gap-1.5 text-xs bg-white border border-gray-200 rounded-lg pl-2.5 pr-1 py-1 text-navy min-w-0">
          <span className="truncate">{value.name}</span>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="p-0.5 rounded-md text-gray-300 hover:text-red-500"
            title="Change client"
            aria-label="Change client"
          >
            <X size={12} />
          </button>
        </span>
      </div>
    );
  }

  const trimmed = query.trim();

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search a client…"
        className={`${inputCls} w-full`}
        autoComplete="off"
      />
      {open && trimmed.length >= 2 && (
        <div className="absolute z-20 mt-1 w-full min-w-[220px] max-h-56 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
          {results.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => pick({ id: c.id, name: clientDisplayName(c) })}
              className="block w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50"
            >
              <span className="text-navy font-medium">{clientDisplayName(c)}</span>
              {c.email && <span className="ml-1.5 text-gray-400">{c.email}</span>}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setCreating(true);
            }}
            className="flex items-center gap-1.5 w-full text-left px-3 py-1.5 text-xs text-navy font-semibold border-t border-gray-100 hover:bg-gray-50"
          >
            <Plus size={12} /> Create new client “{trimmed}”
          </button>
        </div>
      )}
      {creating && (
        <ClientFormModal
          zIndex="z-[90]"
          initialName={trimmed}
          onClose={() => setCreating(false)}
          onSaved={(c) => {
            const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || trimmed;
            pick({ id: c.id, name });
            setCreating(false);
          }}
        />
      )}
    </div>
  );
}
