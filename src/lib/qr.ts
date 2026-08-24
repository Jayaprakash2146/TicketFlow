import QRCode from "qrcode";

export async function qrDataUrl(payload: string): Promise<string> {
  return QRCode.toDataURL(payload, {
    width: 320,
    margin: 2,
    errorCorrectionLevel: "M",
    color: { dark: "#0b1120", light: "#ffffff" },
  });
}
