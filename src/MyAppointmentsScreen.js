import { useState } from "react";
import { requestAppointmentsOtp, verifyAppointmentsOtp, cancelAppointmentRequest } from "./services/appointmentService";
import { useLanguage } from "./i18n";

const STATUS_KEYS = {
  "confirmé": "rdv.myapp.status.confirme",
  "en attente": "rdv.myapp.status.enattente",
  "refusé": "rdv.myapp.status.refuse",
  "annulé": "rdv.myapp.status.annule",
};

export default function MyAppointmentsScreen() {
  const { t } = useLanguage();
  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [sessionToken, setSessionToken] = useState(null);
  const [appointments, setAppointments] = useState(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function requestOtp(event) {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      await requestAppointmentsOtp(email);
      setStep("otp");
    } catch (err) {
      setError(err.message);
    } finally {
      setPending(false);
    }
  }

  async function verifyOtp(event) {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      const result = await verifyAppointmentsOtp(email, otp);
      setAppointments(result.appointments);
      setSessionToken(result.sessionToken);
    } catch (err) {
      setError(err.message);
    } finally {
      setPending(false);
    }
  }

  async function cancel(id) {
    await cancelAppointmentRequest(id, sessionToken);
    setAppointments((current) => current.map((item) => (item.id === id ? { ...item, status: "annulé" } : item)));
  }

  if (step === "email" && !appointments) {
    return (
      <section className="rdv-panel">
        <h2>{t("rdv.myapp.title")}</h2>
        <p>{t("rdv.myapp.emailIntro")}</p>
        <form className="manual-code" onSubmit={requestOtp}>
          <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={t("rdv.myapp.emailPlaceholder")} />
          <button disabled={pending}>{pending ? t("rdv.myapp.sending") : t("rdv.myapp.sendCode")}</button>
        </form>
        {error && <p className="qr-error">{error}</p>}
      </section>
    );
  }

  if (step === "otp" && !appointments) {
    return (
      <section className="rdv-panel">
        <h2>{t("rdv.myapp.otpTitle")}</h2>
        <p>{t("rdv.myapp.otpIntroBefore")} <strong>{email}</strong>. {t("rdv.myapp.otpIntroAfter")}</p>
        <form className="manual-code" onSubmit={verifyOtp}>
          <input required value={otp} onChange={(event) => setOtp(event.target.value)} placeholder={t("rdv.myapp.otpPlaceholder")} maxLength={6} />
          <button disabled={pending}>{pending ? t("rdv.myapp.verifying") : t("rdv.myapp.verify")}</button>
        </form>
        {error && <p className="qr-error">{error}</p>}
        <button className="rdv-secondary" onClick={() => { setStep("email"); setError(""); }}>{t("rdv.myapp.changeEmail")}</button>
      </section>
    );
  }

  return (
    <section className="rdv-panel">
      <h2>{t("rdv.myapp.listTitle")}</h2>
      {appointments.length === 0 && <p>{t("rdv.myapp.empty")}</p>}
      {appointments.map((item) => (
        <div className="appointment-row" key={item.id}>
          <div>
            <strong>{item.date} à {item.time}</strong>
            <p>{item.purpose} — {t("rdv.myapp.hostPrefix")} {item.host}</p>
          </div>
          <span className={`status-badge status-${item.status.replace(" ", "-")}`}>
            {STATUS_KEYS[item.status] ? t(STATUS_KEYS[item.status]) : item.status}
          </span>
          {item.status === "en attente" && (
            <button className="rdv-secondary" onClick={() => cancel(item.id)}>{t("rdv.myapp.cancel")}</button>
          )}
        </div>
      ))}
    </section>
  );
}
