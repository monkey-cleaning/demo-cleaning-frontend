// src/components/common/PlaceholderImage.tsx
//
// Reemplaza fotos reales de Monkey Cleaning en el fork de marca blanca.
// Un solo componente reutilizable en vez de conseguir ~20 fotos de stock
// distintas — bloque con la paleta nueva (navy/gold) + ícono genérico.
// LAB, ago 2026.

interface PlaceholderImageProps {
  className?: string;
  /** Texto corto opcional, ej. "Residential Cleaning" — se muestra centrado. */
  label?: string;
}

export default function PlaceholderImage({ className = '', label }: PlaceholderImageProps) {
  return (
    <div
      className={`bg-gradient-to-br from-gray-100 to-gray-500 0 flex items-center justify-center ${className}`}
      role="img"
      aria-label={label ?? 'Placeholder image'}
    >
      <svg
        width="15%"
        height="15%"
        viewBox="0 0 24 24"
        fill="none"
        stroke="white"
        strokeWidth="1.5"
        className="opacity-60"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="M21 15l-5-5L5 21" />
      </svg>
      {label && (
        <span className="sr-only">{label}</span>
      )}
    </div>
  );
}