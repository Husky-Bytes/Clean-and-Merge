"use strict";

const { getGoogleClientId, getSessionFromRequest } = require("../_lib/auth");
const { methodNotAllowed, sendJson } = require("../_lib/http");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return methodNotAllowed(req, res, ["GET"]);
  }

  const user = getSessionFromRequest(req);
  return sendJson(res, 200, {
    ok: true,
    authenticated: Boolean(user),
    user: user || null,
    googleClientId: getGoogleClientId() || null
  });
};
