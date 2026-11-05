// LAB482 - link a Google Maps desde la direccion de un evento.
//
// Se usa la Maps URLs API (https://developers.google.com/maps/documentation/urls)
// y no los esquemas propios de cada app (comgooglemaps://, maps://): estas URLs
// https funcionan en la computadora y en el celular abren directamente la app de
// Google Maps por app links, sin que haya que detectar plataforma ni dejar al
// cleaner en una pestana en blanco si no la tiene instalada.
//
// Alcanza con esta URL sola: probado en Android, la ficha del lugar ya trae
// "Como llegar" y la foto de Street View a un toque de distancia. Por eso no hay
// links separados para ruta ni para Street View: eran un paso de mas para llegar
// a lo mismo, y Street View ademas obligaba a geocodificar la direccion.

/** El mapa con la direccion marcada. */
export function mapsSearchUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}
