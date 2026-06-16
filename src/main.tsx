import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// Apply dark mode based on system preference
const mq = window.matchMedia("(prefers-color-scheme: dark)");
document.documentElement.classList.toggle("dark", mq.matches);
mq.addEventListener("change", (e) => {
  document.documentElement.classList.toggle("dark", e.matches);
});

// Suppress the webview's native right-click menu app-wide so it never shows
// the browser/OS default (reload, inspect, copy, …). Capture phase guarantees
// it fires before anything could stopPropagation. This only blocks the *native*
// menu — future custom context menus are their own `contextmenu` listeners on
// specific elements, which still fire and render their own UI alongside this.
document.addEventListener("contextmenu", (e) => e.preventDefault(), { capture: true });

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
