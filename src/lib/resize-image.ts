/**
 * Bild im Browser verkleinern, bevor es hochgeladen wird (spart Speicher und Datenvolumen).
 * Nur im Browser verwenden.
 */
export async function resizeImage(
  file: File,
  { maxSize, type = "image/jpeg", quality = 0.85 }: { maxSize: number; type?: "image/jpeg" | "image/png" | "image/webp"; quality?: number },
): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Bild konnte nicht verarbeitet werden");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Bild konnte nicht verarbeitet werden"))), type, quality),
  );
}
