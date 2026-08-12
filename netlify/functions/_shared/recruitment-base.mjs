import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

import { getStore } from "@netlify/blobs";

export const APPLICATION_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
export const AUDIT_RETENTION_MS = 180 * 24 * 60 * 60 * 1000;
export const APPLICATION_STORE = "sea-berry-recruitment-applications";
export const AUDIT_STORE = "sea-berry-recruitment-admin-audit";
export const ALLOWED_WORK_MODES = new Set([
  "part-time-weekend",
  "full-time",
  "part-time-weekdays",
]);
export const ALLOWED_STATUSES = new Set([
  "new",
  "in_review",
  "contacted",
  "rejected",
  "hired",
  "archived",
]);

const BASE_HEADERS = {
  "cache-control": "no-store, max-age=0, must-revalidate",
  pragma: "no-cache",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-robots-tag": "noindex, nofollow, noarchive",
};

export function jsonResponse(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...BASE_HEADERS,
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

export function textResponse(body, status = 200, headers = {}) {
  return new Response(body, {
    status,
    headers: { ...BASE_HEADERS, ...headers },
  });
}

export function methodNotAllowed(allowed) {
  return jsonResponse(
    { ok: false, message: "Método não permitido." },
    405,
    { allow: allowed.join(", ") },
  );
}

export function getPublicConfiguration(env = process.env) {
  const campaignYear = cleanSingleLine(env.RECRUITMENT_CAMPAIGN_YEAR || "", 4);
  const privacyNoticeVersion = cleanSingleLine(
    env.RECRUITMENT_PRIVACY_NOTICE_VERSION || "",
    64,
  );
  const dataControllerName = cleanSingleLine(
    env.RECRUITMENT_DATA_CONTROLLER_NAME || "",
    160,
  );
  const privacyContact = cleanSingleLine(
    env.RECRUITMENT_PRIVACY_EMAIL || "",
    160,
  );
  const validCampaignYear = /^20\d{2}$/.test(campaignYear);
  const validPrivacyEmail = isEmail(privacyContact);
  const configured = Boolean(
    validCampaignYear &&
      privacyNoticeVersion &&
      dataControllerName &&
      validPrivacyEmail,
  );

  return {
    applicationsOpen:
      configured && String(env.RECRUITMENT_APPLICATIONS_OPEN).toLowerCase() === "true",
    campaignYear: validCampaignYear ? campaignYear : "",
    privacyNoticeVersion,
    dataControllerName,
    dataControllerNif: cleanSingleLine(
      env.RECRUITMENT_DATA_CONTROLLER_NIF || "",
      40,
    ),
    recruitmentPhone: cleanSingleLine(env.RECRUITMENT_PHONE || "", 40),
    recruitmentEmail: cleanSingleLine(env.RECRUITMENT_EMAIL || "", 160),
    privacyContact: validPrivacyEmail ? privacyContact : "",
    configured,
  };
}

function normalizeText(value) {
  return typeof value === "string" ? value.normalize("NFC").trim() : "";
}

function hasForbiddenControlCharacters(value, allowNewlines = false) {
  const pattern = allowNewlines
    ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/
    : /[\u0000-\u001F\u007F]/;
  return pattern.test(value);
}

function cleanSingleLine(value, maxLength) {
  const cleaned = normalizeText(value).replace(/\s+/g, " ");
  if (cleaned.length > maxLength || hasForbiddenControlCharacters(cleaned)) return "";
  return cleaned;
}

function isEmail(value) {
  return (
    value.length >= 5 &&
    value.length <= 160 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value)
  );
}

function isPhone(value) {
  const digits = value.replace(/\D/g, "");
  return (
    value.length >= 7 &&
    value.length <= 40 &&
    digits.length >= 7 &&
    digits.length <= 15 &&
    /^[+()\d\s.-]+$/u.test(value)
  );
}

