"use strict";

const crypto = require("crypto");
const { getOpenAIClient, resolveModel } = require("./openai");

const FALLBACK_FULL_CONTEXT_CHAR_LIMIT = 24000;

async function prepareContext(options) {
  const sourceText = typeof options.sourceText === "string" ? options.sourceText : "";
  const sourceType = normalizeSourceType(options.sourceLabel);
  const normalized = normalizeSourceText(sourceText);
  const resolvedModel = resolveModel(options.preferredModel);
  const approxTokens = estimateTokensByChars(normalized);
  const hash = hashText(normalized);
  const fullContextCharLimit = getFullContextCharLimit();

  if (!normalized) {
    throw new Error("Source text is empty.");
  }

  if (normalized.length <= fullContextCharLimit) {
    return {
      sourceType,
      mode: "full",
      contextText: normalized,
      hash,
      model: resolvedModel.id,
      meta: {
        approxTokens,
        originalChars: normalized.length,
        contextChars: normalized.length
      }
    };
  }

  const summary = await summarizeStoryContext({
    model: resolvedModel.id,
    sourceText: normalized
  });

  return {
    sourceType,
    mode: "summary",
    contextText: summary,
    hash,
    model: resolvedModel.id,
    meta: {
      approxTokens,
      originalChars: normalized.length,
      contextChars: summary.length
    }
  };
}

function normalizeSourceText(text) {
  return text.replace(/\r\n/g, "\n").trim();
}

function normalizeSourceType(sourceType) {
  if (sourceType === "clean" || sourceType === "merge") {
    return sourceType;
  }

  return "unknown";
}

function estimateTokensByChars(text) {
  if (!text) {
    return 0;
  }

  return Math.ceil(text.length / 4);
}

function hashText(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16);
}

function getFullContextCharLimit() {
  const raw = process.env.FULL_CONTEXT_CHAR_LIMIT;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return FALLBACK_FULL_CONTEXT_CHAR_LIMIT;
  }

  return Math.floor(parsed);
}

async function summarizeStoryContext(options) {
  const openai = getOpenAIClient();
  const completion = await openai.chat.completions.create({
    model: options.model,
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content: [
          "너는 소설 문맥 정리기다.",
          "핵심 사건, 인물 감정, 관계 변화, 분위기, 앞으로 떡밥만 뽑아서 요약해.",
          "중요한 고유명사는 유지하고, 사실을 바꾸지 마.",
          "과장/창작 금지. 문맥에 없는 내용은 추가하지 마.",
          "출력은 한국어로 12~20개의 짧은 bullet로 작성해."
        ].join("\n")
      },
      {
        role: "user",
        content: options.sourceText
      }
    ]
  });

  const text = readAssistantText(completion).trim();
  if (!text) {
    throw new Error("Failed to summarize context.");
  }

  return text;
}

function readAssistantText(completion) {
  const message = completion && completion.choices && completion.choices[0] && completion.choices[0].message;
  if (!message) {
    return "";
  }

  if (typeof message.content === "string") {
    return message.content;
  }

  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => (part && typeof part.text === "string" ? part.text : ""))
      .join("");
  }

  return "";
}

module.exports = {
  prepareContext
};
