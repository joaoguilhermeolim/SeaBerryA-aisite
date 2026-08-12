import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  applicationIdFor,
  createCsrfToken,
  getPublicConfiguration,
  isAllowedSameOrigin,
  parseBasicAuthorization,
  verifyCsrfToken,
} from "../netlify/functions/_shared/recruitment.mjs";
import {
  applicationsToCsvV2,
  authorizeHardenedAdmin,
  isStrongAdminPassword,
  validateApplicationV2,
} from "../netlify/functions/_shared/recruitment-v2.mjs";

const NOW = Date.UTC(2026, 7, 12, 12, 0, 0);
const validApplication = {
  name: "Maria Silva",
  email: "Maria@example.com",
  phone: "+351 912 345 678",
  workModes: ["full-time", "part-time-weekend"],
  message: "Quero crescer com a equipa Sea Berry.",
  minimumAgeConfirmed: true,
  privacyAcknowledged: true,
  privacyNoticeVersion: "2026-08-12",
  idempotencyKey: "98c4cb44-2bd0-45a0-a41c-9e42c9e66019",
  startedAt: NOW - 5_000,
  utmSource: "instagram",
  utmMedium: "social_paid",
  utmCampaign: "recrutamento.2026",
  utmContent: "story-01",
  referrer: "https://example.com/caminho?token=sensivel#fragmento",
};

test("a configuração pública só abre com todos os campos obrigatórios", () => {
  const closed = getPublicConfiguration({ RECRUITMENT_APPLICATIONS_OPEN: "true" });
  assert.equal(closed.applicationsOpen, false);
  assert.equal(closed.configured, false);

  const open = getPublicConfiguration({
    RECRUITMENT_APPLICATIONS_OPEN: "true",
    RECRUITMENT_CAMPAIGN_YEAR: "2026",
    RECRUITMENT_PRIVACY_NOTICE_VERSION: "2026-08-12",
    RECRUITMENT_DATA_CONTROLLER_NAME: "Sea Berry Açaí",
    RECRUITMENT_PRIVACY_EMAIL: "privacidade@example.com",
  });
  assert.equal(open.applicationsOpen, true);
  assert.equal(open.configured, true);
});

test("valida a V2, preserva consentimento/atribuição e remove query do referrer", () => {
  const result = validateApplicationV2(validApplication, "2026-08-12", NOW);
  assert.equal(result.ok, true);
  assert.equal(result.value.email, "maria@example.com");
  assert.equal(result.value.minimumAgeConfirmed, true);
  assert.equal(result.value.privacyNoticeVersion, "2026-08-12");
  assert.equal(result.value.utmCampaign, "recrutamento.2026");
  assert.equal(result.value.referrer, "https://example.com/caminho");
});

test("rejeita envio demasiado rápido, demasiado antigo e telefone com menos de 9 dígitos", () => {
  assert.equal(
    validateApplicationV2({ ...validApplication, startedAt: NOW - 2_999 }, "2026-08-12", NOW).ok,
    false,
  );
  assert.equal(
    validateApplicationV2({ ...validApplication, startedAt: NOW - 7_200_001 }, "2026-08-12", NOW).ok,
    false,
  );
  assert.equal(
    validateApplicationV2({ ...validApplication, phone: "12345678" }, "2026-08-12", NOW).ok,
    false,
  );
});

test("rejeita aviso desatualizado e atribuição/referrer inseguros", () => {
  assert.equal(validateApplicationV2(validApplication, "2026-09-01", NOW).ok, false);
  const result = validateApplicationV2(
    { ...validApplication, utmSource: "valor com espaço", referrer: "javascript:alert(1)" },
    "2026-08-12",
    NOW,
  );
  assert.equal(result.ok, true);
  assert.equal(result.value.utmSource, "");
  assert.equal(result.value.referrer, "");
});

test("a idempotência gera um identificador estável e a função distingue criação/repetição", async () => {
  const first = applicationIdFor(validApplication.idempotencyKey);
  assert.match(first, /^[0-9a-f]{64}$/u);
  assert.equal(first, applicationIdFor(validApplication.idempotencyKey));
  const source = await readFile(
    new URL("../netlify/functions/recruitment-applications.mjs", import.meta.url),
    "utf8",
  );
  assert.match(source, /result\.modified\s*\?\s*201\s*:\s*200/u);
});

