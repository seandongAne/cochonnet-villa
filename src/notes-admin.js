// Browser logic for the 猪猪小记 writing studio (/admin/notes/).
// Auth model matches /admin/: a GitHub fine-grained token stored in the same
// localStorage key, so signing in once covers both editors. Publishing is a
// direct commit to content/notes.json via the GitHub Contents API; GitHub
// Pages redeploys the static site automatically.

import {
  applyNoteEdit,
  canonicalizeNoteMarkdown,
  canonicalizeNotesMarkdown,
  findNoteMarkdownIssues,
  mergeRemoteNotes,
  normalizeNotes,
  renderNoteBody,
  formatNoteDate
} from "./render-notes.js";
import {
  buildDraftPayload,
  parseDraftPayload,
  draftHasContent,
  chooseDraftSource,
  draftContentKey
} from "./notes-draft.js";

const OWNER = "seandongAne";
const REPO = "cochonnet-villa";
const BRANCH = "main";
const CONTENT_PATH = "content/notes.json";
const LIVE_NOTES_URL = "https://www.cochonnetvilla.ca/notes/";
const TOKEN_STORAGE_KEY = "cochonnetvilla_github_token";
const DRAFT_STORAGE_KEY = "cochonnetvilla_notes_draft";

// Cloud draft backup: committed to a side branch so it never publishes, never
// triggers the Pages deploy or the art workflow, and keeps main history clean.
const DRAFT_BRANCH = "notes-drafts";
const DRAFT_PATH = "content/notes-draft.json";
const CLOUD_DRAFT_IDLE_MS = 5 * 60 * 1000;

