// LAB482 - la direccion de un evento, clickeable: abre Google Maps con la
// direccion cargada. Compartido por la vista de cleaners (StaffCalendarPage) y
// el dashboard (AdminCalendarPage).
//
// Es un <a> y no un boton con window.open a proposito: asi el celular lo trata
// como cualquier link (abre la app de Maps, permite mantener apretado para
// abrir en otra pestana) y funciona igual si el JS todavia no cargo.
import { mapsSearchUrl } from '../lib/maps';

interface Props {
  address: string;
  /** Clases del texto, para que herede el estilo de cada vista. */
  className?: string;
}

export default function AddressLink({ address, className = '' }: Props) {
  return (
    <a
      href={mapsSearchUrl(address)}
      target="_blank"
      rel="noopener noreferrer"
      title="Open in Google Maps"
      className={`text-left underline decoration-dotted underline-offset-2 hover:decoration-solid ${className}`}
    >
      {address}
    </a>
  );
}
