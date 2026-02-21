"use strict";

const cleanFileInput = document.getElementById("cleanFileInput");
const cleanConvertBtn = document.getElementById("cleanConvertBtn");
const cleanSelectedFileEl = document.getElementById("cleanSelectedFile");
const cleanStatusEl = document.getElementById("cleanStatus");

const mergeFirstInput = document.getElementById("mergeFirstInput");
const mergeSecondInput = document.getElementById("mergeSecondInput");
const mergeFirstSelectedEl = document.getElementById("mergeFirstSelected");
const mergeSecondSelectedEl = document.getElementById("mergeSecondSelected");
const mergeBtn = document.getElementById("mergeBtn");
const mergeStatusEl = document.getElementById("mergeStatus");

const authInfoEl = document.getElementById("authInfo");
const googleLoginBtn = document.getElementById("googleLoginBtn");
const googleButtonWrapEl = document.getElementById("googleButtonWrap");
const googleLoginButtonEl = document.getElementById("googleLoginButton");
const googleClientIdInput = document.getElementById("googleClientIdInput");
const saveGoogleClientIdBtn = document.getElementById("saveGoogleClientIdBtn");
const clearGoogleClientIdBtn = document.getElementById("clearGoogleClientIdBtn");
const logoutBtn = document.getElementById("logoutBtn");
const modelSelect = document.getElementById("modelSelect");
const proactiveToggle = document.getElementById("proactiveToggle");
const contextBanner = document.getElementById("contextBanner");
const chatMessagesEl = document.getElementById("chatMessages");
const chatInput = document.getElementById("chatInput");
const chatSendBtn = document.getElementById("chatSendBtn");
const clearChatBtn = document.getElementById("clearChatBtn");
const chatStatusEl = document.getElementById("chatStatus");

const PROACTIVE_STORAGE_KEY = "story_chat_proactive_enabled";
const MODEL_STORAGE_KEY = "story_chat_selected_model";
const GOOGLE_CLIENT_ID_STORAGE_KEY = "story_chat_google_client_id";

let cleanFile = null;
let mergeFirstFile = null;
let mergeSecondFile = null;

let authState = {
  authenticated: false,
  user: null,
  googleClientId: "",
  serverGoogleClientId: ""
};

let selectedModel = "";
let proactiveEnabled = readBoolFromStorage(PROACTIVE_STORAGE_KEY, false);
let chatMessages = [];
let latestStoryText = "";
let latestStorySourceType = "unknown";
let latestStoryContext = null;
let isChatBusy = false;
let googleIdentityReady = false;

proactiveToggle.checked = proactiveEnabled;

cleanFileInput.addEventListener("change", () => {
  cleanFile = cleanFileInput.files && cleanFileInput.files[0] ? cleanFileInput.files[0] : null;
  cleanConvertBtn.disabled = !cleanFile;

  if (!cleanFile) {
    cleanSelectedFileEl.textContent = "No file selected.";
    showStatus(cleanStatusEl, "", "");
    return;
  }

  cleanSelectedFileEl.textContent = "Selected: " + cleanFile.name;
  showStatus(cleanStatusEl, "Ready. Click \"Convert to Clean TXT\".", "info");
});

mergeFirstInput.addEventListener("change", () => {
  mergeFirstFile = mergeFirstInput.files && mergeFirstInput.files[0] ? mergeFirstInput.files[0] : null;
  mergeFirstSelectedEl.textContent = mergeFirstFile ? "Selected first: " + mergeFirstFile.name : "No first file selected.";
  mergeBtn.disabled = !(mergeFirstFile && mergeSecondFile);

  if (mergeFirstFile || mergeSecondFile) {
    showStatus(mergeStatusEl, "Ready. Select both files and click \"Merge to TXT\".", "info");
  } else {
    showStatus(mergeStatusEl, "", "");
  }
});

mergeSecondInput.addEventListener("change", () => {
  mergeSecondFile = mergeSecondInput.files && mergeSecondInput.files[0] ? mergeSecondInput.files[0] : null;
  mergeSecondSelectedEl.textContent = mergeSecondFile ? "Selected second: " + mergeSecondFile.name : "No second file selected.";
  mergeBtn.disabled = !(mergeFirstFile && mergeSecondFile);

  if (mergeFirstFile || mergeSecondFile) {
    showStatus(mergeStatusEl, "Ready. Select both files and click \"Merge to TXT\".", "info");
  } else {
    showStatus(mergeStatusEl, "", "");
  }
});