const apiBase = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${CONTENT_PATH}`;
const draftApiBase = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${DRAFT_PATH}`;
const refsApiBase = `https://api.github.com/repos/${OWNER}/${REPO}/git`;

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
    markdownStatus: document.querySelector("#markdown-status"),
    commitMessageInput: document.querySelector("#commit-message-input"),
    publishButton: document.querySelector("#publish-button"),
    publishButtonTop: document.querySelector("#publish-button-top"),
    publishStatus: document.querySelector("#publish-status"),
    publishStatusTop: document.querySelector("#publish-status-top"),
    publishSuccessDialog: document.querySelector("#publish-success-dialog"),
    backupDraftButton: document.querySelector("#backup-draft-button"),
    draftStatus: document.querySelector("#draft-status"),
    previewTitle: document.querySelector("#preview-title"),
    previewMeta: document.querySelector("#preview-meta"),
    previewBody: document.querySelector("#preview-body")
  };

  const state = {
    token: "",
    sha: "",
    notes: [],
    dirty: false,
    publishing: false,
    editingSlug: null,
    // True once we know the remote state (a successful read, or a definite
    // 404). Publishing without it could clobber notes we never saw.
    remoteKnown: false,
    // Cloud draft bookkeeping.
    cloudDraftSha: "",
    cloudTimer: null,
    cloudDirty: false,
    lastCloudKey: ""
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

  // The publish status lives in the 发布 card and is mirrored (visually only —
  // the aria-live announcement stays single) into the editor's sticky topbar,
  // so feedback is visible no matter which publish button was clicked.
  function setPublishStatus(message, tone = "default") {
    setStatus(elements.publishStatus, message, tone);
    setStatus(elements.publishStatusTop, message, tone);
  }

  function showPublishSuccess() {
    const dialog = elements.publishSuccessDialog;

    if (dialog && typeof dialog.showModal === "function" && !dialog.open) {
      dialog.showModal();
    }
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

  function currentForm() {
    return {
      title: elements.titleInput.value,
      date: elements.dateInput.value,
      mood: elements.moodInput.value,
      body: elements.bodyInput.value
    };
  }

  function currentDraftPayload() {
    return buildDraftPayload({
      editingSlug: state.editingSlug,
      form: currentForm(),
      stagedDirty: state.dirty,
      stagedNotes: state.notes,
      savedAt: Date.now()
    });
  }

  // Tier 1: every change persists the full editor state (form + staged list)
  // to this browser, and arms the tier-2 idle timer.
  function saveDraft() {
    try {
      window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(currentDraftPayload()));
    } catch {
      // Storage full/blocked — drafts are best-effort only.
    }

    state.cloudDirty = true;
    scheduleCloudBackup();
  }

  function clearDraft() {
    try {
      window.localStorage.removeItem(DRAFT_STORAGE_KEY);
    } catch {
      // Ignore storage failures.
    }

    if (state.cloudTimer) {
      clearTimeout(state.cloudTimer);
      state.cloudTimer = null;
    }

    state.cloudDirty = false;
    // Best-effort: blank the cloud copy so another device won't resurrect
    // content that has already been published.
    clearCloudDraft().catch(() => {});
  }

  function readLocalDraft() {
    try {
      return parseDraftPayload(window.localStorage.getItem(DRAFT_STORAGE_KEY));
    } catch {
      return null;
    }
  }

  // ---- Tier 2: cloud draft on the notes-drafts branch ----

  function githubHeaders() {
    const headers = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };

    if (state.token) {
      headers.Authorization = `Bearer ${state.token}`;
    }

    return headers;
  }

  function scheduleCloudBackup() {
    if (state.cloudTimer) {
      clearTimeout(state.cloudTimer);
    }

    if (!state.token) {
      return;
    }

    state.cloudTimer = setTimeout(() => {
      state.cloudTimer = null;
      backupDraftToCloud().catch(() => {});
    }, CLOUD_DRAFT_IDLE_MS);
  }

  async function fetchCloudDraft() {
    const response = await fetch(`${draftApiBase}?ref=${DRAFT_BRANCH}`, {
      headers: githubHeaders()
    });

    if (response.status === 404) {
      state.cloudDraftSha = "";
      return null;
    }

    if (!response.ok) {
      throw new Error(`GitHub 返回 ${response.status}。`);
    }

    const payload = await response.json();
    state.cloudDraftSha = payload.sha;

    const draft = parseDraftPayload(fromBase64(payload.content.replace(/\n/g, "")));
    state.lastCloudKey = draftContentKey(draft);
    return draft;
  }

  async function ensureDraftBranch() {
    const mainRef = await fetch(`${refsApiBase}/ref/heads/${BRANCH}`, {
      headers: githubHeaders()
    });

    if (!mainRef.ok) {
      throw new Error(`读取 ${BRANCH} 分支失败（${mainRef.status}）。`);
    }

    const { object } = await mainRef.json();
    const created = await fetch(`${refsApiBase}/refs`, {
      method: "POST",
      headers: { ...githubHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ ref: `refs/heads/${DRAFT_BRANCH}`, sha: object.sha })
    });

    // 422 = branch already exists (created concurrently) — that's fine.
    if (!created.ok && created.status !== 422) {
      throw new Error(`创建草稿分支失败（${created.status}）。`);
    }
  }

  async function putCloudDraft(draftPayload, { keepalive = false } = {}) {
    const body = {
      message: "备份小记草稿",
      content: toBase64(`${JSON.stringify(draftPayload, null, 2)}\n`),
      branch: DRAFT_BRANCH
    };

    if (state.cloudDraftSha) {
      body.sha = state.cloudDraftSha;
    }

    const attempt = () =>
      fetch(draftApiBase, {
        method: "PUT",
        headers: { ...githubHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
        keepalive
      });

    let response = await attempt();

    if (response.status === 404) {
      // Branch doesn't exist yet — create it from main and retry once.
      await ensureDraftBranch();
      response = await attempt();
    } else if (response.status === 409 || response.status === 422) {
      // Stale sha (another device backed up) — refresh and retry once.
      await fetchCloudDraft().catch(() => {});
      if (state.cloudDraftSha) {
        body.sha = state.cloudDraftSha;
      } else {
        delete body.sha;
      }
      response = await attempt();
    }

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}));
      throw new Error(errorPayload?.message || `GitHub 返回 ${response.status}。`);
    }

    const payload = await response.json();
    state.cloudDraftSha = payload.content?.sha || state.cloudDraftSha;
    state.lastCloudKey = draftContentKey(draftPayload);
  }

  async function backupDraftToCloud({ manual = false, keepalive = false } = {}) {
    if (!state.token) {
      if (manual) {
        setStatus(elements.draftStatus, "云端备份需要先保存 GitHub token（本地草稿不受影响）。", "warning");
      }
      return;
    }

    const draftPayload = currentDraftPayload();

    if (!draftHasContent(draftPayload) && !manual) {
      return;
    }

    if (draftContentKey(draftPayload) === state.lastCloudKey) {
      state.cloudDirty = false;
      if (manual) {
        setStatus(elements.draftStatus, "云端草稿已是最新，无需重复备份。", "success");
      }
      return;
    }

    if (manual) {
      setStatus(elements.draftStatus, "正在备份草稿到 GitHub……");
    }

    try {
      await putCloudDraft(draftPayload, { keepalive });
      state.cloudDirty = false;
      const time = new Date(draftPayload.savedAt).toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit"
      });
      setStatus(elements.draftStatus, `草稿已备份到 GitHub 草稿分支（${time}）。`, "success");
    } catch (error) {
      setStatus(
        elements.draftStatus,
        `云端备份失败：${error.message} 本地草稿仍然有效，稍后会自动重试。`,
        "warning"
      );
      scheduleCloudBackup();
    }
  }

  async function clearCloudDraft() {
    if (!state.token) {
      return;
    }

    await fetchCloudDraft().catch(() => {});

    if (!state.cloudDraftSha) {
      return;
    }

    await putCloudDraft(buildDraftPayload({ savedAt: Date.now() }));
  }

  function updatePreview() {
    const title = elements.titleInput.value.trim();
    const date = elements.dateInput.value.trim();
    const mood = elements.moodInput.value.trim();

    elements.previewTitle.textContent = title || "（还没有标题）";
    elements.previewMeta.textContent = [formatNoteDate(date), mood].filter(Boolean).join(" · ");
    elements.previewBody.innerHTML = renderNoteBody(elements.bodyInput.value);

    const issues = findNoteMarkdownIssues(elements.bodyInput.value);

    if (issues.length) {
      setStatus(
        elements.markdownStatus,
        `${issues.map((issue) => issue.message).join(" ")} 收进列表时会自动补齐。`,
        "warning"
      );
    } else {
      setStatus(elements.markdownStatus, "Markdown 格式正常；预览与正式页面使用同一套规则。", "success");
    }
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
    setPublishStatus("列表里有还没发布的修改，记得点「发布到 GitHub」。", "warning");
    saveDraft();
  }

  // True when the open form holds a publishable note that differs from its
  // staged twin — i.e. the author wrote/edited something but hasn't clicked
  // 收进列表 yet, so publishing now would not include it.
  function formIsUnstaged() {
    const title = elements.titleInput.value.trim();
    const body = canonicalizeNoteMarkdown(elements.bodyInput.value);

    if (!title || !body.trim()) {
      return false;
    }

    const staged = state.notes.find((note) => note.slug === state.editingSlug);

    if (!staged) {
      return true;
    }

    const date = elements.dateInput.value.trim() || todayString();
    const mood = elements.moodInput.value.trim();

    return (
      staged.title !== title ||
      staged.body !== body ||
      staged.date !== date ||
      (staged.mood || "") !== mood
    );
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
    const markdownIssues = findNoteMarkdownIssues(elements.bodyInput.value);
    const body = canonicalizeNoteMarkdown(elements.bodyInput.value);
    const date = elements.dateInput.value.trim() || todayString();
    const mood = elements.moodInput.value.trim();

    if (!title || !body) {
      setStatus(elements.editorStatus, "标题和正文都写一点再收进列表哦。", "warning");
      return;
    }

    if (markdownIssues.length) {
      elements.bodyInput.value = body;
      updatePreview();
    }

    // applyNoteEdit also handles a restored draft whose editingSlug is not in
    // the list (never published): the save inserts instead of silently
    // mapping over nothing.
    const result = applyNoteEdit(state.notes, state.editingSlug, { title, date, mood, body });
    state.notes = result.notes;
    state.editingSlug = result.slug;
    markDirty();
    renderList();
    setStatus(
      elements.editorStatus,
      `《${title}》已收进列表。${
        markdownIssues.length ? `已自动规范 ${markdownIssues.length} 处标题格式。` : ""
      }点「发布到 GitHub」让它上线。`,
      "success"
    );
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

  async function fetchNotes({ discardLocal = false } = {}) {
    setStatus(elements.listStatus, "正在从 GitHub 读取小记……");

    let remote;

    try {
      remote = await fetchRemote();
    } catch (error) {
      throw new Error(`读取失败：${error.message} 你的草稿不受影响；发布前会再次尝试同步，避免覆盖网站上的内容。`);
    }

    state.sha = remote.sha;
    state.remoteKnown = true;

    if (state.dirty && !discardLocal) {
      // The author staged edits while this request was in flight — merge the
      // remote list underneath instead of clobbering them, and stay dirty.
      state.notes = mergeRemoteNotes(state.notes, remote.notes);
      renderList();
      saveDraft();
      setStatus(
        elements.listStatus,
        `已读取远端小记，并保留了你还没发布的修改（共 ${state.notes.length} 篇）。`,
        "warning"
      );
      return;
    }

    state.notes = remote.notes;
    state.dirty = false;
    renderList();
    saveDraft();

    if (!remote.exists) {
      setStatus(elements.listStatus, "仓库里还没有 notes.json，第一次发布时会自动创建。", "warning");
      return;
    }

    setStatus(elements.listStatus, `已读取 ${state.notes.length} 篇小记。`, "success");
  }

  async function publish() {
    if (state.publishing) {
      return;
    }

    if (!state.token) {
      setPublishStatus("先在「登录」卡片里保存一个 GitHub token 才能发布。", "warning");
      return;
    }

    if (!state.dirty) {
      if (formIsUnstaged()) {
        setPublishStatus("正文还没收进列表：先点「收进列表」，再点「发布到 GitHub」。", "warning");
      } else {
        setPublishStatus("没有需要发布的修改，网站已经是最新的。", "success");
      }
      return;
    }

    // The staged list is publishable, but the open form still holds edits
    // that this publish would NOT include — make that explicit instead of
    // letting the success dialog imply everything went live.
    if (
      formIsUnstaged() &&
      !window.confirm("当前正文还没收进列表，这次发布不会包含它。仍然只发布列表里已收进的修改吗？")
    ) {
      setPublishStatus("先点「收进列表」再发布，正文就会一起上线。", "warning");
      return;
    }

    const publishButtonLabel = elements.publishButton?.textContent || "发布到 GitHub";
    const publishButtonTopLabel = elements.publishButtonTop?.textContent || "发布到 GitHub";
    state.publishing = true;

    if (elements.publishButton) {
      elements.publishButton.disabled = true;
      elements.publishButton.textContent = "正在发布……";
      elements.publishButton.setAttribute("aria-busy", "true");
    }

    if (elements.publishButtonTop) {
      elements.publishButtonTop.disabled = true;
      elements.publishButtonTop.textContent = "正在发布……";
      elements.publishButtonTop.setAttribute("aria-busy", "true");
    }

    try {
      if (!state.remoteKnown) {
        // The initial read failed, so the local list may be missing notes that
        // already live on GitHub. Sync first; local edits win on slug clashes.
        setPublishStatus("先和 GitHub 同步一次，避免覆盖已发布的小记……");

        let remote;

        try {
          remote = await fetchRemote();
        } catch {
          setPublishStatus(
            "现在连不上 GitHub，为了不覆盖网站上已有的小记，这次没有发布。稍后再试试。",
            "error"
          );
          return;
        }

        state.notes = mergeRemoteNotes(state.notes, remote.notes);
        state.sha = remote.sha;
        state.remoteKnown = true;
        renderList();
      }

      // A restored draft can contain a staged list created by an older editor.
      // Canonicalize the whole outgoing collection, not only the open form.
      state.notes = canonicalizeNotesMarkdown(state.notes);
      setPublishStatus("正在提交到 GitHub……");

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

      if (formIsUnstaged()) {
        // The open form's uncollected edits were not part of this publish —
        // re-save them as a draft so closing the page can't lose them.
        saveDraft();
      }

      setPublishStatus(
        `已发布！GitHub Pages 部署大约需要 1–2 分钟，之后就能在 ${LIVE_NOTES_URL} 看到。`,
        "success"
      );
      showPublishSuccess();
    } finally {
      state.publishing = false;

      if (elements.publishButton) {
        elements.publishButton.disabled = false;
        elements.publishButton.textContent = publishButtonLabel;
        elements.publishButton.removeAttribute("aria-busy");
      }

      if (elements.publishButtonTop) {
        elements.publishButtonTop.disabled = false;
        elements.publishButtonTop.textContent = publishButtonTopLabel;
        elements.publishButtonTop.removeAttribute("aria-busy");
      }
    }
  }

  async function restoreDraft() {
    const local = readLocalDraft();
    let cloud = null;

    try {
      cloud = await fetchCloudDraft();
    } catch {
      // Offline or API hiccup — fall back to the local tier.
    }

    const source = chooseDraftSource(local, cloud);

    if (!source) {
      fillForm(null);
      return;
    }

    const draft = source === "cloud" ? cloud : local;

    state.editingSlug = draft.editingSlug;
    elements.titleInput.value = draft.form.title;
    elements.dateInput.value = draft.form.date || todayString();
    elements.moodInput.value = draft.form.mood;
    elements.bodyInput.value = draft.form.body;
    updatePreview();

    if (draft.stagedDirty && draft.stagedNotes.length) {
      // The staged-but-unpublished list comes back too; the pending
      // fetchNotes() will merge the remote list underneath it.
      state.notes = draft.stagedNotes;
      state.dirty = true;
      renderList();
      setPublishStatus("恢复了还没发布的列表修改，记得点「发布到 GitHub」。", "warning");
    }

    setStatus(
      elements.editorStatus,
      source === "cloud"
        ? "已从 GitHub 云端草稿恢复（比本浏览器的记录更新）。"
        : "已恢复本地草稿（每次输入都会自动保存）。",
      "success"
    );
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
      // The author just confirmed discarding staged edits, so this reload
      // replaces the list outright instead of merging.
      await fetchNotes({ discardLocal: true });
    } catch (error) {
      console.error(error);
      setStatus(elements.listStatus, error.message, "error");
    }
  });
  async function handlePublishClick() {
    try {
      await publish();
    } catch (error) {
      console.error(error);
      setPublishStatus(error.message, "error");
    }
  }

  elements.publishButton?.addEventListener("click", handlePublishClick);
  elements.publishButtonTop?.addEventListener("click", handlePublishClick);

  for (const field of [elements.titleInput, elements.dateInput, elements.moodInput, elements.bodyInput]) {
    field?.addEventListener("input", () => {
      updatePreview();
      saveDraft();
    });
  }

  elements.backupDraftButton?.addEventListener("click", () => {
    backupDraftToCloud({ manual: true }).catch((error) => {
      setStatus(elements.draftStatus, `云端备份失败：${error.message}`, "warning");
    });
  });

  document.addEventListener("visibilitychange", () => {
    // Leaving the page (tab switch, close) flushes a pending backup early.
    if (document.visibilityState === "hidden" && state.cloudDirty && state.token) {
      backupDraftToCloud({ keepalive: true }).catch(() => {});
    }
  });

  window.addEventListener("beforeunload", (event) => {
    if (state.dirty) {
      event.preventDefault();
      event.returnValue = "";
    }
  });

  loadToken();
  (async () => {
    await restoreDraft();

    try {
      await fetchNotes();
    } catch (error) {
      console.error(error);
      setStatus(elements.listStatus, error.message, "error");
    }
  })();
}
