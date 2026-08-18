// Floating editor window for the 猪猪小记 writing studio (/admin/notes/).
// The editor card can pop out into a fixed-position window: drag the topbar to
// move, drag edges/corners to resize, double-click the topbar to maximize.
// Geometry helpers are node-pure (no window/document at import time) so the
// test suite can pin the clamp/resize behavior; only initNotesEditorWindow()
// touches the DOM.

export const EDITOR_WINDOW_STORAGE_KEY = "cochonnetvilla_notes_editor_window";
export const EDITOR_WINDOW_VERSION = 2;
// Root font size the layout is authored at. v1 records were written before
// viewport-scale.css existed, when the root was always 16px — so a record
// without a scale is definitionally a 16px one.
export const EDITOR_WINDOW_BASE_SCALE = 16;
export const EDITOR_WINDOW_MIN = { width: 380, height: 420 };
export const EDITOR_WINDOW_MARGIN = 12;
// Below this viewport width the page collapses to one column; a floating
// window has no room, so the editor auto-docks (and re-floats when widened).
export const EDITOR_WINDOW_MIN_VIEWPORT = 900;

// Keep the window fully inside the viewport (minus a small margin). If the
// viewport is smaller than the minimum size, the viewport wins so the window
// always stays reachable.
export function clampWindowRect(
  rect,
  viewport,
  min = EDITOR_WINDOW_MIN,
  margin = EDITOR_WINDOW_MARGIN
) {
  const availableWidth = Math.max(viewport.width - margin * 2, 0);
  const availableHeight = Math.max(viewport.height - margin * 2, 0);
  const width = Math.min(Math.max(rect.width, min.width), availableWidth);
  const height = Math.min(Math.max(rect.height, min.height), availableHeight);
  const x = Math.min(Math.max(rect.x, margin), Math.max(viewport.width - width - margin, margin));
  const y = Math.min(Math.max(rect.y, margin), Math.max(viewport.height - height - margin, margin));
  return { x, y, width, height };
}

// Apply a pointer delta to one edge/corner ("n", "s", "e", "w", "ne", "nw",
// "se", "sw"). The opposite edge stays anchored — including at the viewport
// limits: a dragged edge stops at the margin instead of letting the generic
// clamp shove the anchored edge across the screen.
export function resizeWindowRect(
  rect,
  edge,
  dx,
  dy,
  viewport,
  min = EDITOR_WINDOW_MIN,
  margin = EDITOR_WINDOW_MARGIN
) {
  let { x, y, width, height } = rect;

  if (edge.includes("e")) {
    const maxWidth = Math.max(viewport.width - margin - x, min.width);
    width = Math.min(Math.max(width + dx, min.width), maxWidth);
  }

  if (edge.includes("w")) {
    const right = x + width;
    x = Math.min(Math.max(x + dx, margin), right - min.width);
    width = right - x;
  }

  if (edge.includes("s")) {
    const maxHeight = Math.max(viewport.height - margin - y, min.height);
    height = Math.min(Math.max(height + dy, min.height), maxHeight);
  }

  if (edge.includes("n")) {
    const bottom = y + height;
    y = Math.min(Math.max(y + dy, margin), bottom - min.height);
    height = bottom - y;
  }

  return clampWindowRect({ x, y, width, height }, viewport, min, margin);
}

// A rect saved on one screen is in that screen's CSS pixels. When the root
// font size changes between sessions (different monitor, OS scaling, browser
// zoom), the window's rem-sized contents grow but a stored px rect would not —
// an 860px window saved on a laptop would hold 1.33x larger text at 5120x1440,
// i.e. a NARROWER writing area. Rescaling keeps the author's chosen size
// relative to the UI; an equal scale is left untouched, so a size deliberately
// dragged on this screen survives verbatim.
export function scaleWindowRect(rect, fromScale, toScale) {
  if (
    !rect ||
    ![fromScale, toScale].every((value) => Number.isFinite(value) && value > 0) ||
    fromScale === toScale
  ) {
    return rect;
  }

  const ratio = toScale / fromScale;

  return {
    x: Math.round(rect.x * ratio),
    y: Math.round(rect.y * ratio),
    width: Math.round(rect.width * ratio),
    height: Math.round(rect.height * ratio)
  };
}

