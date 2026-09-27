/* Ces essais portent sur le contrat entre la borne et le routeur : ce que la
   borne affiche quand un code est refuse. Le routeur refuse pour des raisons
   distinctes (rendez-vous annule, code presente un autre jour, aucune visite
   ouverte), et chacune se traite differemment a l'accueil. Un message unique
   les confondait toutes, c'est ce que ces essais empechent de revenir. */

const WEBHOOK = "/webhook/isaac-visitor";

function reponse(status, corps) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => (corps === undefined ? Promise.reject(new Error("pas de corps")) : Promise.resolve(corps)),
  });
}

describe("contrat borne / routeur", () => {
  let service;

  beforeEach(() => {
    jest.resetModules();
    process.env.REACT_APP_N8N_APPOINTMENT_WEBHOOK = WEBHOOK;
    service = require("./appointmentService");
  });

  afterEach(() => {
    delete process.env.REACT_APP_N8N_APPOINTMENT_WEBHOOK;
    delete global.fetch;
  });

  test("un rendez-vous annule est refuse avec le motif du serveur", async () => {
    global.fetch = () => reponse(403, { error: "Ce rendez-vous a ete annule. Merci de vous adresser a l'accueil.", raison: "statut", status: "annule" });
    await expect(service.getVisitFromInvitation("ANNULEE1")).rejects.toThrow(/annule/i);
  });

  test("un code presente un autre jour est refuse en citant la date attendue", async () => {
    global.fetch = () => reponse(403, { error: "Ce code est valable le 2026-01-15, pas aujourd'hui.", raison: "date", dateAttendue: "2026-01-15" });
    await expect(service.getVisitFromInvitation("HIERHIER")).rejects.toThrow(/2026-01-15/);
  });

  test("un code inconnu garde son message propre", async () => {
    global.fetch = () => reponse(404, { error: "Invitation introuvable" });
    await expect(service.getVisitFromInvitation("INCONNU0")).rejects.toThrow(/Vérifiez le code saisi/);
  });

  test("un refus sans corps JSON retombe sur un message comprehensible", async () => {
    global.fetch = () => reponse(403, undefined);
    await expect(service.getVisitFromInvitation("QUELCONQ")).rejects.toThrow(/adresser à l'accueil/);
  });

  test("un code valide passe sans encombre", async () => {
    global.fetch = () => reponse(200, { visitor: "Ada Nguema", code: "BONJOUR1", status: "confirme" });
    await expect(service.getVisitFromInvitation("BONJOUR1")).resolves.toMatchObject({ visitor: "Ada Nguema" });
  });

  test("la sortie renvoie les horodatages et la duree", async () => {
    global.fetch = () => reponse(200, { accepted: true, entryAt: 1000, exitAt: 5400000, durationMinutes: 90, message: "Votre sortie a ete enregistree." });
    const r = await service.recordDeparture("BONJOUR1");
    expect(r.durationMinutes).toBe(90);
    expect(r.exitAt).toBe(5400000);
  });

  test("une sortie sans visite ouverte oriente vers l'enregistrement d'arrivee", async () => {
    global.fetch = () => reponse(404, { error: "Aucune visite en cours pour ce code." });
    await expect(service.recordDeparture("ZZZZZZZZ")).rejects.toThrow(/Aucune visite en cours/);
  });

  test("sans webhook configure, la sortie reste simulable hors ligne", async () => {
    delete process.env.REACT_APP_N8N_APPOINTMENT_WEBHOOK;
    jest.resetModules();
    const local = require("./appointmentService");
    const r = await local.recordDeparture("BONJOUR1");
    expect(r.accepted).toBe(true);
    expect(typeof r.durationMinutes).toBe("number");
  });
});