test("Basic Auth endurecido exige 32+ e rejeita comuns/placeholders", () => {
  assert.equal(isStrongAdminPassword("password1234", "admin"), false);
  assert.equal(isStrongAdminPassword("change-me-change-me-change-me-change-me", "admin"), false);
  assert.equal(isStrongAdminPassword("x".repeat(40), "admin"), false);
  assert.equal(isStrongAdminPassword("CorrectHorse!Battery#Staple-2026-Madeira", "gestor"), true);

  const password = "CorrectHorse!Battery#Staple-2026-Madeira";
  const encoded = Buffer.from(`gestor:${password}`, "utf8").toString("base64");
  assert.deepEqual(parseBasicAuthorization(`Basic ${encoded}`), {
    username: "gestor",
    password,
  });
  const env = {
    RECRUITMENT_ADMIN_USER: "gestor",
    RECRUITMENT_ADMIN_PASSWORD: password,
    RECRUITMENT_CSRF_SECRET: "s".repeat(40),
  };
  assert.equal(
    authorizeHardenedAdmin(
      new Request("https://example.com/recrutamento/admin", {
        headers: { authorization: `Basic ${encoded}` },
      }),
      env,
    ).ok,
    true,
  );
  assert.equal(
    authorizeHardenedAdmin(
      new Request("https://example.com/recrutamento/admin", {
        headers: { authorization: "Basic " + Buffer.from("admin:password1234").toString("base64") },
      }),
      {
        RECRUITMENT_ADMIN_USER: "admin",
        RECRUITMENT_ADMIN_PASSWORD: "password1234",
        RECRUITMENT_CSRF_SECRET: "s".repeat(40),
      },
    ).status,
    503,
  );
});

test("token CSRF é ligado ao utilizador, assinado e expira", () => {
  const secret = "s".repeat(40);
  const token = createCsrfToken("gestor", secret, NOW);
  assert.equal(verifyCsrfToken(token, "gestor", secret, NOW + 1_000), true);
  assert.equal(verifyCsrfToken(`${token}x`, "gestor", secret, NOW + 1_000), false);
  assert.equal(verifyCsrfToken(token, "outro", secret, NOW + 1_000), false);
  assert.equal(verifyCsrfToken(token, "gestor", secret, NOW + 3 * 60 * 60 * 1000), false);
});

test("proteção de origem aceita apenas a origem do próprio pedido", () => {
  const sameOrigin = new Request("https://seaberryacai.com/recrutamento/api/admin/x", {
    headers: { origin: "https://seaberryacai.com" },
  });
  const crossOrigin = new Request("https://seaberryacai.com/recrutamento/api/admin/x", {
    headers: { origin: "https://example.org" },
  });
  assert.equal(isAllowedSameOrigin(sameOrigin, {}), true);
  assert.equal(isAllowedSameOrigin(crossOrigin, {}), false);
});

test("CSV inclui auditabilidade/atribuição e neutraliza fórmulas", () => {
  const csv = applicationsToCsvV2([
    {
      createdAt: "2026-08-12T10:00:00.000Z",
      name: "=2+2",
      email: "teste@example.com",
      phone: "+351900000000",
      workModes: ["full-time"],
      message: 'Olá, "equipa"',
      minimumAgeConfirmed: true,
      privacyNoticeVersion: "2026-08-12",
      privacyAcknowledgedAt: "2026-08-12T10:00:00.000Z",
      utmSource: "instagram",
      utmMedium: "social",
      utmCampaign: "recrutamento",
      utmContent: "story",
      referrer: "https://example.com/origem",
      status: "new",
      statusUpdatedAt: "2026-08-12T10:00:00.000Z",
    },
  ]);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.match(csv, /Versão do aviso de privacidade/u);
  assert.match(csv, /"'=2\+2"/u);
  assert.match(csv, /"Olá, ""equipa"""/u);
  assert.match(csv, /instagram/u);
});

test("há apenas a rota pública sob /recrutamento e duas regras de rate-limit", async () => {
  const [frontend, publicFunction, adminFunction, netlify] = await Promise.all([
    readFile(new URL("../recrutamento/app.js", import.meta.url), "utf8"),
    readFile(new URL("../netlify/functions/recruitment-applications.mjs", import.meta.url), "utf8"),
    readFile(new URL("../netlify/functions/recruitment-admin.mjs", import.meta.url), "utf8"),
    readFile(new URL("../netlify.toml", import.meta.url), "utf8"),
  ]);
  for (const source of [frontend, publicFunction, netlify]) {
    assert.doesNotMatch(source, /["']\/api\/recrutamento\/applications/u);
  }
  assert.match(frontend, /\/recrutamento\/api\/applications/u);
  assert.match(adminFunction, /"\/recrutamento\/admin"[\s\S]*"\/recrutamento\/api\/admin\/\*"/u);
  assert.doesNotMatch(
    netlify,
    /to\s*=\s*["'']\/\.netlify\/functions\/recruitment-/u,
    "custom function paths must not be rewritten to their disabled default URLs",
  );
  assert.equal((publicFunction.match(/rateLimit:/gu) || []).length, 1);
  assert.equal((adminFunction.match(/rateLimit:/gu) || []).length, 1);
});
