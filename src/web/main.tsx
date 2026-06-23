import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import { DEFAULT_LOCALE } from "./i18n";
import "./styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("App root element was not found");
}

document.documentElement.lang = DEFAULT_LOCALE;

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
