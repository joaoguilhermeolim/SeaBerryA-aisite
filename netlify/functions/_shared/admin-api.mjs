import {
  ALLOWED_STATUSES,
  adminAuthFailure,
  appendAuditEvent,
  applicationsStore,
  applicationsToCsv,
  authorizeAdmin,
  filterApplications,
  isAllowedSameOrigin,
  jsonResponse,
  loadCurrentApplications,
  methodNotAllowed,
  readJsonBody,
  textResponse,
  verifyCsrfToken,
} from "./recruitment.mjs";

export default async function handler(request) {
  const authorization = authorizeAdmin(request);
  if (!authorization.ok) return adminAuthFailure(authorization.status);

  const path = adminPath(request);
  if (request.method === "GET" && path === "/applications") {
    return listApplications(request);
  }
  if (request.method === "GET" && path === "/export.csv") {
    return exportApplications(request);
  }

  const statusMatch = path.match(/^\/applications\/([0-9a-f]{64})\/status$/u);
  if (request.method === "PATCH" && statusMatch) {
    if (!isAllowedSameOrigin(request)) {
      return jsonResponse({ ok: false, message: "Origem do pedido invÃ¡lida." }, 403);
    }
    const token = request.headers.get("x-csrf-token");
    if (
      !verifyCsrfToken(
        token,
        authorization.config.username,
        authorization.config.csrfSecret,
      )
    ) {
      return jsonResponse(
        { ok: false, message: "SessÃ£o expirada. Recarrega a pÃ¡gina." },
        403,
      );
    }
    return updateApplicationStatus(request, statusMatch[1]);
  }

  if (["GET", "PATCH"].includes(request.method)) {
    return jsonResponse({ ok: false, message: "Recurso nÃ£o encontrado." }, 404);
  }
  return methodNotAllowed(["GET", "PATCH"]);
}

function adminPath(request) {
  const pathname = new URL(request.url).pathname.replace(/\/+$/u, "");
  const publicPrefix = "/recrutamento/api/admin";
  const functionPrefix = "/.netlify/functions/recruitment-admin-api";
  if (pathname.startsWith(publicPrefix)) return pathname.slice(publicPrefix.length) || "/";
  if (pathname.startsWith(functionPrefix)) return pathname.slice(functionPrefix.length) || "/";
  return pathname;
}

function parseFilters(request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") || "").trim().slice(0, 120);
  const status = url.searchParams.get("status") || "all";
  if (status !== "all" && !ALLOWED_STATUSES.has(status)) {
    return { ok: false, message: "Filtro de estado invÃ¡lido." };
  }
  return { ok: true, query, status };
}

async function listApplications(request) {
  const filters = parseFilters(request);
  if (!filters.ok) return jsonResponse({ ok: false, message: filters.message }, 400);

  const url = new URL(request.url);
  const requestedPage = Number.parseInt(url.searchParams.get("page") || "1", 10);
  const requestedLimit = Number.parseInt(url.searchParams.get("limit") || "50", 10);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const limit = [25, 50, 100].includes(requestedLimit) ? requestedLimit : 50;

  try {
    const applications = await loadCurrentApplications();
    const filtered = filterApplications(applications, filters.query, filters.status);
    const pages = Math.max(1, Math.ceil(filtered.length / limit));
    const safePage = Math.min(page, pages);
    const start = (safePage - 1) * limit;
    const summary = { total: applications.length };
    for (const status of ALLOWED_STATUSES) summary[status] = 0;
    for (const application of applications) {
      if (ALLOWED_STATUSES.has(application.status)) summary[application.status] += 1;
    }
    const items = filtered.slice(start, start + limit).map(({ _key, _etag, ...item }) => item);

    return jsonResponse({
      ok: true,
      items,
      summary,
      pagination: {
        page: safePage,
        pages,
        limit,
        total: filtered.length,
      },
    });
  } catch (error) {
    console.error(
      "Recruitment admin list failed:",
      error instanceof Error ? error.name : "UnknownError",
    );
    return jsonResponse(
      { ok: false, message: "NÃ£o foi possÃ­vel carregar as candidaturas." },
      503,
    );
  }
}

async function updateApplicationStatus(request, id) {
  const body = await readJsonBody(request, 2_048);
  if (!body.ok) return jsonResponse({ ok: false, message: body.message }, body.status);
  const nextStatus = body.value?.status;
  if (typeof nextStatus !== "string" || !ALLOWED_STATUSES.has(nextStatus)) {
    return jsonResponse({ ok: false, message: "Estado invÃ¡lido." }, 400);
  }

  const store = applicationsStore();
  const key = `applications/${id}`;
  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const entry = await store.getWithMetadata(key, { type: "json" });
      if (!entry) {
        return jsonResponse({ ok: false, message: "Candidatura nÃ£o encontrada." }, 404);
      }
      if (Number(entry.metadata?.expiresAt || entry.data?.expiresAt || 0) <= Date.now()) {
        await store.delete(key);
        return jsonResponse({ ok: false, message: "Candidatura jÃ¡ eliminada por retenÃ§Ã£o." }, 404);
      }

      const previousStatus = ALLOWED_STATUSES.has(entry.data.status)
        ? entry.data.status
        : "new";
      if (previousStatus === nextStatus) {
        return jsonResponse({ ok: true, status: nextStatus });
      }
      const statusUpdatedAt = new Date().toISOString();
      const result = await store.setJSON(
        key,
        { ...entry.data, status: nextStatus, statusUpdatedAt },
        {
          metadata: entry.metadata,
          onlyIfMatch: entry.etag,
        },
      );
      if (!result.modified) continue;

      await appendAuditEvent({
        action: "status_change",
        applicationId: id,
        fromStatus: previousStatus,
        toStatus: nextStatus,
      });
      return jsonResponse({ ok: true, status: nextStatus, statusUpdatedAt });
    }
    return jsonResponse(
      { ok: false, message: "A candidatura foi alterada noutra sessÃ£o. Tenta novamente." },
      409,
    );
  } catch (error) {
    console.error(
      "Recruitment status update failed:",
      error instanceof Error ? error.name : "UnknownError",
    );
    return jsonResponse({ ok: false, message: "NÃ£o foi possÃ­vel atualizar o estado." }, 503);
  }
}

async function exportApplications(request) {
  const filters = parseFilters(request);
  if (!filters.ok) return jsonResponse({ ok: false, message: filters.message }, 400);
  try {
    const applications = await loadCurrentApplications();
    const filtered = filterApplications(applications, filters.query, filters.status);
    await appendAuditEvent({ action: "csv_export", resultCount: filtered.length });
    const csv = applicationsToCsv(filtered);
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
    return jsonResponse({ ok: false, message: "NÃ£o foi possÃ­vel exportar o CSV." }, 503);
  }
}

export const config = {
  path: "/recrutamento/api/admin/*",
  rateLimit: {
    windowLimit: 120,
    windowSize: 60,
    aggregateBy: ["ip", "domain"],
  },
};