cleanConvertBtn.addEventListener("click", async () => {
  if (!cleanFile) {
    showStatus(cleanStatusEl, "Please select a file first.", "error");
    return;
  }

  if (cleanFile.size === 0) {
    showStatus(cleanStatusEl, "The selected file is empty.", "error");
    return;
  }

  cleanConvertBtn.disabled = true;
  showStatus(cleanStatusEl, "Converting...", "info");

  try {
    const rawText = await readFileAsText(cleanFile);
    if (!rawText.trim()) {
      throw new Error("The selected file is empty.");
    }

    const cleanedResult = toCleanedConversationText(rawText);
    const outputName = makeOutputFileName(cleanFile.name, "_Cleaned.txt");
    downloadText(cleanedResult.text, outputName);

    showStatus(cleanStatusEl, cleanedResult.count + " message(s) extracted. Downloaded: " + outputName, "success");
    await handleStorySourceUpdate(cleanedResult.text, "clean");
  } catch (error) {
    showStatus(cleanStatusEl, error.message || "An unexpected error occurred.", "error");
  } finally {
    cleanConvertBtn.disabled = !cleanFile;
  }
});

mergeBtn.addEventListener("click", async () => {
  if (!mergeFirstFile || !mergeSecondFile) {
    showStatus(mergeStatusEl, "Please select both files before merging.", "error");
    return;
  }

  if (mergeFirstFile.size === 0) {
    showStatus(mergeStatusEl, "The first file is empty.", "error");
    return;
  }

  if (mergeSecondFile.size === 0) {
    showStatus(mergeStatusEl, "The second file is empty.", "error");
    return;
  }

  mergeBtn.disabled = true;
  showStatus(mergeStatusEl, "Merging...", "info");

  try {
    const firstRaw = await readFileAsText(mergeFirstFile);
    if (!firstRaw.trim()) {
      throw new Error("The first file is empty.");
    }

    const secondRaw = await readFileAsText(mergeSecondFile);
    if (!secondRaw.trim()) {
      throw new Error("The second file is empty.");
    }

    const firstSegment = toMergeSegment(firstRaw, "first");
    const secondSegment = toMergeSegment(secondRaw, "second");
    const mergedText = joinSeamless(firstSegment.text, secondSegment.text);

    const outputName = makeOutputFileName(mergeSecondFile.name, "_Merged.txt");
    downloadText(mergedText, outputName);

    const detail = "Merged complete. First: " + firstSegment.type + ", Second: " + secondSegment.type + ", Total chars: " + mergedText.length + ". Downloaded: " + outputName;
    showStatus(mergeStatusEl, detail, "success");
    await handleStorySourceUpdate(mergedText, "merge");
  } catch (error) {
    showStatus(mergeStatusEl, error.message || "An unexpected error occurred.", "error");
  } finally {
    mergeBtn.disabled = !(mergeFirstFile && mergeSecondFile);
  }
});

proactiveToggle.addEventListener("change", async () => {
  proactiveEnabled = proactiveToggle.checked;
  localStorage.setItem(PROACTIVE_STORAGE_KEY, proactiveEnabled ? "1" : "0");

  if (proactiveEnabled && authState.authenticated && latestStoryContext) {
    await triggerProactiveStarter();
  }
});

modelSelect.addEventListener("change", async () => {
  selectedModel = modelSelect.value;
  localStorage.setItem(MODEL_STORAGE_KEY, selectedModel);

  if (authState.authenticated && latestStoryText) {
    await prepareStoryContextFromLatest(false);
  }

  refreshChatControls();
});

saveGoogleClientIdBtn.addEventListener("click", () => {
  const manualClientId = (googleClientIdInput.value || "").trim();
  if (!manualClientId) {
    showStatus(chatStatusEl, "Enter Google Client ID first.", "error");
    return;
  }

  localStorage.setItem(GOOGLE_CLIENT_ID_STORAGE_KEY, manualClientId);
  authState.googleClientId = getEffectiveGoogleClientId(authState.serverGoogleClientId);
  googleClientIdInput.value = authState.googleClientId;
  googleIdentityReady = false;
  updateAuthUI();
  refreshChatControls();
  showStatus(chatStatusEl, "Google Client ID saved in this browser.", "success");
});

