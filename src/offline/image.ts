// LAB463 — las fotos que se guardan para enviar después (y las que se suben en
// el momento) se achican antes: una foto de celular pesa 3–8 MB y el
// almacenamiento del navegador es limitado, sobre todo en iPhone.
const MAX_SIDE = 1600;
const QUALITY = 0.72;

export async function compressImage(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
    // Si por algún motivo quedó más grande que el original, quedarse con el original.
    return blob && blob.size < file.size ? blob : file;
  } catch {
    // Formato que el navegador no sabe decodificar: subir el original tal cual.
    return file;
  }
}

export function newClientRef(): string {
  return crypto.randomUUID();
}
