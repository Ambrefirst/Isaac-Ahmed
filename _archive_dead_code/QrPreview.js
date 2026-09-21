import { useEffect, useState } from "react";
import QRCode from "qrcode";

export default function QrPreview({ value }) {
  const [dataUrl, setDataUrl] = useState("");

  useEffect(() => {
    QRCode.toDataURL(value, { margin: 1, width: 180 })
      .then(setDataUrl)
      .catch(() => setDataUrl(""));
  }, [value]);

  if (!dataUrl) return null;
  return <img className="qr-generated" src={dataUrl} alt={`QR code de l'invitation ${value}`} />;
}