clearGoogleClientIdBtn.addEventListener("click", () => {
  localStorage.removeItem(GOOGLE_CLIENT_ID_STORAGE_KEY);
  authState.googleClientId = getEffectiveGoogleClientId(authState.serverGoogleClientId);
  googleClientIdInput.value = authState.googleClientId;
  googleIdentityReady = false;
  updateAuthUI();
  refreshChatControls();
  showStatus(chatStatusEl, "Saved Google Client ID was cleared.", "info");
});

googleLoginBtn.addEventListener("click", async () => {
  if (authState.authenticated) {
    return;
  }

  if (!authState.googleClientId) {
    showStatus(chatStatusEl, "Save Google Client ID in this page first, then try login.", "error");
    return;
  }

  const ready = ensureGoogleIdentityReady();
  if (!ready) {
    showStatus(chatStatusEl, "Google script is still loading. Try again in 1-2 seconds.", "info");
    return;
  }

  googleButtonWrapEl.style.display = "none";
  window.google.accounts.id.prompt((notification) => {
    if (!notification) {
      return;
    }

    if (
      notification.isNotDisplayed() ||
      notification.isSkippedMoment() ||
      notification.isDismissedMoment()
    ) {
      googleButtonWrapEl.style.display = "block";
      renderGoogleLoginButton();
      showStatus(chatStatusEl, "Popup was blocked or skipped. Click the Google button shown below.", "info");
    }
  });
});

logoutBtn.addEventListener("click", async () => {
  try {
    await fetchJson("/api/auth/logout", { method: "POST" });
  } catch (_error) {
    // ignore and still refresh local state
  }

  await refreshSession();
  showStatus(chatStatusEl, "Logged out.", "info");
  refreshChatControls();
});

chatInput.addEventListener("input", () => {
  refreshChatControls();
});

chatInput.addEventListener("keydown", async (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    await requestAssistantReply(false);
  }
});

chatSendBtn.addEventListener("click", async () => {
  await requestAssistantReply(false);
});

clearChatBtn.addEventListener("click", async () => {
  chatMessages = [];
  renderChatMessages();
  showStatus(chatStatusEl, "채팅 기록을 비웠어요.", "success");
  refreshChatControls();

  if (proactiveEnabled && authState.authenticated && latestStoryContext) {
    await triggerProactiveStarter();
  }
});

async function initializePage() {
  renderChatMessages();
  refreshChatControls();
  googleClientIdInput.value = getStoredGoogleClientId();
  updateContextBanner("먼저 Clean/Merge를 실행해서 문맥을 준비해 주세요.", "info");

  await refreshSession();
  await loadModels();
  refreshChatControls();
}

async function refreshSession() {
  try {
    const data = await fetchJson("/api/auth/session", { method: "GET" });
    authState.authenticated = Boolean(data.authenticated);
    authState.user = data.user || null;
    authState.serverGoogleClientId = typeof data.googleClientId === "string" ? data.googleClientId.trim() : "";
    authState.googleClientId = getEffectiveGoogleClientId(authState.serverGoogleClientId);
  } catch (_error) {
    authState.authenticated = false;
    authState.user = null;
    authState.serverGoogleClientId = "";
    authState.googleClientId = getEffectiveGoogleClientId("");
  }

  googleClientIdInput.value = authState.googleClientId;

  updateAuthUI();
  refreshChatControls();
}

function updateAuthUI() {
  if (authState.authenticated && authState.user) {
    authInfoEl.textContent = "Logged in as " + (authState.user.name || "User");
    googleLoginBtn.style.display = "none";
    googleButtonWrapEl.style.display = "none";
    logoutBtn.disabled = false;
    return;
  }

  googleLoginBtn.style.display = "inline-block";
  googleLoginBtn.disabled = !authState.googleClientId;
  authInfoEl.textContent = authState.googleClientId
    ? "Not logged in. Use Google sign-in to enable Story Chat."
    : "Not logged in. Save Google Client ID above, then login.";
  googleButtonWrapEl.style.display = "none";
  logoutBtn.disabled = true;

  if (authState.googleClientId) {
    renderGoogleLoginButton();
  }
}

