import { timingSafeEqual } from "node:crypto";

import {
  parseBasicAuthorization,
} from "./recruitment-base.mjs";

export * from "./recruitment-base.mjs";

const WEAK_PASSWORD =
  /(password|passw0rd|palavra[-_ ]?passe|changeme|change[-_ ]?me|placeholder|replace[-_ ]?me|example|exemplo|admin123|qwerty|letmein|segredo|secret)/iu;

export function getAdminConfiguration(env = process.env) {
  const username = env.RECRUITMENT_ADMIN_USER || "";
  const password = env.RECRUITMENT_ADMIN_PASSWORD || "";
  const csrfSecret = env.RECRUITMENT_CSRF_SECRET || "";
  const weakPassword =
    password.length < 32 ||
    password.length > 1024 ||
    WEAK_PASSWORD.test(password) ||
    /^(.)\1+$/u.test(password) ||
    (username.length > 0 &&
      password.toLocaleLowerCase("pt-PT").includes(username.toLocaleLowerCase("pt-PT")));
  return {
    username,
    password,
    csrfSecret,
    configured:
      username.length > 0 &&
      !username.includes(":") &&
      !weakPassword &&
      csrfSecret.length >= 32,
  };
}

function safeEqualStrings(left, right) {
  const leftBuffer = Buffer.from(String(left), "utf8");
  const rightBuffer = Buffer.from(String(right), "utf8");
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
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
