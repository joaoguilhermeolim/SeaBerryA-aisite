import test from "node:test";
import assert from "node:assert/strict";

import adminHandler from "../netlify/functions/recruitment-admin.mjs";

test("a função administrativa carrega e renderiza através dos imports reais", async () => {
  const previous = {
    user: process.env.RECRUITMENT_ADMIN_USER,
    password: process.env.RECRUITMENT_ADMIN_PASSWORD,
    csrf: process.env.RECRUITMENT_CSRF_SECRET,
  };
  const username = "gestor";
  const password = "CorrectHorse!Battery#Staple-2026-Madeira";
  process.env.RECRUITMENT_ADMIN_USER = username;
  process.env.RECRUITMENT_ADMIN_PASSWORD = password;
  process.env.RECRUITMENT_CSRF_SECRET = "s".repeat(40);

  try {
    const authorization = Buffer.from(`${username}:${password}`, "utf8").toString("base64");
    const response = await adminHandler(
      new Request("https://seaberryacai.com/recrutamento/admin", {
        headers: { authorization: `Basic ${authorization}` },
      }),
    );
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /Origem \/ confirmações/u);
    assert.match(html, /minimumAgeConfirmed/u);

    const hiddenEndpoint = await adminHandler(
      new Request("https://seaberryacai.com/.netlify/functions/recruitment-admin", {
        headers: { authorization: `Basic ${authorization}` },
      }),
    );
    assert.equal(hiddenEndpoint.status, 404);
  } finally {
    setOrDelete("RECRUITMENT_ADMIN_USER", previous.user);
    setOrDelete("RECRUITMENT_ADMIN_PASSWORD", previous.password);
    setOrDelete("RECRUITMENT_CSRF_SECRET", previous.csrf);
  }
});

function setOrDelete(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