function renderGoogleLoginButton() {
  googleLoginButtonEl.innerHTML = "";
  if (!authState.googleClientId) {
    return;
  }

  if (!ensureGoogleIdentityReady()) {
    setTimeout(renderGoogleLoginButton, 250);
    return;
  }

  window.google.accounts.id.renderButton(googleLoginButtonEl, {
    theme: "outline",
    size: "large",
    text: "signin_with",
    shape: "pill"
  });
}

function ensureGoogleIdentityReady() {
  if (!authState.googleClientId) {
    return false;
  }

  if (!window.google || !window.google.accounts || !window.google.accounts.id) {
    return false;
  }

  if (!googleIdentityReady) {
    window.google.accounts.id.initialize({
      client_id: authState.googleClientId,
      callback: handleGoogleCredentialResponse,
      ux_mode: "popup"
    });
    googleIdentityReady = true;
  }

  return true;
}

async function handleGoogleCredentialResponse(response) {
  try {
    await fetchJson("/api/auth/google-login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        credential: response.credential,
        clientId: authState.googleClientId
      })
    });

    await refreshSession();
    showStatus(chatStatusEl, "로그인 완료. Story Chat 사용 가능!", "success");

    if (latestStoryText) {
      await prepareStoryContextFromLatest(proactiveEnabled);
    }
  } catch (error) {
    showStatus(chatStatusEl, error.message || "Google login failed.", "error");
  }
}

async function loadModels() {
  try {
    const data = await fetchJson("/api/models", { method: "GET" });
    const models = Array.isArray(data.models) ? data.models : [];
    const defaultModel = typeof data.defaultModel === "string" ? data.defaultModel : "";

    modelSelect.innerHTML = "";
    for (const model of models) {
      const option = document.createElement("option");
      option.value = model.id;
      option.textContent = model.label || model.id;
      modelSelect.appendChild(option);
    }

    const savedModel = localStorage.getItem(MODEL_STORAGE_KEY) || "";
    const finalModel = models.some((item) => item.id === savedModel)
      ? savedModel
      : (models.some((item) => item.id === defaultModel) ? defaultModel : (models[0] ? models[0].id : ""));

    selectedModel = finalModel;
    if (selectedModel) {
      modelSelect.value = selectedModel;
      localStorage.setItem(MODEL_STORAGE_KEY, selectedModel);
    }
  } catch (_error) {
    modelSelect.innerHTML = "";
    selectedModel = "";
  }
}

async function handleStorySourceUpdate(sourceText, sourceType) {
  latestStoryText = sourceText;
  latestStorySourceType = sourceType;
  latestStoryContext = null;

  if (!authState.authenticated) {
    updateContextBanner("새 " + sourceType + " 문서를 불러왔어요. 로그인하면 AI 문맥으로 연결돼요.", "info");
    refreshChatControls();
    return;
  }

  await prepareStoryContextFromLatest(proactiveEnabled);
}

async function prepareStoryContextFromLatest(triggerProactive) {
  if (!latestStoryText || !authState.authenticated) {
    return;
  }

  if (!selectedModel) {
    await loadModels();
  }

  try {
    updateContextBanner("문맥 준비 중...", "info");
    const data = await fetchJson("/api/context/prepare", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        sourceText: latestStoryText,
        sourceLabel: latestStorySourceType,
        preferredModel: selectedModel
      })
    });

    latestStoryContext = {
      sourceType: data.sourceType,
      mode: data.mode,
      text: data.contextText,
      hash: data.hash
    };

    const message = "현재 문맥: " + latestStoryContext.sourceType + " / " + latestStoryContext.mode + " (hash " + latestStoryContext.hash + ")";
    updateContextBanner(message, "success");
    refreshChatControls();

    if (triggerProactive && proactiveEnabled) {
      await triggerProactiveStarter();
    }
  } catch (error) {
    if (error.status === 401) {
      await refreshSession();
      updateContextBanner("로그인이 필요해요. 다시 로그인해 주세요.", "error");
      return;
    }

    latestStoryContext = null;
    updateContextBanner(error.message || "문맥 준비에 실패했어요.", "error");
    refreshChatControls();
  }
}

async function triggerProactiveStarter() {
  await requestAssistantReply(true);
}

