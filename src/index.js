import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
/* Charge APRES App, donc apres les feuilles de chaque ecran : les corrections
   de dimensionnement doivent passer en dernier pour s'appliquer. */
import "./responsive.css";
import { LanguageProvider } from "./i18n";

createRoot(document.getElementById("root")).render(
  <LanguageProvider>
    <App />
  </LanguageProvider>
);
