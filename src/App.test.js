import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { LanguageProvider } from "./i18n";

function renderApp() {
  return render(
    <LanguageProvider>
      <App />
    </LanguageProvider>
  );
}

test("ouvre l'accueil central depuis Welcome", async () => {
  renderApp();
  expect(screen.getByText(/bienvenue chez st digital/i)).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: /commencer/i }));
  expect(screen.getByText(/choisissez votre parcours/i)).toBeTruthy();
});

test("ouvre le chat avec Isaac et affiche le message d'accueil", async () => {
  renderApp();
  await userEvent.click(screen.getByRole("button", { name: /commencer/i }));
  await userEvent.click(screen.getByRole("button", { name: /parler à isaac/i }));
  expect(screen.getByText(/comment puis-je vous orienter/i)).toBeTruthy();
});
