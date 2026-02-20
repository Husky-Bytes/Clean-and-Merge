"use strict";

const { getDefaultModelId, listModels } = require("./_lib/openai");
const { methodNotAllowed, sendJson } = require("./_lib/http");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return methodNotAllowed(req, res, ["GET"]);
  }

  const models = await listModels();
  const defaultModel = getDefaultModelId();
  const effectiveDefault = models.some((model) => model.id === defaultModel)
    ? defaultModel
    : (models[0] ? models[0].id : defaultModel);

  return sendJson(res, 200, {
    ok: true,
    models,
    defaultModel: effectiveDefault
  });
};
