"use strict";

const { getDefaultModelId, listModels } = require("./_lib/openai");
const { methodNotAllowed, sendJson } = require("./_lib/http");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return methodNotAllowed(req, res, ["GET"]);
  }

  return sendJson(res, 200, {
    ok: true,
    models: listModels(),
    defaultModel: getDefaultModelId()
  });
};
