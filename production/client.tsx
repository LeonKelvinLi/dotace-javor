import React from "react";
import { createRoot } from "react-dom/client";
import App from "../app/page";
import "../app/globals.css";
import "../app/workspace.css";
import "../app/dashboard.css";
class RecoveryBoundary extends React.Component<
  React.PropsWithChildren,
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    void fetch("/api/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "render_failure" }),
    }).catch(() => {});
  }
  render() {
    return this.state.failed ? (
      <main className="welcome">
        <h1>Stránku se nepodařilo zobrazit / Unable to display this page</h1>
        <p>Uložené údaje jsou v bezpečí. / Saved records are safe.</p>
        <button className="button primary" onClick={() => location.reload()}>
          Načíst znovu / Reload
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")!).render(
  <RecoveryBoundary>
    <App />
  </RecoveryBoundary>,
);