async function requestAssistantReply(proactiveStart) {
  if (!authState.authenticated) {
    showStatus(chatStatusEl, "로그인 후 사용해 주세요.", "error");
    return;
  }

  if (!latestStoryContext) {
    showStatus(chatStatusEl, "먼저 Clean/Merge를 실행해서 문맥을 준비해 주세요.", "error");
    return;
  }

  if (!selectedModel) {
    showStatus(chatStatusEl, "모델을 먼저 선택해 주세요.", "error");
    return;
  }

  if (isChatBusy) {
    return;
  }

  if (!proactiveStart) {
    const userText = chatInput.value.trim();
    if (!userText) {
      return;
    }

    chatMessages.push({
      role: "user",
      content: userText,
      ts: Date.now()
    });

    chatInput.value = "";
    renderChatMessages();
  }

  isChatBusy = true;
  refreshChatControls();
  showStatus(chatStatusEl, proactiveStart ? "AI가 먼저 말을 거는 중..." : "AI가 답변을 만드는 중...", "info");

  try {
    const data = await fetchJson("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: selectedModel,
        contextText: latestStoryContext.text,
        contextMeta: {
          sourceType: latestStoryContext.sourceType,
          mode: latestStoryContext.mode,
          hash: latestStoryContext.hash
        },
        messages: chatMessages.map((message) => ({
          role: message.role,
          content: message.content
        })),
        proactiveStart: proactiveStart
      })
    });

    chatMessages.push({
      role: "assistant",
      content: data.assistant.content,
      ts: data.assistant.ts || Date.now()
    });

    renderChatMessages();
    showStatus(chatStatusEl, "응답 도착!", "success");
  } catch (error) {
    if (error.status === 401) {
      await refreshSession();
      showStatus(chatStatusEl, "세션이 만료됐어요. 다시 로그인해 주세요.", "error");
    } else {
      showStatus(chatStatusEl, error.message || "채팅 요청에 실패했어요.", "error");
    }
  } finally {
    isChatBusy = false;
    refreshChatControls();
  }
}

function renderChatMessages() {
  chatMessagesEl.innerHTML = "";
  if (chatMessages.length === 0) {
    const empty = document.createElement("div");
    empty.className = "chat-empty";
    empty.textContent = "아직 대화가 없어요. Clean/Merge 후 질문을 보내거나, 'AI 먼저 말걸기'를 켜보세요.";
    chatMessagesEl.appendChild(empty);
    return;
  }

  for (const message of chatMessages) {
    const wrapper = document.createElement("div");
    wrapper.className = "chat-message " + (message.role === "user" ? "user" : "assistant");

    const head = document.createElement("div");
    head.className = "chat-head";

    const role = document.createElement("span");
    role.textContent = message.role === "user" ? "You" : "AI";

    const time = document.createElement("span");
    time.textContent = formatTime(message.ts);

    const body = document.createElement("div");
    body.textContent = message.content;

    head.appendChild(role);
    head.appendChild(time);
    wrapper.appendChild(head);
    wrapper.appendChild(body);
    chatMessagesEl.appendChild(wrapper);
  }

  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

function refreshChatControls() {
  const hasContext = Boolean(latestStoryContext && latestStoryContext.text);
  const canChat = authState.authenticated && hasContext && Boolean(selectedModel);

  if (!authState.authenticated) {
    chatInput.placeholder = "Google 로그인 후 채팅을 시작할 수 있어요.";
  } else if (!hasContext) {
    chatInput.placeholder = "먼저 Clean/Merge를 실행해 문맥을 준비해 주세요.";
  } else {
    chatInput.placeholder = "소설 내용에 대해 물어보세요. Shift+Enter로 줄바꿈.";
  }

  chatInput.disabled = !canChat || isChatBusy;
  chatSendBtn.disabled = !canChat || isChatBusy || !chatInput.value.trim();
  clearChatBtn.disabled = !canChat || isChatBusy || chatMessages.length === 0;
  modelSelect.disabled = isChatBusy || modelSelect.options.length === 0;
}

function updateContextBanner(message, tone) {
  contextBanner.textContent = message;
  contextBanner.setAttribute("data-tone", tone || "info");
}

async function fetchJson(url, options) {
  const response = await fetch(url, Object.assign({
    credentials: "include"
  }, options || {}));

  let data = null;
  try {
    data = await response.json();
  } catch (_error) {
    data = null;
  }

  if (!response.ok || (data && data.ok === false)) {
    const error = new Error((data && data.error) || ("Request failed (" + response.status + ")"));
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data || {};
}

function readBoolFromStorage(key, fallback) {
  const value = localStorage.getItem(key);
  if (value === "1") {
    return true;
  }
  if (value === "0") {
    return false;
  }
  return fallback;
}

function getStoredGoogleClientId() {
  return (localStorage.getItem(GOOGLE_CLIENT_ID_STORAGE_KEY) || "").trim();
}

function getEffectiveGoogleClientId(serverGoogleClientId) {
  const serverValue = typeof serverGoogleClientId === "string" ? serverGoogleClientId.trim() : "";
  if (serverValue) {
    return serverValue;
  }

  return getStoredGoogleClientId();
}

function formatTime(ts) {
  const date = new Date(typeof ts === "number" ? ts : Date.now());
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return hours + ":" + minutes;
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Failed to read the file."));
    reader.readAsText(file, "utf-8");
  });
}