export function validateApplication(input, expectedPrivacyVersion) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, message: "Dados inválidos." };
  }

  const name = cleanSingleLine(input.name, 100);
  const email = cleanSingleLine(input.email, 160).toLowerCase();
  const phone = cleanSingleLine(input.phone, 40);
  const message = normalizeText(input.message);
  const workModes = Array.isArray(input.workModes)
    ? [...new Set(input.workModes.filter((mode) => typeof mode === "string"))]
    : [];
  const idempotencyKey = normalizeText(input.idempotencyKey);
  const privacyNoticeVersion = cleanSingleLine(input.privacyNoticeVersion, 64);

  if (name.length < 2 || name.length > 100) {
    return { ok: false, message: "Indica um nome válido." };
  }
  if (!isEmail(email)) {
    return { ok: false, message: "Indica um email válido." };
  }
  if (!isPhone(phone)) {
    return { ok: false, message: "Indica um telemóvel válido." };
  }
  if (
    message.length < 10 ||
    message.length > 500 ||
    hasForbiddenControlCharacters(message, true)
  ) {
    return { ok: false, message: "A mensagem deve ter entre 10 e 500 caracteres." };
  }
  if (
    workModes.length < 1 ||
    workModes.length > ALLOWED_WORK_MODES.size ||
    workModes.some((mode) => !ALLOWED_WORK_MODES.has(mode))
  ) {
    return { ok: false, message: "Seleciona pelo menos uma modalidade válida." };
  }
  if (input.minimumAgeConfirmed !== true) {
    return { ok: false, message: "É necessário confirmar a idade mínima." };
  }
  if (input.privacyAcknowledged !== true) {
    return { ok: false, message: "É necessário confirmar o aviso de privacidade." };
  }
  if (!expectedPrivacyVersion || privacyNoticeVersion !== expectedPrivacyVersion) {
    return {
      ok: false,
      message: "O aviso de privacidade foi atualizado. Recarrega a página e tenta novamente.",
    };
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(idempotencyKey)) {
    return { ok: false, message: "Não foi possível validar o envio. Recarrega a página." };
  }

  return {
    ok: true,
    value: { name, email, phone, workModes, message, idempotencyKey },
  };
}

export function applicationIdFor(idempotencyKey) {
  return createHash("sha256").update(idempotencyKey, "utf8").digest("hex");
}

export function applicationsStore() {
  return getStore({ name: APPLICATION_STORE, consistency: "strong" });
}

export function auditStore() {
  return getStore({ name: AUDIT_STORE, consistency: "strong" });
}

export function getAdminConfiguration(env = process.env) {
  const username = env.RECRUITMENT_ADMIN_USER || "";
  const password = env.RECRUITMENT_ADMIN_PASSWORD || "";
  const csrfSecret = env.RECRUITMENT_CSRF_SECRET || "";
  return {
    username,
    password,
    csrfSecret,
    configured:
      username.length > 0 &&
      !username.includes(":") &&
      password.length >= 12 &&
      csrfSecret.length >= 32,
  };
}

function safeEqualStrings(left, right) {
  const leftBuffer = Buffer.from(String(left), "utf8");
  const rightBuffer = Buffer.from(String(right), "utf8");
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function parseBasicAuthorization(header) {
  if (!header || !header.startsWith("Basic ")) return null;
  try {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator < 1) return null;
    return {
      username: decoded.slice(0, separator),
      password: decoded.slice(separator + 1),
    };
  } catch {
    return null;
  }
}

export function authorizeAdmin(request, env = process.env) {
  const config = getAdminConfiguration(env);
  if (!config.configured) return { ok: false, status: 503, config: null };
  const credentials = parseBasicAuthorization(request.headers.get("authorization"));
  const valid = Boolean(
    credentials &&
      safeEqualStrings(credentials.username, config.username) &&
      safeEqualStrings(credentials.password, config.password),
  );
  return valid
    ? { ok: true, status: 200, config }
    : { ok: false, status: 401, config: null };
}

export function adminAuthFailure(status) {
  if (status === 503) {
    return textResponse("Área administrativa indisponível.", 503, {
      "content-type": "text/plain; charset=utf-8",
    });
  }
  return textResponse("Autenticação necessária.", 401, {
    "content-type": "text/plain; charset=utf-8",
    "www-authenticate": 'Basic realm="Sea Berry Recrutamento", charset="UTF-8"',
  });
}

export function createCsrfToken(username, secret, now = Date.now()) {
  const payload = {
    exp: now + 2 * 60 * 60 * 1000,
    nonce: randomBytes(18).toString("base64url"),
    subject: createHash("sha256").update(username, "utf8").digest("base64url"),
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyCsrfToken(token, username, secret, now = Date.now()) {
  if (typeof token !== "string" || token.length > 1024) return false;
  const [encoded, suppliedSignature, extra] = token.split(".");
  if (!encoded || !suppliedSignature || extra) return false;
  const expectedSignature = createHmac("sha256", secret)
    .update(encoded)
    .digest("base64url");
  if (!safeEqualStrings(suppliedSignature, expectedSignature)) return false;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    const subject = createHash("sha256").update(username, "utf8").digest("base64url");
    return (
      Number.isFinite(payload.exp) &&
      payload.exp >= now &&
      payload.exp <= now + 2 * 60 * 60 * 1000 + 60_000 &&
      typeof payload.nonce === "string" &&
      payload.nonce.length >= 16 &&
      safeEqualStrings(payload.subject, subject)
    );
  } catch {
    return false;
  }
}

function addOrigin(origins, candidate) {
  if (!candidate) return;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      origins.add(parsed.origin);
    }
  } catch {
    // Invalid candidates are intentionally ignored.
  }
}

