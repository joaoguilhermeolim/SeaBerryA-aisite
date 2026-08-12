(() => {
  "use strict";

  const form = document.querySelector("#application-form");
  const fieldset = form.querySelector("fieldset");
  const gate = document.querySelector("#applications-message");
  const status = document.querySelector("#form-status");
  let startedAt = Date.now();
  let privacyNoticeVersion = "";
  let idempotencyKey = "";

  const setText = (selector, value) => {
    const element = document.querySelector(selector);
    if (element && value) element.textContent = value;
  };

  const setLink = (selector, value, prefix) => {
    const element = document.querySelector(selector);
    if (!element || !value) return false;
    element.textContent = value;
    element.href = prefix + (prefix === "tel:" ? value.replace(/\s/g, "") : value);
    return true;
  };

  async function loadConfiguration() {
    try {
      const response = await fetch("/recrutamento/api/applications", {
        headers: { accept: "application/json" },
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Configuração indisponível");
      const config = await response.json();
      privacyNoticeVersion = config.privacyNoticeVersion || "";
      document.querySelectorAll("[data-privacy-version]").forEach((element) => {
        element.textContent = privacyNoticeVersion || "por publicar";
      });
      if (config.campaignYear) {
        setText(
          "#campaign-period",
          `1 setembro ${config.campaignYear} — 31 outubro ${config.campaignYear}`,
        );
      }
      setText("#controller-name", config.dataControllerName);
      if (config.dataControllerNif) {
        setText("#controller-nif", `, NIF ${config.dataControllerNif}`);
      }
      const hasPhone = setLink("#contact-phone", config.recruitmentPhone, "tel:");
      const hasEmail = setLink("#contact-email", config.recruitmentEmail, "mailto:");
      document.querySelector("#contact-block").hidden = !(hasPhone || hasEmail);
      if (setLink("#privacy-contact", config.privacyContact, "mailto:")) {
        document.querySelector("#privacy-contact-row").hidden = false;
      }

      if (config.applicationsOpen) {
        fieldset.disabled = false;
        gate.hidden = true;
        setText("#campaign-label", "Candidaturas abertas");
        startedAt = Date.now();
      } else {
        gate.innerHTML = "<strong>Candidaturas ainda não abertas.</strong><p>O formulário será ativado assim que a campanha estiver publicada.</p>";
      }
    } catch {
      gate.innerHTML = "<strong>Formulário temporariamente indisponível.</strong><p>Tenta novamente dentro de alguns minutos.</p>";
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (fieldset.disabled || !form.reportValidity()) return;
    const data = new FormData(form);
    const query = new URLSearchParams(location.search);
    idempotencyKey ||= crypto.randomUUID();
    status.className = "form-status sending";
    status.textContent = "A enviar a candidatura…";
    fieldset.disabled = true;

    try {
      const response = await fetch("/recrutamento/api/applications", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          name: data.get("name"),
          email: data.get("email"),
          phone: data.get("phone"),
          workModes: data.getAll("workModes"),
          message: data.get("message"),
          minimumAgeConfirmed: data.get("minimumAgeConfirmed") === "yes",
          privacyAcknowledged: data.get("privacyAcknowledged") === "yes",
          privacyNoticeVersion,
          website: data.get("website"),
          startedAt,
          idempotencyKey,
          utmSource: query.get("utm_source") || "",
          utmMedium: query.get("utm_medium") || "",
          utmCampaign: query.get("utm_campaign") || "",
          utmContent: query.get("utm_content") || "",
          referrer: document.referrer || "",
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) {
        throw new Error(result.message || "Não foi possível enviar.");
      }
      form.reset();
      idempotencyKey = "";
      startedAt = Date.now();
      status.className = "form-status success";
      status.textContent = result.message || "Candidatura recebida.";
    } catch (error) {
      status.className = "form-status error";
      status.textContent = error instanceof Error ? error.message : "Não foi possível enviar.";
    } finally {
      fieldset.disabled = false;
    }
  });

  loadConfiguration();
})();