export function maximizedWindowRect(viewport, margin = EDITOR_WINDOW_MARGIN) {
  return {
    x: margin,
    y: margin,
    width: Math.max(viewport.width - margin * 2, 0),
    height: Math.max(viewport.height - margin * 2, 0)
  };
}

// A comfortable writing column, expressed in root-font units so an ultra-wide
// screen (where viewport-scale.css zooms the whole UI) gets a proportionally
// larger window instead of a laptop-sized one stranded in the middle.
export const EDITOR_WINDOW_PREFERRED_REM = 53.75;

// First-time float: a comfortable document-window size, centered.
export function defaultWindowRect(
  viewport,
  min = EDITOR_WINDOW_MIN,
  margin = EDITOR_WINDOW_MARGIN,
  preferredWidth = 860
) {
  const width = Math.max(Math.min(preferredWidth, viewport.width - margin * 2), min.width);
  const height = Math.max(Math.min(Math.round(viewport.height * 0.86), viewport.height - margin * 2), min.height);
  return clampWindowRect(
    {
      x: Math.round((viewport.width - width) / 2),
      y: Math.round((viewport.height - height) / 2),
      width,
      height
    },
    viewport,
    min,
    margin
  );
}

export function parseEditorWindowState(raw) {
  if (!raw) {
    return null;
  }

  let payload;

  try {
    payload = JSON.parse(raw);
  } catch {
    return null;
  }

  // v1 records stay readable: they carry no scale, and 16px is what they were
  // written at.
  if (
    !payload ||
    ![1, EDITOR_WINDOW_VERSION].includes(payload.version) ||
    typeof payload.floating !== "boolean"
  ) {
    return null;
  }

  const rect = payload.rect;
  const rectValid =
    rect &&
    ["x", "y", "width", "height"].every((key) => Number.isFinite(rect[key]));

  return {
    version: EDITOR_WINDOW_VERSION,
    floating: payload.floating,
    maximized: payload.maximized === true,
    rect: rectValid ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
    scale:
      Number.isFinite(payload.scale) && payload.scale > 0
        ? payload.scale
        : EDITOR_WINDOW_BASE_SCALE
  };
}

export function serializeEditorWindowState(state) {
  return JSON.stringify({
    version: EDITOR_WINDOW_VERSION,
    floating: state.floating === true,
    maximized: state.maximized === true,
    rect: state.rect || null,
    scale:
      Number.isFinite(state.scale) && state.scale > 0
        ? state.scale
        : EDITOR_WINDOW_BASE_SCALE
  });
}

