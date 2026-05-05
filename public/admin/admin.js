const OWNER = "seandongAne";
const REPO = "cochonnet-villa";
const BRANCH = "main";
const CONTENT_PATH = "content/site.json";
const LIVE_SITE_URL = "https://www.cochonnetvilla.ca";
const STORAGE_KEY = "cochonnetvilla_github_token";

const apiBase = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${CONTENT_PATH}`;

const elements = {
  tokenInput: document.querySelector("#token-input"),
  saveTokenButton: document.querySelector("#save-token-button"),
  clearTokenButton: document.querySelector("#clear-token-button"),
  authStatus: document.querySelector("#auth-status"),
  contentEditor: document.querySelector("#content-editor"),
  commitMessageInput: document.querySelector("#commit-message-input"),
  loadButton: document.querySelector("#load-button"),
  formatButton: document.querySelector("#format-button"),
  downloadButton: document.querySelector("#download-button"),
  saveButton: document.querySelector("#save-button"),
  editorStatus: document.querySelector("#editor-status"),
  summaryGrid: document.querySelector("#summary-grid"),
  validationStatus: document.querySelector("#validation-status")
};

const state = {
  token: "",
  sha: "",
  content: null
};

function setStatus(element, message, tone = "default") {
  if (!element) {
    return;
  }

  element.textContent = message;

  if (tone === "default") {
    element.removeAttribute("data-tone");
    return;
  }

  element.setAttribute("data-tone", tone);
}

function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function fromBase64(base64Text) {
  const binary = atob(base64Text);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function loadToken() {
  const token = window.localStorage.getItem(STORAGE_KEY) || "";
  state.token = token;
  elements.tokenInput.value = token;

  if (token) {
    setStatus(elements.authStatus, "A GitHub token is saved in this browser. Saving back to GitHub is enabled.", "success");
  } else {
    setStatus(elements.authStatus, "No token saved yet. You can still load and preview the current content.");
  }
}

function saveToken() {
  const token = elements.tokenInput.value.trim();

  if (!token) {
    window.localStorage.removeItem(STORAGE_KEY);
    state.token = "";
    setStatus(elements.authStatus, "No token saved. Add one whenever you want publishing access.", "warning");
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, token);
  state.token = token;
  setStatus(elements.authStatus, "GitHub token saved in this browser. Saving back to GitHub is now enabled.", "success");
}

function clearToken() {
  window.localStorage.removeItem(STORAGE_KEY);
  state.token = "";
  elements.tokenInput.value = "";
  setStatus(elements.authStatus, "Saved token cleared from this browser.", "warning");
}

function summarizeContent(site) {
  const porkies = Array.isArray(site?.porkies) ? site.porkies : [];
  const counts = porkies.reduce(
    (summary, porky) => {
      const size = porky?.size === "giant" || porky?.size === "tiny" ? porky.size : "regular";
      summary[size] += 1;
      return summary;
    },
    { regular: 0, giant: 0, tiny: 0 }
  );

  return {
    total: porkies.length,
    regular: counts.regular,
    giant: counts.giant,
    tiny: counts.tiny
  };
}

function renderSummary(site) {
  const summary = summarizeContent(site);

  elements.summaryGrid.innerHTML = `
    <div><strong>Total</strong><span>${summary.total}</span></div>
    <div><strong>Regular</strong><span>${summary.regular}</span></div>
    <div><strong>Giant</strong><span>${summary.giant}</span></div>
    <div><strong>Tiny</strong><span>${summary.tiny}</span></div>
  `;

  if (summary.total === 15 && summary.regular === 13 && summary.giant === 1 && summary.tiny === 1) {
    setStatus(
      elements.validationStatus,
      "The herd story is consistent: 15 total, with 13 regular, 1 giant, and 1 tiny.",
      "success"
    );
    return;
  }

  setStatus(
    elements.validationStatus,
    `Current count is ${summary.total} total, with ${summary.regular} regular, ${summary.giant} giant, and ${summary.tiny} tiny.`,
    "warning"
  );
}

function updateEditorFromContent(site) {
  state.content = site;
  elements.contentEditor.value = `${JSON.stringify(site, null, 2)}\n`;
  renderSummary(site);
}

function parseEditorJson() {
  const parsed = JSON.parse(elements.contentEditor.value);
  renderSummary(parsed);
  return parsed;
}

async function fetchContent() {
  setStatus(elements.editorStatus, "Loading the latest content from GitHub...");

  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
  };

  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }

  const response = await fetch(`${apiBase}?ref=${BRANCH}`, { headers });

  if (!response.ok) {
    throw new Error(`GitHub returned ${response.status} while loading content.`);
  }

  const payload = await response.json();
  state.sha = payload.sha;

  const text = fromBase64(payload.content.replace(/\n/g, ""));
  const site = JSON.parse(text);
  updateEditorFromContent(site);

  setStatus(
    elements.editorStatus,
    "Loaded the latest content from GitHub. You can edit it here and save when ready.",
    "success"
  );
}

async function saveContent() {
  if (!state.token) {
    setStatus(
      elements.editorStatus,
      "Add a GitHub token first. The site can load publicly, but saving requires repository write access.",
      "warning"
    );
    return;
  }

  let parsed;

  try {
    parsed = parseEditorJson();
  } catch (error) {
    setStatus(elements.editorStatus, `JSON error: ${error.message}`, "error");
    return;
  }

  setStatus(elements.editorStatus, "Saving to GitHub and triggering a new Pages deploy...");

  const body = {
    message: elements.commitMessageInput.value.trim() || "Update Cochonnet Villa content",
    content: toBase64(`${JSON.stringify(parsed, null, 2)}\n`),
    branch: BRANCH
  };

  if (state.sha) {
    body.sha = state.sha;
  }

  const response = await fetch(apiBase, {
    method: "PUT",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${state.token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    const detail = errorPayload?.message || `GitHub returned ${response.status}.`;
    throw new Error(detail);
  }

  const payload = await response.json();
  state.sha = payload.content?.sha || state.sha;
  state.content = parsed;

  setStatus(
    elements.editorStatus,
    `Saved to GitHub. A new deploy should publish to ${LIVE_SITE_URL} shortly.`,
    "success"
  );
}

function formatJson() {
  try {
    const parsed = parseEditorJson();
    elements.contentEditor.value = `${JSON.stringify(parsed, null, 2)}\n`;
    setStatus(elements.editorStatus, "Formatted the JSON editor content.", "success");
  } catch (error) {
    setStatus(elements.editorStatus, `JSON error: ${error.message}`, "error");
  }
}

function downloadJson() {
  const blob = new Blob([elements.contentEditor.value], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "cochonnet-villa-site.json";
  link.click();

  URL.revokeObjectURL(url);
}

elements.saveTokenButton?.addEventListener("click", saveToken);
elements.clearTokenButton?.addEventListener("click", clearToken);
elements.loadButton?.addEventListener("click", async () => {
  try {
    await fetchContent();
  } catch (error) {
    console.error(error);
    setStatus(elements.editorStatus, error.message, "error");
  }
});
elements.saveButton?.addEventListener("click", async () => {
  try {
    await saveContent();
  } catch (error) {
    console.error(error);
    setStatus(elements.editorStatus, error.message, "error");
  }
});
elements.formatButton?.addEventListener("click", formatJson);
elements.downloadButton?.addEventListener("click", downloadJson);
elements.contentEditor?.addEventListener("input", () => {
  try {
    renderSummary(JSON.parse(elements.contentEditor.value));
  } catch {
    setStatus(elements.validationStatus, "Current editor text is not valid JSON yet.", "warning");
  }
});

loadToken();
fetchContent().catch((error) => {
  console.error(error);
  setStatus(elements.editorStatus, error.message, "error");
});
