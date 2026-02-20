"use strict";

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function sendError(res, statusCode, message, extra) {
  sendJson(res, statusCode, Object.assign({ ok: false, error: message }, extra || {}));
}

function methodNotAllowed(req, res, allowedMethods) {
  res.setHeader("Allow", allowedMethods.join(", "));
  sendError(res, 405, "Method not allowed.");
}

async function parseJsonBody(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  if (typeof req.body === "string") {
    return req.body.trim() ? JSON.parse(req.body) : {};
  }

  const raw = await readRawBody(req);
  if (!raw.trim()) {
    return {};
  }

  return JSON.parse(raw);
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", (error) => reject(error));
  });
}

module.exports = {
  methodNotAllowed,
  parseJsonBody,
  sendError,
  sendJson
};
