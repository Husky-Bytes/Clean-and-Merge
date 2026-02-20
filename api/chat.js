"use strict";

const { getSessionFromRequest } = require("./_lib/auth");
const { methodNotAllowed, parseJsonBody, sendError, sendJson } = require("./_lib/http");
const { getOpenAIClient, resolveModel } = require("./_lib/openai");

const MAX_HISTORY_MESSAGES = 40;

const BASE_SYSTEM_PROMPT = [
  "너는 사용자의 '소설 수다 파트너'다.",
  "목표: 사용자가 제공한 소설/대화 문맥을 바탕으로 재미있게 떠들고 아이디어를 확장한다.",
  "",
  "규칙:",
  "1) 반드시 제공된 Story Context를 근거로 말한다.",
  "2) 문맥에 없는 내용은 '추측'이라고 명확히 표시한다.",
  "3) 말투는 친근하고 자연스럽게, 너무 딱딱하지 않게 한다.",
  "4) 응답은 보통 3~8문장으로 짧고 재밌게 작성한다.",
  "5) 매 응답 끝에 대화를 이어가는 질문 1개를 붙인다.",
  "6) 사용자가 원하면 장면/대사/전개 아이디어를 제안한다.",
  "7) 위험하거나 부적절한 요청은 안전하게 우회한다."
].join("\n");

const PROACTIVE_STARTER_PROMPT = [
  "지금 Story Context를 보고 먼저 말을 걸어줘.",
  "- 인상적인 포인트 1~2개",
  "- 왜 흥미로운지 짧게",
  "- 다음에 같이 떠들 주제 질문 1개"
].join("\n");

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
    const model = typeof body.model === "string" ? body.model : "";
    const contextText = typeof body.contextText === "string" ? body.contextText.trim() : "";
    const contextMeta = body.contextMeta && typeof body.contextMeta === "object" ? body.contextMeta : {};
    const proactiveStart = Boolean(body.proactiveStart);
    const history = normalizeMessages(body.messages);

    if (!contextText) {
      return sendError(res, 400, "Missing story context.");
    }

    if (!proactiveStart && !history.some((message) => message.role === "user")) {
      return sendError(res, 400, "A user message is required.");
    }

    const resolvedModel = resolveModel(model);
    const openai = getOpenAIClient();

    const modelMessages = buildModelMessages({
      contextText,
      contextMeta,
      history,
      proactiveStart
    });

    const completion = await createChatCompletionWithRetry(openai, resolvedModel.id, modelMessages);
    const assistantText = readAssistantText(completion).trim();
    if (!assistantText) {
      return sendError(res, 502, "The model returned an empty response.");
    }

    return sendJson(res, 200, {
      ok: true,
      model: resolvedModel.id,
      usedDefaultModel: resolvedModel.usedDefault,
      assistant: {
        role: "assistant",
        content: assistantText,
        ts: Date.now()
      },
      usage: completion.usage || null
    });
  } catch (error) {
    console.error("chat error:", error);
    if (isConfigError(error)) {
      return sendError(res, 500, "Server configuration is incomplete.");
    }
    return sendError(res, 500, "Chat request failed.");
  }
};

function buildModelMessages(options) {
  const systemContent = buildSystemPrompt({
    contextText: options.contextText,
    contextMeta: options.contextMeta
  });

  const clippedHistory = options.history.slice(-MAX_HISTORY_MESSAGES);
  const messages = [{ role: "system", content: systemContent }].concat(clippedHistory);
  if (options.proactiveStart) {
    messages.push({ role: "user", content: PROACTIVE_STARTER_PROMPT });
  }

  return messages;
}

function buildSystemPrompt(options) {
  const sourceType = typeof options.contextMeta.sourceType === "string" ? options.contextMeta.sourceType : "unknown";
  const contextMode = typeof options.contextMeta.mode === "string" ? options.contextMeta.mode : "unknown";
  const hash = typeof options.contextMeta.hash === "string" ? options.contextMeta.hash : "none";

  return [
    BASE_SYSTEM_PROMPT,
    "",
    "Story Context Metadata:",
    "- sourceType: " + sourceType,
    "- contextMode: " + contextMode,
    "- contextHash: " + hash,
    "",
    "Story Context:",
    options.contextText
  ].join("\n");
}

function normalizeMessages(rawMessages) {
  if (!Array.isArray(rawMessages)) {
    return [];
  }

  const result = [];
  for (const message of rawMessages) {
    if (!message || typeof message !== "object") {
      continue;
    }

    const role = message.role === "assistant" ? "assistant" : message.role === "user" ? "user" : "";
    const content = typeof message.content === "string" ? message.content.trim() : "";
    if (!role || !content) {
      continue;
    }

    result.push({
      role,
      content
    });
  }

  return result;
}

async function createChatCompletionWithRetry(openai, model, messages) {
  try {
    return await openai.chat.completions.create({
      model,
      temperature: 0.85,
      messages
    });
  } catch (error) {
    if (!isContextLengthError(error)) {
      throw error;
    }

    const systemMessage = messages[0];
    const shortTail = messages.slice(-8);
    return openai.chat.completions.create({
      model,
      temperature: 0.85,
      messages: [systemMessage].concat(shortTail)
    });
  }
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

function isContextLengthError(error) {
  const code = error && (error.code || (error.error && error.error.code));
  if (code === "context_length_exceeded") {
    return true;
  }

  const message = error && error.message ? error.message.toLowerCase() : "";
  return message.includes("maximum context length") || message.includes("context_length_exceeded");
}

function isConfigError(error) {
  const message = error && error.message ? error.message : "";
  return message.includes("OPENAI_API_KEY");
}
