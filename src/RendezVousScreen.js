import React, { useState } from "react";
import "./RendezVousScreen.css";
import { getVisitFromInvitation, recordDeparture, submitAppointmentRequest } from "./services/appointmentService";
import { prepareHostNotification } from "./services/notificationService";
import QrScanner from "./QrScanner";
import PhotoCapture from "./PhotoCapture";
import MyAppointmentsScreen from "./MyAppointmentsScreen";
import { useLanguage } from "./i18n";

const DATA_CENTER_VALUES = ["libreville", "douala", "abidjan"];
const ACCESS_TYPE_VALUES = ["visite", "interne", "intervention", "prestataire", "client", "stagiaire", "livraison"];
const HOST_VALUES = ["site_manager", "commercial", "technique", "securite", "rh"];

const STEP_HEADER_KEYS = {
  actions: "rdv.header.actions",
  create: "rdv.header.create",
  "identify-choice": "rdv.header.identify-choice",
  "manual-code": "rdv.header.manual-code",
  scanner: "rdv.header.scanner",
  summary: "rdv.header.summary",
  notify: "rdv.header.notify",
  "my-appointments": "rdv.header.my-appointments",
  "request-done": "rdv.header.request-done",
  "request-failed": "rdv.header.request-failed",
  "departure-done": "rdv.header.departure-done",
};

/* Le depart emprunte les memes ecrans que l'arrivee : meme code, meme camera.
   Seuls les titres changent, pour que le visiteur sache lequel des deux il est
   en train de faire. */
const DEPARTURE_HEADER_KEYS = {
  "identify-choice": "rdv.header.departure-choice",
  "manual-code": "rdv.header.departure-code",
  "scanner": "rdv.header.departure-scanner",
};

const BACK_TARGETS = {
  "identify-choice": "actions",
  "manual-code": "identify-choice",
  "scanner": "identify-choice",
  "summary": "identify-choice",
  "create": "actions",
  "request-failed": "create",
  "my-appointments": "actions",
  "departure-done": "actions",
};