function parseAiStudioIfPossible(rawText) {
  try {
    const parsed = JSON.parse(rawText);
    const chunks = parsed && parsed.chunkedPrompt && parsed.chunkedPrompt.chunks;
    if (Array.isArray(chunks)) {
      return { isAiStudio: true, chunks };
    }
    return { isAiStudio: false };
  } catch (_error) {
    return { isAiStudio: false, parseError: true };
  }
}

function toCleanedConversationText(rawText) {
  const parsed = parseAiStudioIfPossible(rawText);

  if (parsed.parseError) {
    throw new Error("Unsupported format: the file is not valid JSON.");
  }

  if (!parsed.isAiStudio) {
    throw new Error("Missing required path: chunkedPrompt.chunks");
  }

  const messages = extractMessages(parsed.chunks);
  if (messages.length === 0) {
    throw new Error("No valid user/model messages found in chunkedPrompt.chunks.");
  }

  return {
    text: messagesToText(messages),
    count: messages.length
  };
}

function toMergeSegment(rawText, fileLabel) {
  const parsed = parseAiStudioIfPossible(rawText);

  if (parsed.isAiStudio) {
    const messages = extractMessages(parsed.chunks);
    if (messages.length === 0) {
      throw new Error("The " + fileLabel + " file is AI Studio JSON but has no valid user/model messages.");
    }

    return {
      text: messagesToText(messages),
      type: "AI-clean"
    };
  }

  return {
    text: rawText,
    type: "plain text"
  };
}

function extractMessages(chunks) {
  const result = [];

  for (const chunk of chunks) {
    const role = typeof chunk.role === "string" ? chunk.role.toLowerCase() : "";
    if (role !== "user" && role !== "model") {
      continue;
    }

    const content = getChunkContent(chunk);
    if (!content) {
      continue;
    }

    result.push({
      tag: role === "user" ? "[User]" : "[AI]",
      content
    });
  }

  return result;
}

function getChunkContent(chunk) {
  if (typeof chunk.text === "string" && chunk.text.trim()) {
    return chunk.text.trim();
  }

  if (Array.isArray(chunk.parts)) {
    const joined = chunk.parts.map((part) => {
      return part && typeof part.text === "string" ? part.text : "";
    }).join("");

    if (joined.trim()) {
      return joined.trim();
    }
  }

  return "";
}

function messagesToText(messages) {
  return messages.map((message) => {
    return message.tag + "\n" + message.content;
  }).join("\n\n");
}

function joinSeamless(firstText, secondText) {
  const left = firstText.replace(/(?:\r?\n)+$/g, "");
  const right = secondText.replace(/^(?:\r?\n)+/g, "");
  return left + "\n\n" + right;
}

function makeOutputFileName(sourceName, suffix) {
  const dotIndex = sourceName.lastIndexOf(".");
  const baseName = dotIndex > 0 ? sourceName.slice(0, dotIndex) : sourceName;
  return baseName + suffix;
}

function downloadText(content, fileName) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function showStatus(targetEl, message, tone) {
  if (!message) {
    targetEl.textContent = "";
    targetEl.removeAttribute("data-tone");
    return;
  }

  targetEl.textContent = message;
  targetEl.setAttribute("data-tone", tone);
}

initializePage();
