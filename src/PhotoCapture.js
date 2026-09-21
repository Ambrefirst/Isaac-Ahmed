import { useEffect, useRef, useState } from "react";
import { useLanguage } from "./i18n";

export default function PhotoCapture({ onCapture }) {
  const { t } = useLanguage();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const [active, setActive] = useState(false);
  const [captured, setCaptured] = useState(false);
  const [photoDataUrl, setPhotoDataUrl] = useState("");
  const [error, setError] = useState("");

  function stopStream() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }

  async function activate() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      streamRef.current = stream;
      setActive(true);
    } catch (err) {
      setError(t("camera.unavailable"));
    }
  }

  useEffect(() => {
    // The <video> element only exists once `active` is true, so the stream can only be
    // attached after that render — doing it inside activate() targets a ref that is still null.
    if (active && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [active]);

  function capture() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    stopStream();
    setActive(false);
    setCaptured(true);
    setPhotoDataUrl(canvas.toDataURL("image/jpeg", 0.85));
    onCapture();
  }

  function retake() {
    setCaptured(false);
    setPhotoDataUrl("");
    activate();
  }

  useEffect(() => () => stopStream(), []);

  return (
    <div className="photo-capture">
      {!active && !captured && (
        <button type="button" className="rdv-secondary" onClick={activate}>{t("photo.activate")}</button>
      )}
      {active && (
        <>
          <video ref={videoRef} className="photo-video" muted playsInline />
          <button type="button" className="rdv-secondary" onClick={capture}>{t("photo.capture")}</button>
        </>
      )}
      {captured && (
        <>
          <img src={photoDataUrl} alt={t("photo.alt")} className="photo-preview" />
          <p className="photo-done">{t("photo.done")}</p>
          <button type="button" className="rdv-secondary" onClick={retake}>{t("photo.retake")}</button>
        </>
      )}
      <canvas ref={canvasRef} style={{ display: "none" }} />
      {error && <p className="qr-error">{error}</p>}
    </div>
  );
}
