import {
  APPLICATION_RETENTION_MS,
  applicationIdFor,
  applicationsStore,
  getPublicConfiguration,
  isAllowedSameOrigin,
  jsonResponse,
  methodNotAllowed,
  readJsonBody,
} from "./_shared/recruitment.mjs";
import { validateApplicationV2 } from "./_shared/recruitment-v2.mjs";

const SUCCESS_MESSAGE = "Candidatura recebida. Obrigado pelo teu interesse na Sea Berry!";

export default async function handler(request) {
  if (request.method === "GET") {
    const configuration = getPublicConfiguration();
    return jsonResponse({
      applicationsOpen: configuration.applicationsOpen,
      campaignYear: configuration.campaignYear,
      privacyNoticeVersion: configuration.privacyNoticeVersion,
      dataControllerName: configuration.dataControllerName,
      dataControllerNif: configuration.dataControllerNif,
      recruitmentPhone: configuration.recruitmentPhone,
      recruitmentEmail: configuration.recruitmentEmail,
      privacyContact: configuration.privacyContact,
    });
  }
  if (request.method !== "POST") return methodNotAllowed(["GET", "POST"]);

  const configuration = getPublicConfiguration();
  if (!configuration.configured) {
    return jsonResponse(
      { ok: false, message: "Formulário temporariamente indisponível." },
      503,
    );
  }
  if (!configuration.applicationsOpen) {
    return jsonResponse(
      { ok: false, message: "As candidaturas não estão abertas neste momento." },
      403,
    );
  }
  if (!isAllowedSameOrigin(request)) {
    return jsonResponse({ ok: false, message: "Pedido não autorizado." }, 403);
  }

  const body = await readJsonBody(request);
  if (!body.ok) return jsonResponse({ ok: false, message: body.message }, body.status);
  if (typeof body.value?.website === "string" && body.value.website.trim()) {
    return jsonResponse({ ok: true, message: SUCCESS_MESSAGE }, 200);
  }

  const validation = validateApplicationV2(
    body.value,
    configuration.privacyNoticeVersion,
  );
  if (!validation.ok) {
    return jsonResponse({ ok: false, message: validation.message }, 400);
  }

  const now = Date.now();
  const createdAt = new Date(now).toISOString();
  const expiresAt = now + APPLICATION_RETENTION_MS;
  const id = applicationIdFor(validation.value.idempotencyKey);
  const key = `applications/${id}`;
  const record = {
    id,
    createdAt,
    expiresAt,
    status: "new",
    statusUpdatedAt: createdAt,
    name: validation.value.name,
    email: validation.value.email,
    phone: validation.value.phone,
    workModes: validation.value.workModes,
    message: validation.value.message,
    minimumAgeConfirmed: validation.value.minimumAgeConfirmed,
    privacyNoticeVersion: validation.value.privacyNoticeVersion,
    privacyAcknowledgedAt: createdAt,
    utmSource: validation.value.utmSource,
    utmMedium: validation.value.utmMedium,
    utmCampaign: validation.value.utmCampaign,
    utmContent: validation.value.utmContent,
    referrer: validation.value.referrer,
  };

  try {
    const result = await applicationsStore().setJSON(key, record, {
      metadata: { createdAt: now, expiresAt },
      onlyIfNew: true,
    });
    return jsonResponse(
      { ok: true, message: SUCCESS_MESSAGE },
      result.modified ? 201 : 200,
    );
  } catch (error) {
    console.error(
      "Recruitment application storage failed:",
      error instanceof Error ? error.name : "UnknownError",
    );
    return jsonResponse(
      { ok: false, message: "Não foi possível guardar a candidatura. Tenta novamente." },
      503,
    );
  }
}

export const config = {
  path: "/recrutamento/api/applications",
  rateLimit: {
    windowLimit: 10,
    windowSize: 60,
    aggregateBy: ["ip", "domain"],
  },
};