export function initNotesEditorWindow() {
  const card = document.querySelector("#editor-card");
  const wrapper = document.querySelector("#editor-window");
  const placeholder = document.querySelector("#editor-placeholder");
  const floatButton = document.querySelector("#editor-float-button");
  const dockButton = document.querySelector("#editor-dock-button");
  const topbar = card?.querySelector(".editor-topbar");

  if (!card || !wrapper || !placeholder || !floatButton || !topbar) {
    return;
  }

  const bodyInput = card.querySelector("#body-input");

  const state = {
    // The author's intent; the applied mode also depends on viewport width.
    floating: false,
    maximized: false,
    rect: null,
    // The root font size `rect` is expressed in. Tracked rather than read live,
    // because persisting a stale rect under the current scale would corrupt the
    // record for every future session.
    scale: null
  };

  function viewport() {
    return { width: window.innerWidth, height: window.innerHeight };
  }

  // The page zooms with the root font size on wide screens; the window follows.
  function rootFontSize() {
    const size = Number.parseFloat(
      window.getComputedStyle(document.documentElement).fontSize
    );

    return Number.isFinite(size) && size > 0 ? size : EDITOR_WINDOW_BASE_SCALE;
  }

  function preferredWidth() {
    return Math.round(EDITOR_WINDOW_PREFERRED_REM * rootFontSize());
  }

  // Bring state.rect into the current root scale. Safe to call at any time:
  // an unchanged scale is a no-op, and a rect-less state just records the
  // scale a future default rect will be built at.
  function syncScale() {
    const scale = rootFontSize();

    if (state.scale === scale) {
      return false;
    }

    if (state.rect && state.scale) {
      state.rect = clampWindowRect(scaleWindowRect(state.rect, state.scale, scale), viewport());
    }

    state.scale = scale;
    return true;
  }

  function readStoredState() {
    try {
      return parseEditorWindowState(window.localStorage.getItem(EDITOR_WINDOW_STORAGE_KEY));
    } catch {
      return null;
    }
  }

  function persist() {
    try {
      window.localStorage.setItem(
        EDITOR_WINDOW_STORAGE_KEY,
        // state.scale, not the live root size: the rect must be tagged with
        // the scale it is actually expressed in.
        serializeEditorWindowState(state)
      );
    } catch {
      // Storage full/blocked — the window still works, it just won't remember.
    }
  }

  function isFloatingApplied() {
    return card.classList.contains("is-floating");
  }

  // Hand the window's spare vertical space to the textarea so a bigger
  // window means a bigger writing area. When the window is too small the
  // textarea keeps its minimum and the card scrolls — nothing overlaps.
  function fitEditorHeight() {
    if (!bodyInput || !isFloatingApplied()) {
      return;
    }

    bodyInput.style.height = "";
    const natural = bodyInput.offsetHeight;
    const slack = card.clientHeight - card.scrollHeight;
    const target = Math.max(natural + slack, 176);
    bodyInput.style.height = `${target}px`;
  }

  // Re-fitting on every pointermove would reset/measure the textarea while
  // merely dragging the window around; only a size change needs it.
  let appliedSize = "";

  function applyRect() {
    const rect = state.maximized ? maximizedWindowRect(viewport()) : state.rect;

    if (!rect) {
      return;
    }

    wrapper.style.left = `${rect.x}px`;
    wrapper.style.top = `${rect.y}px`;
    wrapper.style.width = `${rect.width}px`;
    wrapper.style.height = `${rect.height}px`;

    const sizeKey = `${rect.width}x${rect.height}`;

    if (sizeKey !== appliedSize) {
      appliedSize = sizeKey;
      fitEditorHeight();
    }
  }

  function mountFloating() {
    if (!state.rect) {
      state.rect = defaultWindowRect(viewport(), EDITOR_WINDOW_MIN, EDITOR_WINDOW_MARGIN, preferredWidth());
    }

    state.rect = clampWindowRect(state.rect, viewport());
    wrapper.hidden = false;
    wrapper.prepend(card);
    card.classList.add("is-floating");
    placeholder.hidden = false;
    floatButton.textContent = "收回页面";
    applyRect();
  }

  function mountDocked() {
    card.classList.remove("is-floating");
    appliedSize = "";

    if (bodyInput) {
      bodyInput.style.height = "";
    }

    placeholder.before(card);
    wrapper.hidden = true;
    placeholder.hidden = true;
    floatButton.textContent = "弹出窗口";
  }

  // Reconcile the applied mode with intent + viewport. Narrow viewports force
  // the docked layout but keep the intent, so widening re-floats the window.
  function applyMode() {
    const shouldFloat = state.floating && window.innerWidth >= EDITOR_WINDOW_MIN_VIEWPORT;

    if (shouldFloat) {
      mountFloating();
    } else if (isFloatingApplied()) {
      mountDocked();
    }
  }

  function setFloating(next) {
    state.floating = next;

    if (!next) {
      state.maximized = false;
    }

    applyMode();
    persist();
  }

  floatButton.addEventListener("click", () => {
    setFloating(!state.floating);
  });

  dockButton?.addEventListener("click", () => {
    setFloating(false);
  });

  function isInteractive(target) {
    return Boolean(target instanceof Element && target.closest("button, a, input, textarea, select, label"));
  }

  // ---- Move by dragging the topbar ----

  let drag = null;

  topbar.addEventListener("pointerdown", (event) => {
    if (!isFloatingApplied() || state.maximized || isInteractive(event.target)) {
      return;
    }

    drag = {
      startX: event.clientX,
      startY: event.clientY,
      rect: { ...state.rect }
    };
    topbar.classList.add("is-dragging");

    try {
      topbar.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic pointers can't be captured — dragging still works.
    }

    event.preventDefault();
  });

  topbar.addEventListener("pointermove", (event) => {
    if (!drag) {
      return;
    }

    state.rect = clampWindowRect(
      {
        ...drag.rect,
        x: drag.rect.x + (event.clientX - drag.startX),
        y: drag.rect.y + (event.clientY - drag.startY)
      },
      viewport()
    );
    applyRect();
  });

  function endDrag(event) {
    if (!drag) {
      return;
    }

    drag = null;
    topbar.classList.remove("is-dragging");

    if (topbar.hasPointerCapture?.(event.pointerId)) {
      topbar.releasePointerCapture(event.pointerId);
    }

    persist();
  }

  topbar.addEventListener("pointerup", endDrag);
  topbar.addEventListener("pointercancel", endDrag);

  topbar.addEventListener("dblclick", (event) => {
    if (!isFloatingApplied() || isInteractive(event.target)) {
      return;
    }

    state.maximized = !state.maximized;
    applyRect();
    persist();
  });

  // ---- Resize by dragging the edge/corner handles ----

  for (const handle of wrapper.querySelectorAll(".editor-window-handle")) {
    const edge = handle.dataset.edge;
    let resize = null;

    handle.addEventListener("pointerdown", (event) => {
      if (!isFloatingApplied() || state.maximized) {
        return;
      }

      resize = {
        startX: event.clientX,
        startY: event.clientY,
        rect: { ...state.rect }
      };

      try {
        handle.setPointerCapture(event.pointerId);
      } catch {
        // Synthetic pointers can't be captured — resizing still works.
      }

      event.preventDefault();
    });

    handle.addEventListener("pointermove", (event) => {
      if (!resize) {
        return;
      }

      state.rect = resizeWindowRect(
        resize.rect,
        edge,
        event.clientX - resize.startX,
        event.clientY - resize.startY,
        viewport()
      );
      applyRect();
    });

    const endResize = (event) => {
      if (!resize) {
        return;
      }

      resize = null;

      if (handle.hasPointerCapture?.(event.pointerId)) {
        handle.releasePointerCapture(event.pointerId);
      }

      persist();
    };

    handle.addEventListener("pointerup", endResize);
    handle.addEventListener("pointercancel", endResize);
  }

  window.addEventListener("resize", () => {
    // Moving the page to another display — or crossing a viewport-scale tier —
    // changes the root font size while the rect still holds the old screen's
    // pixels. Convert before anything reads or persists it.
    syncScale();

    if (state.floating && window.innerWidth >= EDITOR_WINDOW_MIN_VIEWPORT && state.rect) {
      state.rect = clampWindowRect(state.rect, viewport());
    }

    applyMode();

    if (isFloatingApplied()) {
      applyRect();
    }
  });

  const stored = readStoredState();

  if (stored) {
    state.floating = stored.floating;
    state.maximized = stored.maximized;
    state.rect = stored.rect;
    state.scale = stored.scale;
  }

  // Re-express the saved rect in this screen's pixels before it is used (a v1
  // record, or a session on a differently scaled display).
  syncScale();

  applyMode();
}
