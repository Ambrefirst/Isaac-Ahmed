import { askIsaac } from "./aiService";

describe("aiService (mode local, sans webhook n8n configuré)", () => {
  test("répond avec le message générique pour une question sans rapport avec un rendez-vous", async () => {
    const answer = await askIsaac("Bonjour, qui êtes-vous ?");
    expect(answer).toMatch(/bon interlocuteur/i);
  });

  test("oriente vers le module Rendez-vous si la question mentionne un rendez-vous", async () => {
    const answer = await askIsaac("Je voudrais prendre un rendez-vous");
    expect(answer).toMatch(/rubrique rendez-vous/i);
  });
});
