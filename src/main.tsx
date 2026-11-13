import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import "./index.css";

const root = document.getElementById("app");
if (root === null) {
  throw new Error("Missing #app root element");
}
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
