import {
  ALLOWED_STATUSES,
  adminAuthFailure,
  applicationsToCsv,
  authorizeAdmin,
  getAdminConfiguration,
  validateApplication,
} from "./recruitment.mjs";

const WEAK_ADMIN_PASSWORD =
  /(password|passw0rd|palavra[-_ ]?passe|changeme|change[-_ ]?me|placeholder|replace[-_ ]?me|example|exemplo|admin123|qwerty|letmein|segredo|secret)/iu;

export function isStrongAdminPassword(password, username = "") {
  if (typeof password !== "string" || password.length < 32 || password.length > 1024) {
    return false;
  }
  if (WEAK_ADMIN_PASSWORD.test(password) || /^(.)\1+$/u.test(password)) return false;
  if (
    username &&
    password.toLocaleLowerCase("pt-PT").includes(username.toLocaleLowerCase("pt-PT"))
  ) {
    return false;
  }
  return true;
}

export function authorizeHardenedAdmin(request, env = process.env) {
  const configured = getAdminConfiguration(env);
  if (
    !configured.username ||
    configured.username.includes(":") ||
    configured.csrfSecret.length < 32 ||
    !isStrongAdminPassword(configured.password, configured.username)
  ) {
    return { ok: false, status: 503, config: null };
  }
  return authorizeAdmin(request, env);
}

export function hardenedAdminAuthFailure(status) {
  return adminAuthFailure(status);
}

function cleanCampaignTag(value) {
  if (typeof value !== "string") return "";
  const cleaned = value.normalize("NFC").trim().replace(/\s+/gu, " ");
  if (cleaned.length > 100) return "";
  return /^[a-zA-Z0-9_.-]*$/u.test(cleaned) ? cleaned : "";
}

function cleanReferrer(value) {
  if (typeof value !== "string" || value.length > 500) return "";
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "";
    return `${parsed.origin}${parsed.pathname.slice(0, 300)}`;
  } catch {
    return "";
  }
}

export function validateApplicationV2(input, expectedPrivacyVersion, now = Date.now()) {
  const startedAt = typeof input?.startedAt === "number" ? input.startedAt : 0;
  const elapsed = now - startedAt;
  if (!Number.isFinite(elapsed) || elapsed < 3_000 || elapsed > 7_200_000) {
    return { ok: false, message: "Atualiza a página e tenta novamente." };
  }
  const phone = typeof input?.phone === "string" ? input.phone : "";
  if (phone.replace(/\D/gu, "").length < 9) {
    return { ok: false, message: "Indica um telemóvel válido." };
  }

  const validation = validateApplication(input, expectedPrivacyVersion);
  if (!validation.ok) return validation;
  return {
    ok: true,
    value: {
      ...validation.value,
      minimumAgeConfirmed: true,
      privacyNoticeVersion: expectedPrivacyVersion,
      utmSource: cleanCampaignTag(input.utmSource),
      utmMedium: cleanCampaignTag(input.utmMedium),
      utmCampaign: cleanCampaignTag(input.utmCampaign),
      utmContent: cleanCampaignTag(input.utmContent),
      referrer: cleanReferrer(input.referrer),
    },
  };
}

function protectCsvCell(value) {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/u.test(text)) text = `'${text}`;
  return `"${text.replace(/"/gu, '""')}"`;
}

export function applicationsToCsvV2(applications) {
  const header = [
    "Data",
    "Nome",
    "Email",
    "Telemóvel",
    "Modalidades",
    "Mensagem",
    "Confirmação 16+",
    "Versão do aviso de privacidade",
    "Aviso reconhecido em",
    "UTM source",
    "UTM medium",
    "UTM campaign",
    "UTM content",
    "Referrer",
    "Estado",
    "Última atualização",
  ];
  const rows = applications.map((application) => [
    application.createdAt,
    application.name,
    application.email,
    application.phone,
    Array.isArray(application.workModes) ? application.workModes.join(" | ") : "",
    application.message,
    application.minimumAgeConfirmed ? "Sim" : "Não",
    application.privacyNoticeVersion,
    application.privacyAcknowledgedAt,
    application.utmSource,
    application.utmMedium,
    application.utmCampaign,
    application.utmContent,
    application.referrer,
    application.status,
    application.statusUpdatedAt,
  ]);
  return `\uFEFF${[header, ...rows]
    .map((row) => row.map(protectCsvCell).join(","))
    .join("\r\n")}\r\n`;
}

// Kept as a regression oracle: the hardened export must retain the base CSV protections.
export function baseCsvForRegression(applications) {
  return applicationsToCsv(applications);
}

export { ALLOWED_STATUSES };