export default function RendezVousScreen({ onMenu }) {
  const { t } = useLanguage();
  const DATA_CENTERS = DATA_CENTER_VALUES.map((value) => ({ value, label: t(`rdv.datacenter.${value}`) }));
  const ACCESS_TYPES = ACCESS_TYPE_VALUES.map((value) => ({ value, label: t(`rdv.accesstype.${value}`) }));
  const HOSTS = HOST_VALUES.map((value) => ({ value, label: t(`rdv.host.${value}`) }));
  const [step, setStep] = useState("actions");
  const [scanError, setScanError] = useState("");
  const [manualCode, setManualCode] = useState("");
  const [visit, setVisit] = useState(null);
  const [notification, setNotification] = useState(null);
  /* "arrivee" ou "depart" : les ecrans de saisie du code sont partages, c'est
     ce drapeau qui decide de ce que l'on fait du code une fois lu. */
  const [mode, setMode] = useState("arrivee");
  const [departure, setDeparture] = useState(null);
  const [request, setRequest] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    company: "",
    jobTitle: "",
    host: "site_manager",
    dataCenter: "libreville",
    accessType: "visite",
    date: "",
    endDate: "",
    time: "",
    purpose: "",
    referrerName: "",
    referrerPhone: "",
    remarks: "",
    idDocumentProvided: false,
    photoProvided: false,
    termsAccepted: false,
  });
  /* Appelee depuis le recapitulatif, quand la lecture du code a revele une
     visite deja ouverte. On ne passe pas par setMode puis scan : l'etat de React
     n'est pas encore a jour au moment ou scan s'executerait. */
  async function enregistrerSortie(codeVisite) {
    setScanError("");
    try {
      setDeparture(await recordDeparture(codeVisite));
      setStep("departure-done");
    } catch (err) {
      setScanError(err.message);
    }
  }
  async function scan(decodedCode) {
    setScanError("");
    try {
      if (mode === "depart") {
        setDeparture(await recordDeparture(decodedCode));
        setStep("departure-done");
        return;
      }
      const foundVisit = await getVisitFromInvitation(decodedCode);
      setVisit(foundVisit);
      setStep("summary");
    } catch (err) {
      setScanError(err.message);
    }
  }
  function ouvrir(nouveauMode) {
    setMode(nouveauMode);
    setScanError("");
    setManualCode("");
    setStep("identify-choice");
  }
  async function notify() {
    try {
      setNotification(await prepareHostNotification(visit));
    } catch (err) {
      /* Le routeur explique pourquoi il refuse : code d'un rendez-vous annule,
         ou presente un autre jour. Ce message vaut mieux que le repli generique. */
      setNotification({ message: err.message || t("rdv.notify.fallback") });
    }
    setStep("notify");
  }
  const updateRequest = (field, value) => setRequest({ ...request, [field]: value });
  async function submitRequest(event) {
    event.preventDefault();
    try {
      await submitAppointmentRequest(request);
    } catch (err) {
      setStep("request-failed");
      return;
    }
    setStep("request-done");
  }
  const internalBack = step === "actions" ? null : () => setStep(BACK_TARGETS[step] || "actions");
  const enDepart = mode === "depart";
  const headerKey = (enDepart && DEPARTURE_HEADER_KEYS[step]) || STEP_HEADER_KEYS[step] || STEP_HEADER_KEYS.actions;
  return <main className="rdv-page"><section className="rdv-container"><header className="rdv-header"><button className="back-button" onClick={internalBack || onMenu} aria-label={t("rdv.back")}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6" /></svg></button><div><h1>{t(`${headerKey}.title`)}</h1><p>{t(`${headerKey}.subtitle`)}</p></div><button className="go-home" onClick={onMenu}>{t("rdv.goHome")}</button></header>
    {step === "actions" && <section className="rdv-grid"><Action title={t("rdv.action.create.title")} text={t("rdv.action.create.text")} onClick={() => setStep("create")} /><Action title={t("rdv.action.identify.title")} text={t("rdv.action.identify.text")} onClick={() => ouvrir("arrivee")} strong /><Action title={t("rdv.action.departure.title")} text={t("rdv.action.departure.text")} onClick={() => ouvrir("depart")} /><Action title={t("rdv.action.myappointments.title")} text={t("rdv.action.myappointments.text")} onClick={() => setStep("my-appointments")} /></section>}
    {step === "identify-choice" && <section className="rdv-grid choice-grid"><Action title={t("rdv.identify.code.title")} text={t("rdv.identify.code.text")} onClick={() => setStep("manual-code")} /><Action title={t("rdv.identify.scan.title")} text={t("rdv.identify.scan.text")} onClick={() => { setScanError(""); setStep("scanner"); }} strong /></section>}
    {step === "manual-code" && <section className="rdv-panel"><h2>{t(enDepart ? "rdv.departure.code.title" : "rdv.manualcode.title")}</h2><p>{t(enDepart ? "rdv.departure.code.intro" : "rdv.manualcode.intro")}</p><form className="manual-code" onSubmit={(event) => { event.preventDefault(); scan(manualCode); }}><input required value={manualCode} onChange={(event) => setManualCode(event.target.value)} placeholder={t("rdv.manualcode.placeholder")} /><button>{t(enDepart ? "rdv.departure.code.submit" : "rdv.manualcode.submit")}</button></form>{scanError && <p className="qr-error">{scanError}</p>}</section>}
    {step === "my-appointments" && <MyAppointmentsScreen />}
    {step === "create" && <section className="rdv-panel"><h2>{t("rdv.create.title")}</h2><p>{t("rdv.create.intro")}</p><form className="appointment-form" onSubmit={submitRequest}>
      <Field label={t("rdv.field.firstName")} value={request.firstName} onChange={(value) => updateRequest("firstName", value)} />
      <Field label={t("rdv.field.lastName")} value={request.lastName} onChange={(value) => updateRequest("lastName", value)} />
      <Field label={t("rdv.field.email")} type="email" value={request.email} onChange={(value) => updateRequest("email", value)} />
      <Field label={t("rdv.field.phone")} type="tel" value={request.phone} onChange={(value) => updateRequest("phone", value)} />
      <Field label={t("rdv.field.company")} value={request.company} onChange={(value) => updateRequest("company", value)} />
      <Field label={t("rdv.field.jobTitle")} required={false} value={request.jobTitle} onChange={(value) => updateRequest("jobTitle", value)} />
      <SelectField label={t("rdv.field.host")} value={request.host} onChange={(value) => updateRequest("host", value)} options={HOSTS} />
      <SelectField label={t("rdv.field.dataCenter")} value={request.dataCenter} onChange={(value) => updateRequest("dataCenter", value)} options={DATA_CENTERS} />
      <SelectField label={t("rdv.field.accessType")} value={request.accessType} onChange={(value) => updateRequest("accessType", value)} options={ACCESS_TYPES} />
      {request.accessType === "visite" && <>
        <Field label={t("rdv.field.date")} type="date" value={request.date} onChange={(value) => updateRequest("date", value)} />
        <Field label={t("rdv.field.endDate")} type="date" value={request.endDate} onChange={(value) => updateRequest("endDate", value)} />
        <Field label={t("rdv.field.time")} type="time" value={request.time} onChange={(value) => updateRequest("time", value)} />
      </>}
      <label className="form-field full-width"><span>{t("rdv.field.purpose")}</span><textarea required value={request.purpose} onChange={(event) => updateRequest("purpose", event.target.value)} /></label>
      <Field label={t("rdv.field.referrerName")} required={false} value={request.referrerName} onChange={(value) => updateRequest("referrerName", value)} />
      <Field label={t("rdv.field.referrerPhone")} required={false} type="tel" value={request.referrerPhone} onChange={(value) => updateRequest("referrerPhone", value)} />
      <label className="form-field full-width"><span>{t("rdv.field.remarks")}</span><textarea value={request.remarks} onChange={(event) => updateRequest("remarks", event.target.value)} /></label>
      <label className="form-field full-width"><span>{t("rdv.field.idDocument")}</span><input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(event) => updateRequest("idDocumentProvided", event.target.files.length > 0)} /></label>
      <div className="form-field full-width"><span>{t("rdv.field.photo")}</span><PhotoCapture onCapture={() => updateRequest("photoProvided", true)} /></div>
      <label className="form-field full-width checkbox-field"><input type="checkbox" required checked={request.termsAccepted} onChange={(event) => updateRequest("termsAccepted", event.target.checked)} /><span>{t("rdv.field.terms")}</span></label>
      <button className="rdv-primary full-width" type="submit">{t("rdv.create.submit")}</button>
    </form></section>}
    {step === "request-done" && <Panel title={t("rdv.header.request-done.title")} text={t("rdv.requestdone.text")} action={t("rdv.requestdone.action")} onClick={() => setStep("actions")} />}
    {step === "request-failed" && <Panel title={t("rdv.header.request-failed.title")} text={t("rdv.requestfailed.text")} action={t("rdv.requestfailed.action")} onClick={() => setStep("create")} />}
    {step === "scanner" && <section className="rdv-panel"><h2>{t(enDepart ? "rdv.departure.scan.title" : "rdv.scanner.title")}</h2><p>{t(enDepart ? "rdv.departure.scan.intro" : "rdv.scanner.intro")}</p><QrScanner onScan={scan} onError={setScanError} />{scanError && <p className="qr-error">{scanError}</p>}</section>}
    {/* Un code ne sert qu'une fois. Plutot que de laisser le visiteur confirmer
        une presence que le serveur refusera, la borne le dit ici, et propose ce
        qui a encore du sens : enregistrer sa sortie s'il est toujours sur site. */}
    {step === "summary" && visit && <section className="rdv-panel"><h2>{t("rdv.summary.title")}</h2><Info label={t("rdv.summary.visitor")} value={visit.visitor} /><Info label={t("rdv.summary.company")} value={visit.company} /><Info label={t("rdv.summary.host")} value={visit.host} /><Info label={t("rdv.summary.date")} value={`${visit.date} à ${visit.time}`} /><Info label={t("rdv.summary.purpose")} value={visit.purpose} />
      {visit.visiteTerminee
        ? <p className="code-epuise">{t("rdv.summary.codeSpent")}</p>
        : visit.visiteEnCours
          ? <>
              <p className="code-en-cours">{t("rdv.summary.alreadyIn").replace("{heure}", heureLisible(visit.visiteEnCours.entryAt))}</p>
              <button className="rdv-primary" onClick={() => enregistrerSortie(visit.code)}>{t("rdv.departure.code.submit")}</button>
            </>
          : <button className="rdv-primary" onClick={notify}>{t("rdv.summary.confirm")}</button>}
      {scanError && <p className="qr-error">{scanError}</p>}
    </section>}
    {step === "notify" && <Panel title={t("rdv.header.notify.title")} text={notification.message} action={t("rdv.notify.action")} onClick={onMenu} />}
    {/* L'en-tete annonce deja « Depart enregistre » : le repeter en titre de
        panneau ferait lire deux fois la meme phrase avant l'information utile. */}
    {step === "departure-done" && departure && <section className="rdv-panel centered"><p className="depart-message">{departure.message || t("rdv.departure.done.text")}</p>
      <div className="depart-recap">
        <Info label={t("rdv.departure.done.entry")} value={heureLisible(departure.entryAt)} />
        <Info label={t("rdv.departure.done.exit")} value={heureLisible(departure.exitAt)} />
        <Info label={t("rdv.departure.done.duration")} value={dureeLisible(departure.durationMinutes)} />
      </div>
      <button className="rdv-primary" onClick={onMenu}>{t("rdv.notify.action")}</button></section>}
  </section></main>;
}

function heureLisible(horodatage) {
  if (!horodatage) return "—";
  return new Date(horodatage).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}
function dureeLisible(minutes) {
  if (!minutes && minutes !== 0) return "—";
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`;
}
function Action({ title, text, onClick, strong }) { return <button className={`action-card ${strong ? "strong" : ""}`} onClick={onClick}><h2>{title}</h2><p>{text}</p><span>→</span></button>; }
function Info({ label, value }) { return <div className="info-row"><span>{label}</span><strong>{value}</strong></div>; }
function Panel({ title, text, action, onClick }) { return <section className="rdv-panel centered"><h2>{title}</h2><p>{text}</p><button className="rdv-primary" onClick={onClick}>{action}</button></section>; }
function Field({ label, type = "text", value, onChange, required = true }) { return <label className="form-field"><span>{label}</span><input required={required} type={type} value={value} onChange={(event) => onChange(event.target.value)} /></label>; }
function SelectField({ label, value, onChange, options }) { return <label className="form-field"><span>{label}</span><select required value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>; }
