"use strict";

const { clearSessionCookie } = require("../_lib/auth");
const { methodNotAllowed, sendJson } = require("../_lib/http");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return methodNotAllowed(req, res, ["POST"]);
  }

  clearSessionCookie(req, res);
  return sendJson(res, 200, { ok: true });
};
