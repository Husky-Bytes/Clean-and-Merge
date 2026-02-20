"use strict";

const OpenAI = require("openai");

const KNOWN_MODELS = [
  { id: "gpt-4.1-mini", label: "GPT-4.1 mini" },
  { id: "gpt-4o-mini", label: "GPT-4o mini" },
  { id: "gpt-4.1", label: "GPT-4.1" },
  { id: "gpt-4o", label: "GPT-4o" }
];

const DEFAULT_ALLOWED_MODELS = ["gpt-4.1-mini", "gpt-4o-mini", "gpt-4.1"];

let openAIClient = null;

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY.");
  }

  if (!openAIClient) {
    openAIClient = new OpenAI({ apiKey });
  }

  return openAIClient;
}

function listModels() {
  const allowed = getAllowedModelIds();
  const labels = KNOWN_MODELS.reduce((acc, model) => {
    acc[model.id] = model.label;
    return acc;
  }, {});

  return allowed.map((id) => ({
    id,
    label: labels[id] || id
  }));
}

function resolveModel(requestedId) {
  const allowed = getAllowedModelIds();
  const defaultId = getDefaultModelId();

  if (requestedId && allowed.includes(requestedId)) {
    return {
      id: requestedId,
      usedDefault: false
    };
  }

  return {
    id: defaultId,
    usedDefault: true
  };
}

function getDefaultModelId() {
  const allowed = getAllowedModelIds();
  const configuredDefault = process.env.DEFAULT_MODEL || "";
  if (configuredDefault && allowed.includes(configuredDefault)) {
    return configuredDefault;
  }

  return allowed[0];
}

function getAllowedModelIds() {
  const configured = process.env.ALLOWED_MODELS || "";
  const configuredList = configured
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (configuredList.length > 0) {
    return uniq(configuredList);
  }

  return DEFAULT_ALLOWED_MODELS.slice();
}

function uniq(items) {
  return Array.from(new Set(items));
}

module.exports = {
  getDefaultModelId,
  getOpenAIClient,
  listModels,
  resolveModel
};
