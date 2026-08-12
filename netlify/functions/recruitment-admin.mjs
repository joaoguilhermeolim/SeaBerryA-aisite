import adminApiHandler from "./_shared/admin-api.mjs";
import adminPageHandler from "./_shared/admin-page.mjs";
import {
  appendAuditEvent,
  filterApplications,
  jsonResponse,
  loadCurrentApplications,
  textResponse,
} from "./_shared/recruitment.mjs";
import {
  ALLOWED_STATUSES,
  applicationsToCsvV2,
  authorizeHardenedAdmin,
  hardenedAdminAuthFailure,
} from "./_shared/recruitment-v2.mjs";

export default async function handler(request) {
  const pathname = new URL(request.url).pathname.replace(/\/+$/u, "") || "/";
  const isPage = pathname === "/recrutamento/admin";
  const isApi = pathname.startsWith("/recrutamento/api/admin/");
  if (!isPage && !isApi) {
    return textResponse("Recurso não encontrado.", 404, {
      "content-type": "text/plain; charset=utf-8",
    });
  }

  const authorization = authorizeHardenedAdmin(request);
  if (!authorization.ok) return hardenedAdminAuthFailure(authorization.status);

  if (isPage) return enhanceAdminPage(await adminPageHandler(request));
  if (request.method === "GET" && pathname === "/recrutamento/api/admin/export.csv") {
    return exportApplications(request);
  }
  return adminApiHandler(request);
}

async function enhanceAdminPage(response) {
  const html = (await response.text())
    .replace(
      "<th>Mensagem</th><th>Estado</th>",
      "<th>Mensagem</th><th>Origem / confirmações</th><th>Estado</th>",
    )
    .replace(
      ".message{max-width:360px;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.42}.status-select",
      ".message{max-width:360px;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.42}.audit{min-width:230px}.audit strong,.audit span{display:block}.audit span{margin-top:5px;color:var(--muted);font-size:.78rem;overflow-wrap:anywhere}.status-select",
    )
    .replace(
      'row.append(element("td","message",application.message));\n        const statusCell',
      'row.append(element("td","message",application.message)); const audit=element("td","audit"); audit.append(element("strong","",application.minimumAgeConfirmed?"16+ confirmado":"16+ sem confirmação")); audit.append(element("span","","Aviso "+(application.privacyNoticeVersion||"—")+" · "+formatDate(application.privacyAcknowledgedAt))); const attribution=[application.utmSource,application.utmMedium,application.utmCampaign,application.utmContent].filter(Boolean).join(" · "); audit.append(element("span","",attribution||"Sem UTM")); if(application.referrer)audit.append(element("span","",application.referrer)); row.append(audit);\n        const statusCell',
    );
  return new Response(html, { status: response.status, headers: response.headers });
}

function parseFilters(request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") || "").trim().slice(0, 120);
  const status = url.searchParams.get("status") || "all";
  if (status !== "all" && !ALLOWED_STATUSES.has(status)) {
    return { ok: false, message: "Filtro de estado inválido." };
  }
  return { ok: true, query, status };
}

async function exportApplications(request) {
  const filters = parseFilters(request);
  if (!filters.ok) return jsonResponse({ ok: false, message: filters.message }, 400);
  try {
    const applications = await loadCurrentApplications();
    const filtered = filterApplications(applications, filters.query, filters.status);
    await appendAuditEvent({ action: "csv_export", resultCount: filtered.length });
    const csv = applicationsToCsvV2(filtered);
    const date = new Date().toISOString().slice(0, 10);
    return textResponse(csv, 200, {
      "content-disposition": `attachment; filename="candidaturas-sea-berry-${date}.csv"`,
      "content-type": "text/csv; charset=utf-8",
    });
  } catch (error) {
    console.error(
      "Recruitment CSV export failed:",
      error instanceof Error ? error.name : "UnknownError",
    );
    return jsonResponse({ ok: false, message: "Não foi possível exportar o CSV." }, 503);
  }
}

export const config = {
  path: [
    "/recrutamento/admin",
    "/recrutamento/api/admin/*",
  ],
  rateLimit: {
    windowLimit: 30,
    windowSize: 60,
    aggregateBy: ["ip", "domain"],
  },
};
