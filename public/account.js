function language(value) {
  document.documentElement.lang = value;
  document.querySelectorAll("[data-cs]").forEach((e) => {
    e.textContent = e.dataset[value];
  });
  document
    .querySelectorAll("[data-lang]")
    .forEach((e) =>
      e.setAttribute("aria-pressed", String(e.dataset.lang === value)),
    );
  try {
    localStorage.setItem("dotace-language", value);
  } catch {}
}
document
  .querySelectorAll("[data-lang]")
  .forEach((e) => e.addEventListener("click", () => language(e.dataset.lang)));
document.querySelectorAll("[data-demo-email]").forEach((choice) => {
  choice.addEventListener("change", () => {
    document.getElementById("email").value = choice.dataset.demoEmail;
    document.getElementById("password").value = choice.dataset.demoPassword;
  });
});
document.getElementById("email")?.addEventListener("input", (e) => {
  document.querySelectorAll("[data-demo-email]").forEach((choice) => {
    choice.checked = choice.dataset.demoEmail === e.target.value.trim().toLowerCase();
  });
});
document.getElementById("show-password")?.addEventListener("click", (e) => {
  const input = document.getElementById("password");
  const visible = input.type === "password";
  input.type = visible ? "text" : "password";
  const button = e.currentTarget;
  button.setAttribute("aria-pressed", String(visible));
  const label = button.querySelector("[data-cs]");
  label.dataset.cs = visible ? "Skrýt" : "Zobrazit";
  label.dataset.en = visible ? "Hide" : "Show";
  label.textContent = label.dataset[document.documentElement.lang];
});
try {
  language(localStorage.getItem("dotace-language") === "en" ? "en" : "cs");
} catch {
  language("cs");
}
let factorId;
async function mfa(action, payload = {}) {
  const r = await fetch("/api/account/mfa", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Verification failed");
  return data;
}
document.getElementById("mfa-start")?.addEventListener("click", async () => {
  try {
    const data = await mfa("setup");
    factorId = data.factorId;
    const setup = document.getElementById("mfa-setup");
    setup.replaceChildren();
    if (data.qr) {
      const img = document.createElement("img");
      img.alt = "Scan with your authenticator app";
      img.src = data.qr.startsWith("data:image/")
        ? data.qr
        : "data:image/svg+xml;base64," + btoa(data.qr);
      setup.append(img);
    }
    document.getElementById("mfa-form").hidden = false;
    document.getElementById("code").focus();
  } catch (e) {
    document.getElementById("mfa-message").textContent = e.message;
  }
});
document.getElementById("mfa-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await mfa("verify", {
      factorId,
      code: document.getElementById("code").value,
    });
    location.assign("/");
  } catch (e) {
    document.getElementById("mfa-message").textContent = e.message;
  }
});

if (location.pathname === "/auth/callback") {
  const fields = new URLSearchParams(location.hash.slice(1));
  fields.set("next", new URLSearchParams(location.search).get("next") || "/");
  history.replaceState(null, "", "/auth/callback");
  if (fields.get("access_token") && fields.get("refresh_token"))
    fetch("/auth/session", { method: "POST", body: fields })
      .then(async (response) => {
        if (!response.ok)
          throw new Error("This link expired. Request another link.");
        const result = await response.json();
        location.replace(result.next);
      })
      .catch((error) => {
        document.querySelector('[role="status"]').textContent = error.message;
      });
  else
    document.querySelector('[role="status"]').textContent =
      "Odkaz není platný. Požádejte o nový. / This link is invalid. Request a new link.";
}
