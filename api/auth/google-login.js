"use strict";

const { getGoogleClientId, setSessionCookie, verifyGoogleCredential } = require("../_lib/auth");
const { methodNotAllowed, parseJsonBody, sendError, sendJson } = require("../_lib/http");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return methodNotAllowed(req, res, ["POST"]);
  }

  try {
    const body = await parseJsonBody(req);
    const credential = body && body.credential;
    const clientId = body && typeof body.clientId === "string" ? body.clientId.trim() : "";
    if (!credential || typeof credential !== "string") {
      return sendError(res, 400, "Missing Google credential.");
    }

    if (!clientId && !getGoogleClientId()) {
      return sendError(res, 400, "Missing Google Client ID. Save it in Story Chat first.");
    }

    const user = await verifyGoogleCredential(credential, clientId);
    setSessionCookie(req, res, user);
    return sendJson(res, 200, { ok: true, user });
  } catch (error) {
    console.error("google-login error:", error);
    if (isConfigError(error)) {
      return sendError(res, 500, "Server auth configuration is incomplete.");
    }

    return sendError(res, 401, "Google login failed.");
  }
};

function isConfigError(error) {
  const message = error && error.message ? error.message : "";
  return message.includes("SESSION_SECRET");
}