export function isAllowedSameOrigin(request, env = process.env) {
  const suppliedOrigin = request.headers.get("origin");
  if (!suppliedOrigin) return false;
  const allowed = new Set();
  addOrigin(allowed, request.url);
  addOrigin(allowed, env.URL);
  addOrigin(allowed, env.DEPLOY_PRIME_URL);

  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost || request.headers.get("host");
  if (host && !/[\s/@\\]/u.test(host)) {
    const forwardedProtocol = request.headers.get("x-forwarded-proto");
    const protocol = forwardedProtocol === "http" ? "http" : "https";
    addOrigin(allowed, `${protocol}://${host}`);
  }

  try {
    return allowed.has(new URL(suppliedOrigin).origin);
  } catch {
    return false;
  }
}

export async function readJsonBody(request, maxBytes = 16_384) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return { ok: false, status: 415, message: "Formato do pedido não suportado." };
  }
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return { ok: false, status: 413, message: "Pedido demasiado grande." };
  }
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > maxBytes) {
      return { ok: false, status: 413, message: "Pedido demasiado grande." };
    }
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false, status: 400, message: "Pedido inválido." };
  }
}

export async function loadCurrentApplications(now = Date.now()) {
  const store = applicationsStore();
  const { blobs } = await store.list({ prefix: "applications/" });
  const results = [];

  for (let index = 0; index < blobs.length; index += 20) {
    const batch = blobs.slice(index, index + 20);
    const entries = await Promise.all(
      batch.map(async ({ key }) => {
        const entry = await store.getWithMetadata(key, { type: "json" });
        if (!entry) return null;
        const expiresAt = Number(entry.metadata?.expiresAt || entry.data?.expiresAt || 0);
        if (!Number.isFinite(expiresAt) || expiresAt <= now) {
          await store.delete(key);
          return null;
        }
        return { ...entry.data, _key: key, _etag: entry.etag };
      }),
    );
    results.push(...entries.filter(Boolean));
  }

  return results.sort((left, right) =>
    String(right.createdAt).localeCompare(String(left.createdAt)),
  );
}

export function filterApplications(applications, query = "", status = "all") {
  const needle = normalizeText(query).toLocaleLowerCase("pt-PT").slice(0, 120);
  return applications.filter((application) => {
    if (status !== "all" && application.status !== status) return false;
    if (!needle) return true;
    const haystack = [
      application.name,
      application.email,
      application.phone,
      application.message,
      ...(Array.isArray(application.workModes) ? application.workModes : []),
    ]
      .join(" ")
      .toLocaleLowerCase("pt-PT");
    return haystack.includes(needle);
  });
}

export async function appendAuditEvent(event, now = Date.now()) {
  const occurredAt = new Date(now).toISOString();
  const expiresAt = now + AUDIT_RETENTION_MS;
  const key = `audit/${occurredAt.slice(0, 10)}/${now}-${randomUUID()}`;
  await auditStore().setJSON(
    key,
    { occurredAt, ...event },
    { metadata: { expiresAt } },
  );
}

export async function purgeExpiredEntries(now = Date.now()) {
  const targets = [
    { store: applicationsStore(), prefix: "applications/" },
    { store: auditStore(), prefix: "audit/" },
  ];
  const result = { applications: 0, audit: 0 };

  for (let targetIndex = 0; targetIndex < targets.length; targetIndex += 1) {
    const { store, prefix } = targets[targetIndex];
    const { blobs } = await store.list({ prefix });
    for (let index = 0; index < blobs.length; index += 25) {
      const batch = blobs.slice(index, index + 25);
      const deleted = await Promise.all(
        batch.map(async ({ key }) => {
          const metadata = await store.getMetadata(key);
          const expiresAt = Number(metadata?.metadata?.expiresAt || 0);
          if (Number.isFinite(expiresAt) && expiresAt > 0 && expiresAt <= now) {
            await store.delete(key);
            return 1;
          }
          return 0;
        }),
      );
      const count = deleted.reduce((sum, value) => sum + value, 0);
      if (targetIndex === 0) result.applications += count;
      else result.audit += count;
    }
  }

  return result;
}

function protectCsvCell(value) {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/u.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function applicationsToCsv(applications) {
  const header = [
    "Data",
    "Nome",
    "Email",
    "Telemóvel",
    "Modalidades",
    "Mensagem",
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
    application.status,
    application.statusUpdatedAt,
  ]);
  return `\uFEFF${[header, ...rows]
    .map((row) => row.map(protectCsvCell).join(","))
    .join("\r\n")}\r\n`;
}
