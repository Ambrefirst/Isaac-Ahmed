import {
  getVisitFromInvitation,
  submitAppointmentRequest,
  requestAppointmentsOtp,
  verifyAppointmentsOtp,
  cancelAppointmentRequest,
  sampleAppointments,
} from "./appointmentService";

describe("appointmentService (mode local, sans webhook n8n configuré)", () => {
  test("getVisitFromInvitation renvoie une visite de démonstration liée au code saisi", async () => {
    const visit = await getVisitFromInvitation("ANYCODE");
    expect(visit.visitor).toBeTruthy();
    expect(visit.code).toBe("ANYCODE");
  });

  test("submitAppointmentRequest accepte la demande localement", async () => {
    const request = { firstName: "Jean" };
    const result = await submitAppointmentRequest(request);
    expect(result).toEqual({ accepted: true, request });
  });

  test("requestAppointmentsOtp confirme l'envoi localement", async () => {
    const result = await requestAppointmentsOtp("visiteur@exemple.com");
    expect(result).toEqual({ sent: true });
  });

  test("verifyAppointmentsOtp renvoie les rendez-vous de démonstration et un jeton", async () => {
    const result = await verifyAppointmentsOtp("visiteur@exemple.com", "123456");
    expect(result.appointments).toEqual(sampleAppointments);
    expect(result.sessionToken).toBe("dev");
  });

  test("cancelAppointmentRequest accepte l'annulation localement", async () => {
    const result = await cancelAppointmentRequest("appt_1", "dev");
    expect(result).toEqual({ accepted: true, id: "appt_1" });
  });
});
