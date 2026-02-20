"use strict";

const OpenAI = require("openai");

const STATIC_MODEL_LABELS = {
  "gpt-5.2": "GPT-5.2",
  "gpt-5.1": "GPT-5.1",
  "gpt-5": "GPT-5",
  "gpt-5-mini": "GPT-5 mini",
  "gpt-5-nano": "GPT-5 nano",
  "gpt-4.1": "GPT-4.1",
  "gpt-4.1-mini": "GPT-4.1 mini",
  "gpt-4o": "GPT-4o",
  "gpt-4o-mini": "GPT-4o mini",
  "o4-mini": "o4-mini",
  "o3": "o3"
};

const FALLBACK_MODEL_IDS = [
  "gpt-5.2",
  "gpt-5.1",
  "gpt-5",
  "gpt-5-mini",
  "gpt-5-nano",
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-4o",
  "gpt-4o-mini"
];

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

async function listModels() {
  const configured = getConfiguredModelIds();
  const discovered = await discoverModelIdsFromApi(configured);

  if (discovered.length > 0) {
    return discovered.map(toModelDescriptor);
  }

  if (configured.length > 0) {
    return configured.map(toModelDescriptor);
  }

  return FALLBACK_MODEL_IDS.map(toModelDescriptor);
}

function resolveModel(requestedId) {
  const normalized = typeof requestedId === "string" ? requestedId.trim() : "";
  if (normalized) {
    return {
      id: normalized,
      usedDefault: false
    };
  }

  return {
    id: getDefaultModelId(),
    usedDefault: true
  };
}

function getDefaultModelId() {
  const configuredDefault = process.env.DEFAULT_MODEL || "";
  const trimmedDefault = configuredDefault.trim();
  if (trimmedDefault) {
    return trimmedDefault;
  }

  const configured = getConfiguredModelIds();
  if (configured.length > 0) {
    return configured[0];
  }

  return "gpt-4.1-mini";
}

function getConfiguredModelIds() {
  const configured = process.env.ALLOWED_MODELS || process.env.OPENAI_MODELS || "";
  return uniq(configured
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean));
}

function uniq(items) {
  return Array.from(new Set(items));
}

async function discoverModelIdsFromApi(configured) {
  let response = null;
  try {
    response = await getOpenAIClient().models.list();
  } catch (_error) {
    return [];
  }

  const data = response && Array.isArray(response.data) ? response.data : [];
  const discovered = data
    .map((model) => (model && typeof model.id === "string" ? model.id : ""))
    .filter((id) => id && isModelEligible(id));

  if (configured.length > 0) {
    return sortModelIds(discovered.filter((id) => configured.includes(id)));
  }

  return sortModelIds(discovered);
}

function isModelEligible(modelId) {
  const lower = modelId.toLowerCase();
  return lower.startsWith("gpt-") || lower.startsWith("o1") || lower.startsWith("o3") || lower.startsWith("o4");
}

function sortModelIds(modelIds) {
  return uniq(modelIds).sort((a, b) => {
    const aRank = getModelRank(a);
    const bRank = getModelRank(b);
    if (aRank !== bRank) {
      return aRank - bRank;
    }

    return a.localeCompare(b);
  });
}

function getModelRank(modelId) {
  const lower = modelId.toLowerCase();
  if (lower.startsWith("gpt-5")) {
    return 0;
  }
  if (lower.startsWith("gpt-4.1")) {
    return 1;
  }
  if (lower.startsWith("gpt-4o")) {
    return 2;
  }
  if (lower.startsWith("o4")) {
    return 3;
  }
  if (lower.startsWith("o3")) {
    return 4;
  }
  if (lower.startsWith("o1")) {
    return 5;
  }

  return 9;
}

function toModelDescriptor(modelId) {
  return {
    id: modelId,
    label: STATIC_MODEL_LABELS[modelId] || modelId
  };
}

module.exports = {
  getDefaultModelId,
  getOpenAIClient,
  listModels,
  resolveModel
};
