// components/payroll/Collapsible.tsx
// Payroll (2026-11-02) — las tarjetas de la página se pueden plegar para que
// la quincena entre en pantalla sin scrollear. El título es el botón: el
// contenido de la tarjeta queda montado pero oculto (`hidden`), así un
// formulario a medio llenar no se pierde al plegarla. El estado se recuerda
// por tarjeta en este navegador (solo una comodidad: si el storage no anda,
// la tarjeta arranca desplegada).
import { useCallback, useState, type KeyboardEvent } from 'react';
import { ChevronDown } from 'lucide-react';

const STORAGE_PREFIX = 'payroll.collapsed.';

function readCollapsed(id: string): boolean {
  try {
    return localStorage.getItem(STORAGE_PREFIX + id) === '1';
  } catch {
    return false;
  }
}

function writeCollapsed(id: string, collapsed: boolean) {
  try {
    if (collapsed) localStorage.setItem(STORAGE_PREFIX + id, '1');
    else localStorage.removeItem(STORAGE_PREFIX + id);
  } catch {
    // sin storage (ventana privada, bloqueado): solo dura esta sesión.
  }
}

/** `id` identifica la tarjeta; tiene que ser estable y único en la página. */
export function useCollapsed(id: string) {
  const [collapsed, setCollapsed] = useState(() => readCollapsed(id));

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      writeCollapsed(id, !prev);
      return !prev;
    });
  }, [id]);

  // Atributos para el bloque del título (se esparcen con {...titleProps}).
  const titleProps = {
    role: 'button' as const,
    tabIndex: 0,
    'aria-expanded': !collapsed,
    title: collapsed ? 'Expand' : 'Collapse',
    onClick: toggle,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    },
  };

  return { collapsed, toggle, titleProps };
}

export function Chevron({ collapsed }: { collapsed: boolean }) {
  return (
    <ChevronDown
      size={14}
      aria-hidden
      className={`flex-shrink-0 text-gray-400 transition-transform ${collapsed ? '-rotate-90' : ''}`}
    />
  );
}
