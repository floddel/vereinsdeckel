import QRCode from "qrcode";

/** QR-Code als SVG-Text (lokal erzeugt, kein externer Dienst). */
export function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
}
