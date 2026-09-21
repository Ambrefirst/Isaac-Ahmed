import { prepareHostNotification } from "./notificationService";

describe("notificationService (mode local, sans webhook n8n configuré)", () => {
  test("renvoie un message de repli local si aucun webhook n'est configuré", async () => {
    const result = await prepareHostNotification({ visitor: "Jean Dupont" });
    expect(result.accepted).toBe(true);
    expect(result.message).toMatch(/hôte sera prévenu/i);
  });
});
