"use strict";

const { getSessionFromRequest } = require("../_lib/auth");
const { prepareContext } = require("../_lib/context");
const { methodNotAllowed, parseJsonBody, sendError, sendJson } = require("../_lib/http");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return methodNotAllowed(req, res, ["POST"]);
  }

  const user = getSessionFromRequest(req);
  if (!user) {
    return sendError(res, 401, "Unauthorized.");
  }

  try {
    const body = await parseJsonBody(req);
    const sourceText = typeof body.sourceText === "string" ? body.sourceText : "";
    const sourceLabel = typeof body.sourceLabel === "string" ? body.sourceLabel : "unknown";
    const preferredModel = typeof body.preferredModel === "string" ? body.preferredModel : "";

    if (!sourceText.trim()) {
      return sendError(res, 400, "Source text is empty.");
    }

    const result = await prepareContext({
      sourceText,
      sourceLabel,
      preferredModel
    });

    return sendJson(res, 200, Object.assign({ ok: true }, result));
  } catch (error) {
    console.error("context/prepare error:", error);
    if (isConfigError(error)) {
      return sendError(res, 500, "Server configuration is incomplete.");
    }

    if (error && typeof error.message === "string" && error.message.includes("Source text is empty")) {
      return sendError(res, 400, "Source text is empty.");
    }

    return sendError(res, 500, "Failed to prepare story context.");
  }
};

function isConfigError(error) {
  const message = error && error.message ? error.message : "";
  return message.includes("OPENAI_API_KEY");
}
