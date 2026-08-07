// Browser logic for the 猪猪小记 writing studio (/admin/notes/).
// Auth model matches /admin/: a GitHub fine-grained token stored in the same
// localStorage key, so signing in once covers both editors. Publishing is a
// direct commit to content/notes.json via the GitHub Contents API; GitHub
// Pages redeploys the static site automatically.

import {
  normalizeNotes,
  renderNoteBody,
  formatNoteDate,
  deriveNoteSlug
} from "./render-notes.js";

const OWNER = "seandongAne";
const REPO = "cochonnet-villa";
const BRANCH = "main";
const CONTENT_PATH = "content/notes.json";
const LIVE_NOTES_URL = "https://www.cochonnetvilla.ca/notes/";
const TOKEN_STORAGE_KEY = "cochonnetvilla_github_token";
const DRAFT_STORAGE_KEY = "cochonnetvilla_notes_draft";

const apiBase = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${CONTENT_PATH}`;

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

function todayString() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function initNotesAdmin() {
  const elements = {
    tokenInput: document.querySelector("#token-input"),
    saveTokenButton: document.querySelector("#save-token-button"),
    clearTokenButton: document.querySelector("#clear-token-button"),
    authStatus: document.querySelector("#auth-status"),
    notesList: document.querySelector("#notes-list"),
    listStatus: document.querySelector("#list-status"),
    newNoteButton: document.querySelector("#new-note-button"),
    reloadButton: document.querySelector("#reload-button"),
    titleInput: document.querySelector("#title-input"),
    dateInput: document.querySelector("#date-input"),
    moodInput: document.querySelector("#mood-input"),
    bodyInput: document.querySelector("#body-input"),
    saveNoteButton: document.querySelector("#save-note-button"),
    deleteNoteButton: document.querySelector("#delete-note-button"),
    editorStatus: document.querySelector("#editor-status"),
    commitMessageInput: document.querySelector("#commit-message-input"),
    publishButton: document.querySelector("#publish-button"),
    publishStatus: document.querySelector("#publish-status"),
    previewTitle: document.querySelector("#preview-title"),
    previewMeta: document.querySelector("#preview-meta"),
    previewBody: document.querySelector("#preview-body")
  };

  const state = {
    token: "",
    sha: "",
    notes: [],
    dirty: false,
    editingSlug: null,
    // True once we know the remote state (a successful read, or a definite
    // 404). Publishing without it could clobber notes we never saw.
    remoteKnown: false
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

  function loadToken() {
    const token = window.localStorage.getItem(TOKEN_STORAGE_KEY) || "";
    state.token = token;
    elements.tokenInput.value = token;

    if (token) {
      setStatus(elements.authStatus, "本浏览器已保存 GitHub token，可以直接发布。", "success");
    } else {
      setStatus(elements.authStatus, "还没有保存 token。可以先读小记和写草稿，发布时需要 token。");
    }
  }

  function saveToken() {
    const token = elements.tokenInput.value.trim();

    if (!token) {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
      state.token = "";
      setStatus(elements.authStatus, "没有保存 token。想发布的时候再加上就好。", "warning");
      return;
    }

    window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    state.token = token;
    setStatus(elements.authStatus, "GitHub token 已保存在本浏览器，发布功能已开启。", "success");
  }

  function clearToken() {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    state.token = "";
    elements.tokenInput.value = "";
    setStatus(elements.authStatus, "已清除本浏览器保存的 token。", "warning");
  }

  function saveDraft() {
    try {
      window.localStorage.setItem(
        DRAFT_STORAGE_KEY,
        JSON.stringify({
          editingSlug: state.editingSlug,
          title: elements.titleInput.value,
          date: elements.dateInput.value,
          mood: elements.moodInput.value,
          body: elements.bodyInput.value
        })
      );
    } catch {
      // Storage full/blocked — drafts are best-effort only.
    }
  }

  function clearDraft() {
    try {
      window.localStorage.removeItem(DRAFT_STORAGE_KEY);
    } catch {
      // Ignore storage failures.
    }
  }

  function readDraft() {
    try {
      const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function updatePreview() {
    const title = elements.titleInput.value.trim();
    const date = elements.dateInput.value.trim();
    const mood = elements.moodInput.value.trim();

    elements.previewTitle.textContent = title || "（还没有标题）";
    elements.previewMeta.textContent = [formatNoteDate(date), mood].filter(Boolean).join(" · ");
    elements.previewBody.innerHTML = renderNoteBody(elements.bodyInput.value);
  }

  function fillForm(note) {
    elements.titleInput.value = note?.title || "";
    elements.dateInput.value = note?.date || todayString();
    elements.moodInput.value = note?.mood || "";
    elements.bodyInput.value = note?.body || "";
    updatePreview();
  }

  function markDirty() {
    state.dirty = true;
    setStatus(elements.publishStatus, "列表里有还没发布的修改，记得点「发布到 GitHub」。", "warning");
  }

  function renderList() {
    elements.notesList.innerHTML = "";

    if (!state.notes.length) {
      const empty = document.createElement("p");
      empty.className = "list-empty";
      empty.textContent = "还没有小记，点「写新的一篇」开始吧。";
      elements.notesList.append(empty);
      return;
    }

    for (const note of state.notes) {
      const item = document.createElement("div");
      item.className = "note-item";

      if (note.slug === state.editingSlug) {
        item.classList.add("is-editing");
      }

      const meta = document.createElement("div");
      meta.className = "note-item-meta";
      meta.textContent = [formatNoteDate(note.date) || note.date, note.mood].filter(Boolean).join(" · ");

      const title = document.createElement("strong");
      title.textContent = note.title;

      const actions = document.createElement("div");
      actions.className = "note-item-actions";

      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "button button-muted";
      editButton.textContent = "编辑";
      editButton.addEventListener("click", () => {
        state.editingSlug = note.slug;
        fillForm(note);
        saveDraft();
        renderList();
        setStatus(elements.editorStatus, `正在编辑《${note.title}》。`);
      });

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "button button-muted";
      deleteButton.textContent = "删除";
      deleteButton.addEventListener("click", () => {
        if (!window.confirm(`确定要删除《${note.title}》吗？发布后才会真正从网站消失。`)) {
          return;
        }

        state.notes = state.notes.filter((entry) => entry.slug !== note.slug);

        if (state.editingSlug === note.slug) {
          state.editingSlug = null;
          fillForm(null);
          saveDraft();
        }

        markDirty();
        renderList();
        setStatus(elements.listStatus, `已从列表移除《${note.title}》，发布后生效。`, "warning");
      });

      actions.append(editButton, deleteButton);
      item.append(meta, title, actions);
      elements.notesList.append(item);
    }
  }

  function saveCurrent() {
    const title = elements.titleInput.value.trim();
    const body = elements.bodyInput.value.replace(/\r\n?/g, "\n").trim();
    const date = elements.dateInput.value.trim() || todayString();
    const mood = elements.moodInput.value.trim();

    if (!title || !body) {
      setStatus(elements.editorStatus, "标题和正文都写一点再收进列表哦。", "warning");
      return;
    }

    if (state.editingSlug) {
      state.notes = state.notes.map((note) =>
        note.slug === state.editingSlug ? { ...note, title, date, mood, body } : note
      );
    } else {
      const taken = new Set(state.notes.map((note) => note.slug));
      const slug = deriveNoteSlug({ date }, taken);
      state.notes.unshift({ slug, title, date, mood, body });
      state.editingSlug = slug;
    }

    state.notes = normalizeNotes({ notes: state.notes });
    markDirty();
    renderList();
    saveDraft();
    setStatus(elements.editorStatus, `《${title}》已收进列表。点「发布到 GitHub」让它上线。`, "success");
  }

  function startNewNote() {
    state.editingSlug = null;
    fillForm(null);
    saveDraft();
    renderList();
    setStatus(elements.editorStatus, "新的一篇：写好后点「收进列表」。");
    elements.titleInput.focus();
  }

  async function fetchRemote() {
    const headers = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };

    if (state.token) {
      headers.Authorization = `Bearer ${state.token}`;
    }

    const response = await fetch(`${apiBase}?ref=${BRANCH}`, { headers });

    if (response.status === 404) {
      return { exists: false, sha: "", notes: [] };
    }

    if (!response.ok) {
      throw new Error(`GitHub 返回 ${response.status}。`);
    }

    const payload = await response.json();

    return {
      exists: true,
      sha: payload.sha,
      notes: normalizeNotes(JSON.parse(fromBase64(payload.content.replace(/\n/g, ""))))
    };
  }

  async function fetchNotes() {
    setStatus(elements.listStatus, "正在从 GitHub 读取小记……");

    let remote;

    try {
      remote = await fetchRemote();
    } catch (error) {
      throw new Error(`读取失败：${error.message} 你的草稿不受影响；发布前会再次尝试同步，避免覆盖网站上的内容。`);
    }

    state.sha = remote.sha;
    state.notes = remote.notes;
    state.dirty = false;
    state.remoteKnown = true;
    renderList();

    if (!remote.exists) {
      setStatus(elements.listStatus, "仓库里还没有 notes.json，第一次发布时会自动创建。", "warning");
      return;
    }

    setStatus(elements.listStatus, `已读取 ${state.notes.length} 篇小记。`, "success");
  }

  async function publish() {
    if (!state.token) {
      setStatus(elements.publishStatus, "先在上面保存一个 GitHub token 才能发布。", "warning");
      return;
    }

    if (!state.remoteKnown) {
      // The initial read failed, so the local list may be missing notes that
      // already live on GitHub. Sync first; local edits win on slug clashes.
      setStatus(elements.publishStatus, "先和 GitHub 同步一次，避免覆盖已发布的小记……");

      let remote;

      try {
        remote = await fetchRemote();
      } catch {
        setStatus(
          elements.publishStatus,
          "现在连不上 GitHub，为了不覆盖网站上已有的小记，这次没有发布。稍后再试试。",
          "error"
        );
        return;
      }

      const localSlugs = new Set(state.notes.map((note) => note.slug));
      state.notes = normalizeNotes({
        notes: [...state.notes, ...remote.notes.filter((note) => !localSlugs.has(note.slug))]
      });
      state.sha = remote.sha;
      state.remoteKnown = true;
      renderList();
    }

    setStatus(elements.publishStatus, "正在提交到 GitHub……");

    const body = {
      message: elements.commitMessageInput.value.trim() || "更新猪猪小记",
      content: toBase64(`${JSON.stringify({ notes: state.notes }, null, 2)}\n`),
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
      const detail = errorPayload?.message || `GitHub 返回 ${response.status}。`;

      if (response.status === 409 || response.status === 422) {
        throw new Error(`${detail} 可能有别处的修改，点「重新读取」后再试。`);
      }

      throw new Error(detail);
    }

    const payload = await response.json();
    state.sha = payload.content?.sha || state.sha;
    state.dirty = false;
    clearDraft();
    setStatus(
      elements.publishStatus,
      `已发布！GitHub Pages 部署大约需要 1–2 分钟，之后就能在 ${LIVE_NOTES_URL} 看到。`,
      "success"
    );
  }

  function restoreDraft() {
    const draft = readDraft();

    if (!draft || (!String(draft.title || "").trim() && !String(draft.body || "").trim())) {
      fillForm(null);
      return;
    }

    state.editingSlug = typeof draft.editingSlug === "string" ? draft.editingSlug : null;
    elements.titleInput.value = draft.title || "";
    elements.dateInput.value = draft.date || todayString();
    elements.moodInput.value = draft.mood || "";
    elements.bodyInput.value = draft.body || "";
    updatePreview();
    setStatus(elements.editorStatus, "已恢复上次没发布的草稿（草稿会自动存在本浏览器）。", "success");
  }

  elements.saveTokenButton?.addEventListener("click", saveToken);
  elements.clearTokenButton?.addEventListener("click", clearToken);
  elements.newNoteButton?.addEventListener("click", startNewNote);
  elements.saveNoteButton?.addEventListener("click", saveCurrent);
  elements.deleteNoteButton?.addEventListener("click", () => {
    startNewNote();
  });
  elements.reloadButton?.addEventListener("click", async () => {
    if (
      state.dirty &&
      !window.confirm("重新读取会丢掉列表里还没发布的修改（正文草稿不受影响），继续吗？")
    ) {
      return;
    }

    try {
      await fetchNotes();
    } catch (error) {
      console.error(error);
      setStatus(elements.listStatus, error.message, "error");
    }
  });
  elements.publishButton?.addEventListener("click", async () => {
    try {
      await publish();
    } catch (error) {
      console.error(error);
      setStatus(elements.publishStatus, error.message, "error");
    }
  });

  for (const field of [elements.titleInput, elements.dateInput, elements.moodInput, elements.bodyInput]) {
    field?.addEventListener("input", () => {
      updatePreview();
      saveDraft();
    });
  }

  window.addEventListener("beforeunload", (event) => {
    if (state.dirty) {
      event.preventDefault();
      event.returnValue = "";
    }
  });

  loadToken();
  restoreDraft();
  fetchNotes().catch((error) => {
    console.error(error);
    setStatus(elements.listStatus, error.message, "error");
  });
}
