import { useEffect, useRef } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { useLanguage } from "./i18n";

function safeStop(scanner) {
  try {
    const result = scanner.stop();
    if (result && typeof result.catch === "function") result.catch(() => {});
  } catch (err) {
    // stop() throws synchronously when the scanner never reached a running state — safe to ignore.
  }
}

export default function QrScanner({ onScan, onError }) {
  const { t } = useLanguage();
  const elementId = useRef(`qr-reader-${Math.random().toString(36).slice(2)}`).current;

  useEffect(() => {
    const scanner = new Html5Qrcode(elementId);
    let cancelled = false;
    let handled = false;

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 240 },
        (decodedText) => {
          if (handled) return;
          handled = true;
          safeStop(scanner);
          onScan(decodedText);
        }
      )
      .then(() => {
        // React.StrictMode mounts/unmounts effects once in dev before the real mount;
        // if cleanup already fired by the time start() resolves, close this stray camera stream.
        if (cancelled) safeStop(scanner);
      })
      .catch(() => {
        if (handled || cancelled) return;
        onError(t("camera.unavailable"));
      });

    return () => {
      cancelled = true;
      handled = true;
      safeStop(scanner);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elementId]);

  return <div id={elementId} className="qr-reader" />;
}
