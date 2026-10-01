// ==UserScript==
// @name         Redmine Closed Removed From Subtasks
// @namespace    https://github.com/extstopcodepls/redmine_closed_substasks_remover
// @version      0.9
// @description  Usuwa linki z podzagadnień, które są zamkniętetam
// @author       Paweł Borawski
// @match        https://redmine.x-code.pl/issues/*
// @grant        none
//
// @history      1 dodanie ustawień - dla każdego coś fajnego
// @history      0.9 dodanie kolorowania Uwagi oraz <select> zamiast przycisków do filtrowania. zapamiętanie wyfiltrowania
//
// ==/UserScript==

const STORAGE_PREFIX = "redmine-tree-enhancer";

const DEFAULT_SETTINGS = {
  scope: "global",

  types: [
    {
      id: "error",
      name: "Błąd",
      phrase: "Błąd",
      color: "#b42d2d",
      showInFilter: true,
      colorize: true,
    },
    {
      id: "task",
      name: "Zadanie",
      phrase: "Zadanie",
      color: "#2d69b4",
      showInFilter: true,
      colorize: true,
    },
    {
      id: "note",
      name: "Uwaga",
      phrase: "Uwaga",
      color: "#196432",
      showInFilter: true,
      colorize: true,
    },
  ],

  matchMode: "contains",
  caseSensitive: false,

  filtering: {
    showParents: true,
    hideClosedRows: true,
    rememberSelected: true,
  },

  coloring: {
    enabled: true,
    depthOpacity: true,
    baseOpacity: 0.38,
    depthDecrease: 0.055,
    minOpacity: 0.08,
  },

  search: {
    remember: true,
    highlight: true,
    showParents: true,
  },

  tree: {
    remember: true,
    rememberPerIssue: true,
    defaultBehavior: "restore",
  },

  closed: {
    rememberSubtasks: true,
    rememberRelations: true,
  },
};

const DEFAULT_RUNTIME_STATE = {
  selectedType: "",
  search: "",
  showClosedSubtasks: false,
  showClosedRelations: false,
};

const DEFAULT_TREE_STATE = {
  initialized: false,
  collapsedIssues: [],
};

const TREE_SELECTOR = "#issue_tree";

let settings = deepClone(DEFAULT_SETTINGS);
let runtimeState = deepClone(DEFAULT_RUNTIME_STATE);
let treeState = deepClone(DEFAULT_TREE_STATE);

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createTypeId() {
  return (
    "type-" +
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 8)
  );
}

function normalizeColor(color) {
  if (typeof color !== "string") {
    return "#467aa7";
  }

  if (/^#[0-9a-f]{6}$/i.test(color)) {
    return color;
  }

  if (/^#[0-9a-f]{3}$/i.test(color)) {
    return (
      "#" + color[1] + color[1] + color[2] + color[2] + color[3] + color[3]
    );
  }

  return "#467aa7";
}

function normalizeNumber(value, fallback, min, max) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(Math.max(number, min), max);
}

function normalizeType(type, index) {
  const source = type ?? {};

  return {
    id: String(source.id || createTypeId() + "-" + index),
    name: String(source.name || source.phrase || "Typ"),
    phrase: String(source.phrase || source.name || ""),
    color: normalizeColor(source.color),
    showInFilter: source.showInFilter !== false,
    colorize: source.colorize !== false,
  };
}

function normalizeSettings(value) {
  const source = value ?? {};
  const result = deepClone(DEFAULT_SETTINGS);

  if (["global", "project", "issue"].includes(source.scope)) {
    result.scope = source.scope;
  }

  if (Array.isArray(source.types)) {
    result.types = source.types.map((type, index) =>
      normalizeType(type, index),
    );
  }

  if (["contains", "exact", "regex"].includes(source.matchMode)) {
    result.matchMode = source.matchMode;
  }

  result.caseSensitive = source.caseSensitive === true;

  if (source.filtering) {
    result.filtering.showParents = source.filtering.showParents !== false;

    result.filtering.hideClosedRows = source.filtering.hideClosedRows !== false;

    result.filtering.rememberSelected =
      source.filtering.rememberSelected !== false;
  }

  if (source.coloring) {
    result.coloring.enabled = source.coloring.enabled !== false;

    result.coloring.depthOpacity = source.coloring.depthOpacity !== false;

    result.coloring.baseOpacity = normalizeNumber(
      source.coloring.baseOpacity,
      DEFAULT_SETTINGS.coloring.baseOpacity,
      0,
      1,
    );

    result.coloring.depthDecrease = normalizeNumber(
      source.coloring.depthDecrease,
      DEFAULT_SETTINGS.coloring.depthDecrease,
      0,
      1,
    );

    result.coloring.minOpacity = normalizeNumber(
      source.coloring.minOpacity,
      DEFAULT_SETTINGS.coloring.minOpacity,
      0,
      1,
    );
  }

  if (source.search) {
    result.search.remember = source.search.remember !== false;

    result.search.highlight = source.search.highlight !== false;

    result.search.showParents = source.search.showParents !== false;
  }

  if (source.tree) {
    result.tree.remember = source.tree.remember !== false;

    result.tree.rememberPerIssue = source.tree.rememberPerIssue !== false;

    if (
      ["restore", "collapse", "expand"].includes(source.tree.defaultBehavior)
    ) {
      result.tree.defaultBehavior = source.tree.defaultBehavior;
    }
  }

  if (source.closed) {
    result.closed.rememberSubtasks = source.closed.rememberSubtasks !== false;

    result.closed.rememberRelations = source.closed.rememberRelations !== false;
  }

  return result;
}

function getCurrentIssueId() {
  const match = location.pathname.match(/\/issues\/(\d+)/);

  return match ? match[1] : null;
}

function getCurrentProjectKey() {
  const bodyClass = [...document.body.classList].find((className) =>
    className.startsWith("project-"),
  );

  if (bodyClass) {
    return bodyClass.slice("project-".length);
  }

  const pathMatch = location.pathname.match(/\/projects\/([^/]+)/);

  if (pathMatch) {
    return decodeURIComponent(pathMatch[1]);
  }

  return null;
}

function resolveScopeIdentifier(scope) {
  if (scope === "issue") {
    const issueId = getCurrentIssueId();

    if (issueId) {
      return `issue:${issueId}`;
    }
  }

  if (scope === "project" || scope === "issue") {
    const project = getCurrentProjectKey();

    if (project) {
      return `project:${project}`;
    }
  }

  return "global";
}

function getScopeModeKey() {
  return `${STORAGE_PREFIX}:scope:${location.host}`;
}

function getSettingsKey(scope) {
  return [
    STORAGE_PREFIX,
    "settings",
    location.host,
    resolveScopeIdentifier(scope),
  ].join(":");
}

function getRuntimeStateKey() {
  return [
    STORAGE_PREFIX,
    "state",
    location.host,
    resolveScopeIdentifier(settings.scope),
  ].join(":");
}

function getTreeStateKey() {
  const issueId = getCurrentIssueId();

  if (settings.tree.rememberPerIssue && issueId) {
    return [STORAGE_PREFIX, "tree", location.host, `issue:${issueId}`].join(
      ":",
    );
  }

  return [
    STORAGE_PREFIX,
    "tree",
    location.host,
    resolveScopeIdentifier(settings.scope),
  ].join(":");
}

async function getStoredValue(key, defaultValue) {
  try {
    if (typeof GM !== "undefined" && typeof GM.getValue === "function") {
      return await GM.getValue(key, defaultValue);
    }

    if (typeof GM_getValue === "function") {
      return GM_getValue(key, defaultValue);
    }

    const raw = localStorage.getItem(key);

    if (raw === null) {
      return defaultValue;
    }

    return JSON.parse(raw);
  } catch {
    return defaultValue;
  }
}

async function setStoredValue(key, value) {
  try {
    if (typeof GM !== "undefined" && typeof GM.setValue === "function") {
      await GM.setValue(key, value);

      return;
    }

    if (typeof GM_setValue === "function") {
      GM_setValue(key, value);

      return;
    }

    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

async function deleteStoredValue(key) {
  try {
    if (typeof GM !== "undefined" && typeof GM.deleteValue === "function") {
      await GM.deleteValue(key);
      return;
    }

    if (typeof GM_deleteValue === "function") {
      GM_deleteValue(key);
      return;
    }

    localStorage.removeItem(key);
  } catch {}
}

async function loadSettings() {
  const scope = await getStoredValue(getScopeModeKey(), "global");

  const normalizedScope = ["global", "project", "issue"].includes(scope)
    ? scope
    : "global";

  const stored = await getStoredValue(getSettingsKey(normalizedScope), null);

  settings = normalizeSettings(
    stored ?? {
      ...DEFAULT_SETTINGS,
      scope: normalizedScope,
    },
  );

  settings.scope = normalizedScope;
}

async function saveSettings(newSettings) {
  const normalized = normalizeSettings(newSettings);

  await setStoredValue(getScopeModeKey(), normalized.scope);

  await setStoredValue(getSettingsKey(normalized.scope), normalized);

  settings = normalized;
}

async function loadRuntimeState() {
  const stored = await getStoredValue(
    getRuntimeStateKey(),
    DEFAULT_RUNTIME_STATE,
  );

  runtimeState = {
    ...DEFAULT_RUNTIME_STATE,
    ...stored,
  };

  if (!settings.filtering.rememberSelected) {
    runtimeState.selectedType = "";
  }

  if (!settings.search.remember) {
    runtimeState.search = "";
  }

  if (!settings.closed.rememberSubtasks) {
    runtimeState.showClosedSubtasks = false;
  }

  if (!settings.closed.rememberRelations) {
    runtimeState.showClosedRelations = false;
  }
}

async function saveRuntimeState() {
  const state = deepClone(runtimeState);

  if (!settings.filtering.rememberSelected) {
    state.selectedType = "";
  }

  if (!settings.search.remember) {
    state.search = "";
  }

  if (!settings.closed.rememberSubtasks) {
    state.showClosedSubtasks = false;
  }

  if (!settings.closed.rememberRelations) {
    state.showClosedRelations = false;
  }

  await setStoredValue(getRuntimeStateKey(), state);
}

async function loadTreeState() {
  if (!settings.tree.remember) {
    treeState = deepClone(DEFAULT_TREE_STATE);

    return;
  }

  const stored = await getStoredValue(getTreeStateKey(), DEFAULT_TREE_STATE);

  treeState = {
    ...DEFAULT_TREE_STATE,
    ...stored,
  };

  if (!Array.isArray(treeState.collapsedIssues)) {
    treeState.collapsedIssues = [];
  }
}

async function saveTreeState() {
  if (!settings.tree.remember) {
    return;
  }

  await setStoredValue(getTreeStateKey(), treeState);
}

function getTree() {
  return document.querySelector(TREE_SELECTOR);
}

function getTreeRows() {
  return getTree()?.querySelectorAll("tr") ?? [];
}

function getDepth(tr) {
  const depthClass = [...tr.classList].find((className) =>
    /^idnt-\d+$/.test(className),
  );

  return depthClass ? Number(depthClass.slice(5)) : 0;
}

function isIndented(tr) {
  return [...tr.classList].some((className) => /^idnt-\d+$/.test(className));
}

function containsText(tr, text) {
  return [...tr.querySelectorAll("td")].some((td) =>
    td.textContent.includes(text),
  );
}

function isClosed(tr) {
  return tr.classList.contains("closed") || containsText(tr, "Zamknięty");
}

function getIssueId(tr) {
  const rowMatch = tr.id?.match(/^issue-(\d+)$/);

  if (rowMatch) {
    return rowMatch[1];
  }

  const link = tr.querySelector('a[href*="/issues/"]');

  if (!link) {
    return null;
  }

  const match = link.getAttribute("href")?.match(/\/issues\/(\d+)/);

  return match ? match[1] : null;
}

function setRowVisible(tr, visible) {
  tr.style.display = visible ? "" : "none";
}

function getDescendantRows(tr) {
  const depth = getDepth(tr);

  const descendants = [];

  let next = tr.nextElementSibling;

  while (next) {
    const nextDepth = getDepth(next);

    if (nextDepth <= depth) {
      break;
    }

    descendants.push(next);

    next = next.nextElementSibling;
  }

  return descendants;
}

function getDirectChildren(tr) {
  const depth = getDepth(tr);

  const children = [];

  let next = tr.nextElementSibling;

  while (next) {
    const nextDepth = getDepth(next);

    if (nextDepth <= depth) {
      break;
    }

    if (nextDepth === depth + 1) {
      children.push(next);
    }

    next = next.nextElementSibling;
  }

  return children;
}

function hasDirectChildren(tr) {
  const depth = getDepth(tr);

  const next = tr.nextElementSibling;

  return Boolean(next && getDepth(next) === depth + 1);
}

function hideDescendants(tr) {
  getDescendantRows(tr).forEach((row) => {
    if (!isClosed(row)) {
      setRowVisible(row, false);
    }
  });
}

function showDirectChildren(tr) {
  getDirectChildren(tr).forEach((row) => {
    if (!isClosed(row)) {
      setRowVisible(row, true);
    }
  });
}

function getAncestors(tr) {
  const result = [];

  let depth = getDepth(tr);

  let previous = tr.previousElementSibling;

  while (previous && depth > 0) {
    const previousDepth = getDepth(previous);

    if (previousDepth < depth) {
      result.push(previous);
      depth = previousDepth;
    }

    previous = previous.previousElementSibling;
  }

  return result;
}

function matchesText(text, phrase) {
  if (!phrase) {
    return false;
  }

  let sourceText = String(text);

  let sourcePhrase = String(phrase);

  if (!settings.caseSensitive) {
    sourceText = sourceText.toLocaleLowerCase();

    sourcePhrase = sourcePhrase.toLocaleLowerCase();
  }

  if (settings.matchMode === "exact") {
    return sourceText.trim() === sourcePhrase.trim();
  }

  if (settings.matchMode === "regex") {
    try {
      const flags = settings.caseSensitive ? "" : "i";

      const expression = new RegExp(phrase, flags);

      return expression.test(String(text));
    } catch {
      return false;
    }
  }

  return sourceText.includes(sourcePhrase);
}

function rowMatchesType(tr, type) {
  return [...tr.querySelectorAll("td")].some((td) =>
    matchesText(td.textContent, type.phrase),
  );
}

function hexToRgb(hex) {
  const normalized = normalizeColor(hex).slice(1);

  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

function colorTreeRows() {
  document.querySelectorAll("tr").forEach((tr) => {
    tr.style.backgroundColor = "";

    if (!settings.coloring.enabled) {
      return;
    }

    const type = settings.types.find(
      (currentType) => currentType.colorize && rowMatchesType(tr, currentType),
    );

    if (!type) {
      return;
    }

    const depth = getDepth(tr);

    let opacity = settings.coloring.baseOpacity;

    if (settings.coloring.depthOpacity) {
      opacity = Math.max(
        settings.coloring.baseOpacity - depth * settings.coloring.depthDecrease,
        settings.coloring.minOpacity,
      );
    }

    const rgb = hexToRgb(type.color);

    tr.style.backgroundColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`;
  });
}

function markRowsWithChildren() {
  getTreeRows().forEach((tr) => {
    if (!hasDirectChildren(tr)) {
      return;
    }

    tr.classList.add("has-children");

    const firstTd = tr.querySelectorAll("td")[1];

    if (!firstTd || firstTd.querySelector(".tree-toggle-marker")) {
      return;
    }

    const marker = document.createElement("span");

    marker.className = "tree-toggle-marker";

    marker.textContent = "▶";

    marker.style.marginRight = "6px";

    marker.style.cursor = "pointer";

    marker.style.color = "#467aa7";

    firstTd.prepend(marker);
  });
}

function setCollapsed(tr, collapsed) {
  tr.dataset.collapsed = String(collapsed);

  const marker = tr.querySelector(".tree-toggle-marker");

  if (marker) {
    marker.textContent = collapsed ? "▶" : "▼";

    marker.style.color = collapsed ? "#467aa7" : "white";
  }
}

function updateTreeStateFromDom() {
  const collapsedIssues = [];

  getTreeRows().forEach((tr) => {
    if (tr.dataset.collapsed !== "true") {
      return;
    }

    if (!hasDirectChildren(tr)) {
      return;
    }

    const issueId = getIssueId(tr);

    if (issueId) {
      collapsedIssues.push(issueId);
    }
  });

  treeState = {
    initialized: true,
    collapsedIssues: collapsedIssues,
  };

  void saveTreeState();
}

function collapseAll(persist = true) {
  getTreeRows().forEach((tr) => {
    if (isIndented(tr) && !isClosed(tr)) {
      setRowVisible(tr, false);
    }

    if (!isClosed(tr) && hasDirectChildren(tr)) {
      setCollapsed(tr, true);
    }
  });

  if (persist) {
    updateTreeStateFromDom();
  }
}

function showAll(persist = true) {
  getTreeRows().forEach((tr) => {
    if (!isClosed(tr)) {
      setRowVisible(tr, true);
    }

    if (!isClosed(tr) && hasDirectChildren(tr)) {
      setCollapsed(tr, false);
    }
  });

  if (persist) {
    treeState = {
      initialized: true,
      collapsedIssues: [],
    };

    void saveTreeState();
  }
}

function restoreCollapsedState() {
  if (!settings.tree.remember || !treeState.initialized) {
    applyDefaultTreeBehavior();
    return;
  }

  const collapsed = new Set(treeState.collapsedIssues.map(String));

  getTreeRows().forEach((tr) => {
    if (!isClosed(tr)) {
      setRowVisible(tr, true);
    }

    if (!isClosed(tr) && hasDirectChildren(tr)) {
      setCollapsed(tr, false);
    }
  });

  getTreeRows().forEach((tr) => {
    if (!hasDirectChildren(tr)) {
      return;
    }

    const issueId = getIssueId(tr);

    if (issueId && collapsed.has(String(issueId))) {
      setCollapsed(tr, true);

      hideDescendants(tr);
    }
  });
}

function applyDefaultTreeBehavior() {
  if (settings.tree.defaultBehavior === "expand") {
    showAll(false);
    return;
  }

  if (settings.tree.defaultBehavior === "collapse") {
    collapseAll(false);
    return;
  }

  collapseAll(false);
}

function handleRowClick(event) {
  if (!(event.target instanceof Element)) {
    return;
  }

  const tr = event.target.closest(`${TREE_SELECTOR} tr`);

  if (!tr || isClosed(tr) || !hasDirectChildren(tr)) {
    return;
  }

  const collapsed = tr.dataset.collapsed === "true";

  if (collapsed) {
    showDirectChildren(tr);
    setCollapsed(tr, false);
  } else {
    hideDescendants(tr);
    setCollapsed(tr, true);
  }

  updateTreeStateFromDom();
}

function clearSearchHighlights() {
  getTree()
    ?.querySelectorAll(".tm-search-highlight")
    .forEach((mark) => {
      mark.replaceWith(document.createTextNode(mark.textContent));
    });

  getTree()?.normalize();
}

function highlightText(element, phrase) {
  if (!settings.search.highlight) {
    return;
  }

  const search = phrase.trim();

  if (!search) {
    return;
  }

  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);

  const nodes = [];

  while (walker.nextNode()) {
    if (walker.currentNode.parentElement?.closest(".tm-search-highlight")) {
      continue;
    }

    nodes.push(walker.currentNode);
  }

  nodes.forEach((node) => {
    const originalText = node.textContent;

    const compareText = settings.caseSensitive
      ? originalText
      : originalText.toLocaleLowerCase();

    const compareSearch = settings.caseSensitive
      ? search
      : search.toLocaleLowerCase();

    const index = compareText.indexOf(compareSearch);

    if (index === -1) {
      return;
    }

    const before = document.createTextNode(originalText.slice(0, index));

    const mark = document.createElement("mark");

    const after = document.createTextNode(
      originalText.slice(index + search.length),
    );

    mark.className = "tm-search-highlight";

    mark.textContent = originalText.slice(index, index + search.length);

    node.replaceWith(before, mark, after);
  });
}

function getSelectedType() {
  if (!runtimeState.selectedType) {
    return null;
  }

  return (
    settings.types.find((type) => type.id === runtimeState.selectedType) ?? null
  );
}

function rowMatchesSearch(tr, phrase) {
  const search = phrase.trim();

  if (!search) {
    return true;
  }

  const text = tr.textContent ?? "";

  if (settings.caseSensitive) {
    return text.includes(search);
  }

  return text.toLocaleLowerCase().includes(search.toLocaleLowerCase());
}

function restoreBaseTreeState() {
  if (settings.tree.remember && treeState.initialized) {
    restoreCollapsedState();
  } else {
    applyDefaultTreeBehavior();
  }

  applySubtasksClosedVisibility(runtimeState.showClosedSubtasks);
}

function applyTreeFilters() {
  clearSearchHighlights();

  const selectedType = getSelectedType();

  const phrase = runtimeState.search.trim();

  const hasTypeFilter = Boolean(selectedType);

  const hasSearch = Boolean(phrase);

  if (!hasTypeFilter && !hasSearch) {
    restoreBaseTreeState();
    return;
  }

  const rows = [...getTreeRows()];

  const rowsToShow = new Set();

  rows.forEach((tr) => {
    if (isClosed(tr) && settings.filtering.hideClosedRows) {
      return;
    }

    if (isClosed(tr) && !runtimeState.showClosedSubtasks) {
      return;
    }

    const typeMatches = !selectedType || rowMatchesType(tr, selectedType);

    const searchMatches = rowMatchesSearch(tr, phrase);

    if (!typeMatches || !searchMatches) {
      return;
    }

    rowsToShow.add(tr);

    if (selectedType && settings.filtering.showParents) {
      getAncestors(tr).forEach((parent) => {
        if (!isClosed(parent)) {
          rowsToShow.add(parent);
        }
      });
    }

    if (hasSearch && settings.search.showParents) {
      getAncestors(tr).forEach((parent) => {
        if (!isClosed(parent)) {
          rowsToShow.add(parent);
        }
      });
    }

    if (hasSearch) {
      [...tr.querySelectorAll("td")].forEach((td) => {
        if (rowMatchesSearch(td, phrase)) {
          highlightText(td, phrase);
        }
      });
    }
  });

  rows.forEach((tr) => {
    if (isClosed(tr) && !runtimeState.showClosedSubtasks) {
      setRowVisible(tr, false);

      return;
    }

    setRowVisible(tr, rowsToShow.has(tr));
  });
}

function getAllSubtasksRows() {
  return document.querySelectorAll("#issue_tree table.list.issues tr.closed");
}

function applySubtasksClosedVisibility(visible) {
  const rows = getAllSubtasksRows();

  const typeFilterActive = Boolean(runtimeState.selectedType);

  const searchActive = Boolean(runtimeState.search.trim());

  rows.forEach((row) => {
    if (typeFilterActive || searchActive) {
      return;
    }

    row.style.display = visible ? "table-row" : "none";
  });

  const toggle = document.querySelector(
    "#issue_tree .tm-subtasks-closed-toggle",
  );

  if (toggle) {
    if (visible) {
      toggle.innerHTML = " - Schowaj zamknięte - ";

      toggle.onclick = hideSubtasks;
    } else {
      toggle.innerHTML = " - " + rows.length + " zamkniętych. (pokaż)";

      toggle.onclick = showSubtasks;
    }
  }
}

function showSubtasks(event) {
  if (event) {
    event.preventDefault();
  }

  runtimeState.showClosedSubtasks = true;

  if (settings.closed.rememberSubtasks) {
    void saveRuntimeState();
  }

  applySubtasksClosedVisibility(true);

  applyTreeFilters();
}

function hideSubtasks(event) {
  if (event) {
    event.preventDefault();
  }

  runtimeState.showClosedSubtasks = false;

  if (settings.closed.rememberSubtasks) {
    void saveRuntimeState();
  }

  applySubtasksClosedVisibility(false);

  applyTreeFilters();
}

function setupSubtasks() {
  const rows = getAllSubtasksRows();

  if (!rows.length) {
    return;
  }

  const title = document.querySelector("#issue_tree > p > strong");

  if (
    title &&
    !document.querySelector("#issue_tree .tm-subtasks-closed-toggle")
  ) {
    const toggle = document.createElement("a");

    toggle.className = "tm-subtasks-closed-toggle";

    toggle.style.cursor = "pointer";

    title.parentNode.insertBefore(toggle, title.nextSibling);
  }

  const linkElement = document.querySelector("#issue_tree > p > span");

  if (
    linkElement &&
    !linkElement.previousElementSibling?.classList.contains("tm-tables-label")
  ) {
    const label = document.createElement("strong");

    label.className = "tm-tables-label";

    label.innerText = "Tabele: ";

    linkElement.parentNode.insertBefore(label, linkElement);
  }

  applySubtasksClosedVisibility(runtimeState.showClosedSubtasks);
}

function getAllCorrelatedTasksRows() {
  return document.querySelectorAll("#relations table.list.issues tr.closed");
}

function applyCorrelatedTasksClosedVisibility(visible) {
  const rows = getAllCorrelatedTasksRows();

  rows.forEach((row) => {
    row.style.display = visible ? "table-row" : "none";
  });

  const toggle = document.querySelector(
    "#relations .tm-relations-closed-toggle",
  );

  if (toggle) {
    if (visible) {
      toggle.innerHTML = " - Schowaj zamknięte - ";

      toggle.onclick = hideCorrelatedTasks;
    } else {
      toggle.innerHTML = " - " + rows.length + " zamkniętych. (pokaż)";

      toggle.onclick = showCorrelatedTasks;
    }
  }
}

function showCorrelatedTasks(event) {
  if (event) {
    event.preventDefault();
  }

  runtimeState.showClosedRelations = true;

  if (settings.closed.rememberRelations) {
    void saveRuntimeState();
  }

  applyCorrelatedTasksClosedVisibility(true);
}

function hideCorrelatedTasks(event) {
  if (event) {
    event.preventDefault();
  }

  runtimeState.showClosedRelations = false;

  if (settings.closed.rememberRelations) {
    void saveRuntimeState();
  }

  applyCorrelatedTasksClosedVisibility(false);
}

function setupCorrelatedTasks() {
  const rows = getAllCorrelatedTasksRows();

  if (!rows.length) {
    return;
  }

  const title = document.querySelector("#relations > p > strong");

  if (
    title &&
    !document.querySelector("#relations .tm-relations-closed-toggle")
  ) {
    const toggle = document.createElement("a");

    toggle.className = "tm-relations-closed-toggle";

    toggle.style.cursor = "pointer";

    title.parentNode.insertBefore(toggle, title.nextSibling);
  }

  applyCorrelatedTasksClosedVisibility(runtimeState.showClosedRelations);
}

function rebuildTypeFilter() {
  const select = document.querySelector(".tm-tree-type-filter");

  if (!select) {
    return;
  }

  select.innerHTML = "";

  const all = document.createElement("option");

  all.value = "";
  all.textContent = "Wszystkie";

  select.append(all);

  settings.types
    .filter((type) => type.showInFilter)
    .forEach((type) => {
      const option = document.createElement("option");

      option.value = type.id;

      option.textContent = type.name;

      select.append(option);
    });

  const selectedExists = settings.types.some(
    (type) => type.id === runtimeState.selectedType && type.showInFilter,
  );

  if (!selectedExists) {
    runtimeState.selectedType = "";
  }

  select.value = runtimeState.selectedType;
}

function addTypeFilterControls(p) {
  if (p.querySelector(".tm-tree-type-filter")) {
    return;
  }

  const select = document.createElement("select");

  select.className = "tm-tree-type-filter";

  select.style.marginLeft = "10px";

  select.addEventListener("change", (event) => {
    runtimeState.selectedType = event.target.value;

    if (settings.filtering.rememberSelected) {
      void saveRuntimeState();
    }

    applyTreeFilters();
  });

  p.append(select);

  rebuildTypeFilter();
}

function addTreeSearch() {
  const tree = getTree();

  if (!tree) {
    return;
  }

  const p = tree.querySelector(":scope > p");

  if (!p || p.querySelector(".tm-tree-search")) {
    return;
  }

  const input = document.createElement("input");

  input.type = "search";

  input.className = "tm-tree-search";

  input.placeholder = "Search...";

  input.style.marginLeft = "10px";

  input.value = runtimeState.search;

  input.addEventListener("input", () => {
    runtimeState.search = input.value;

    if (settings.search.remember) {
      void saveRuntimeState();
    }

    applyTreeFilters();
  });

  p.append(input);
}

function addTreeControls() {
  const tree = getTree();

  if (!tree || tree.querySelector(".tm-tree-controls")) {
    return;
  }

  const p = tree.querySelector(":scope > p");

  if (!p) {
    return;
  }

  const controls = document.createElement("span");

  controls.className = "tm-tree-controls";

  controls.style.marginLeft = "10px";

  const collapseLink = document.createElement("a");

  collapseLink.href = "#";
  collapseLink.textContent = "Pokaż wszystkie";

  collapseLink.style.marginRight = "10px";

  const showLink = document.createElement("a");

  showLink.href = "#";
  showLink.textContent = "Rozwiń";

  showLink.style.marginRight = "10px";

  const settingsLink = document.createElement("a");

  settingsLink.href = "#";
  settingsLink.textContent = "Ustawienia";

  collapseLink.addEventListener("click", (event) => {
    event.preventDefault();
    collapseAll();
  });

  showLink.addEventListener("click", (event) => {
    event.preventDefault();
    showAll();
  });

  settingsLink.addEventListener("click", (event) => {
    event.preventDefault();
    openSettingsModal();
  });

  controls.append(collapseLink, showLink, settingsLink);

  p.insertAdjacentElement("beforeend", controls);

  addTypeFilterControls(p);
}

function initTreeCollapse() {
  document.addEventListener("click", handleRowClick);

  addTreeControls();
}

function ensureSettingsStyles() {
  if (document.getElementById("tm-redmine-settings-style")) {
    return;
  }

  const style = document.createElement("style");

  style.id = "tm-redmine-settings-style";

  style.textContent = `
.tm-settings-overlay {
    position: fixed;
    inset: 0;
    z-index: 999999;
    background: rgba(0, 0, 0, 0.55);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 40px 20px;
    overflow: auto;
}

.tm-settings-panel {
    width: min(900px, 100%);
    background: #fff;
    color: #222;
    border-radius: 6px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.35);
    padding: 20px;
    font-family: Arial, sans-serif;
}

.tm-settings-panel h2 {
    margin: 0 0 20px;
}

.tm-settings-panel h3 {
    margin: 24px 0 10px;
    border-bottom: 1px solid #ddd;
    padding-bottom: 6px;
}

.tm-settings-grid {
    display: grid;
    grid-template-columns: minmax(180px, 260px) 1fr;
    gap: 8px 16px;
    align-items: center;
}

.tm-settings-grid input[type="text"],
.tm-settings-grid input[type="number"],
.tm-settings-grid select {
    width: 100%;
    max-width: 420px;
    box-sizing: border-box;
}

.tm-settings-type {
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 12px;
    margin-bottom: 10px;
}

.tm-settings-type-grid {
    display: grid;
    grid-template-columns: 110px 1fr;
    gap: 7px 12px;
    align-items: center;
}

.tm-settings-type-actions {
    margin-top: 10px;
    text-align: right;
}

.tm-settings-check {
    display: flex;
    gap: 8px;
    align-items: center;
}

.tm-settings-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 24px;
    padding-top: 16px;
    border-top: 1px solid #ddd;
}

.tm-settings-buttons-right {
    margin-left: auto;
    display: flex;
    gap: 8px;
}

.tm-settings-panel button {
    cursor: pointer;
}

.tm-settings-danger {
    color: #a00;
}

.tm-settings-status {
    margin-top: 10px;
    min-height: 18px;
    font-weight: bold;
}

@media (max-width: 650px) {
    .tm-settings-grid,
    .tm-settings-type-grid {
        grid-template-columns: 1fr;
    }

    .tm-settings-buttons-right {
        margin-left: 0;
        width: 100%;
    }
}
`;

  document.head.append(style);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function openSettingsModal() {
  if (document.querySelector(".tm-settings-overlay")) {
    return;
  }

  ensureSettingsStyles();

  let draft = deepClone(settings);

  const overlay = document.createElement("div");

  overlay.className = "tm-settings-overlay";

  const panel = document.createElement("div");

  panel.className = "tm-settings-panel";

  overlay.append(panel);
  document.body.append(overlay);

  function close() {
    overlay.remove();
  }

  function syncSimpleFields() {
    const scope = panel.querySelector("#tm-setting-scope");

    if (!scope) {
      return;
    }

    draft.scope = scope.value;

    draft.matchMode = panel.querySelector("#tm-setting-match-mode").value;

    draft.caseSensitive = panel.querySelector(
      "#tm-setting-case-sensitive",
    ).checked;

    draft.filtering.showParents = panel.querySelector(
      "#tm-setting-filter-parents",
    ).checked;

    draft.filtering.hideClosedRows = panel.querySelector(
      "#tm-setting-hide-closed",
    ).checked;

    draft.filtering.rememberSelected = panel.querySelector(
      "#tm-setting-remember-filter",
    ).checked;

    draft.coloring.enabled = panel.querySelector(
      "#tm-setting-coloring-enabled",
    ).checked;

    draft.coloring.depthOpacity = panel.querySelector(
      "#tm-setting-depth-opacity",
    ).checked;

    draft.coloring.baseOpacity = normalizeNumber(
      Number(panel.querySelector("#tm-setting-base-opacity").value) / 100,
      DEFAULT_SETTINGS.coloring.baseOpacity,
      0,
      1,
    );

    draft.coloring.depthDecrease = normalizeNumber(
      Number(panel.querySelector("#tm-setting-depth-decrease").value) / 100,
      DEFAULT_SETTINGS.coloring.depthDecrease,
      0,
      1,
    );

    draft.coloring.minOpacity = normalizeNumber(
      Number(panel.querySelector("#tm-setting-min-opacity").value) / 100,
      DEFAULT_SETTINGS.coloring.minOpacity,
      0,
      1,
    );

    draft.search.remember = panel.querySelector(
      "#tm-setting-search-remember",
    ).checked;

    draft.search.highlight = panel.querySelector(
      "#tm-setting-search-highlight",
    ).checked;

    draft.search.showParents = panel.querySelector(
      "#tm-setting-search-parents",
    ).checked;

    draft.tree.remember = panel.querySelector(
      "#tm-setting-tree-remember",
    ).checked;

    draft.tree.rememberPerIssue = panel.querySelector(
      "#tm-setting-tree-per-issue",
    ).checked;

    draft.tree.defaultBehavior = panel.querySelector(
      "#tm-setting-tree-default",
    ).value;

    draft.closed.rememberSubtasks = panel.querySelector(
      "#tm-setting-closed-subtasks",
    ).checked;

    draft.closed.rememberRelations = panel.querySelector(
      "#tm-setting-closed-relations",
    ).checked;
  }

  function renderTypes() {
    const container = panel.querySelector("#tm-settings-types");

    container.innerHTML = "";

    draft.types.forEach((type, index) => {
      const element = document.createElement("div");

      element.className = "tm-settings-type";

      element.innerHTML = `
<div class="tm-settings-type-grid">
    <label>Nazwa:</label>
    <input
        type="text"
        data-field="name"
        value="${escapeHtml(type.name)}"
    >

    <label>Fraza:</label>
    <input
        type="text"
        data-field="phrase"
        value="${escapeHtml(type.phrase)}"
    >

    <label>Kolor:</label>
    <input
        type="color"
        data-field="color"
        value="${escapeHtml(normalizeColor(type.color))}"
    >

    <label>Filtr:</label>
    <label class="tm-settings-check">
        <input
            type="checkbox"
            data-field="showInFilter"
            ${type.showInFilter ? "checked" : ""}
        >
        Pokazuj w filtrze
    </label>

    <label>Kolorowanie:</label>
    <label class="tm-settings-check">
        <input
            type="checkbox"
            data-field="colorize"
            ${type.colorize ? "checked" : ""}
        >
        Koloruj wiersze
    </label>
</div>

<div class="tm-settings-type-actions">
    <button
        type="button"
        data-action="delete"
        class="tm-settings-danger"
    >
        Usuń
    </button>
</div>
`;

      element.querySelectorAll("[data-field]").forEach((input) => {
        input.addEventListener("input", () => {
          const field = input.dataset.field;

          if (input.type === "checkbox") {
            draft.types[index][field] = input.checked;
          } else {
            draft.types[index][field] = input.value;
          }
        });

        input.addEventListener("change", () => {
          const field = input.dataset.field;

          if (input.type === "checkbox") {
            draft.types[index][field] = input.checked;
          } else {
            draft.types[index][field] = input.value;
          }
        });
      });

      element
        .querySelector('[data-action="delete"]')
        .addEventListener("click", () => {
          syncSimpleFields();

          draft.types.splice(index, 1);

          render();
        });

      container.append(element);
    });
  }

  function setStatus(text, isError = false) {
    const status = panel.querySelector(".tm-settings-status");

    if (!status) {
      return;
    }

    status.textContent = text;

    status.style.color = isError ? "#a00" : "#286500";
  }

  async function exportSettings() {
    syncSimpleFields();

    const payload = JSON.stringify(
      {
        version: 1,
        settings: normalizeSettings(draft),
      },
      null,
      2,
    );

    try {
      if (
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === "function"
      ) {
        await navigator.clipboard.writeText(payload);

        setStatus("Ustawienia skopiowane do schowka.");

        return;
      }
    } catch {}

    window.prompt("Skopiuj ustawienia:", payload);
  }

  function importSettings() {
    const value = window.prompt("Wklej ustawienia:");

    if (!value) {
      return;
    }

    try {
      const parsed = JSON.parse(value);

      const imported = parsed.settings ?? parsed;

      draft = normalizeSettings(imported);

      render();

      setStatus("Ustawienia zaimportowane. Kliknij Zapisz.");
    } catch {
      setStatus("Nieprawidłowy format ustawień.", true);
    }
  }

  async function resetCurrentState() {
    await deleteStoredValue(getRuntimeStateKey());

    await deleteStoredValue(getTreeStateKey());

    setStatus("Zapisany stan został zresetowany.");
  }

  function render() {
    panel.innerHTML = `
<h2>Ustawienia Redmine Tree</h2>

<h3>Typy wierszy</h3>

<div id="tm-settings-types"></div>

<button
    type="button"
    id="tm-settings-add-type"
>
    + Dodaj typ
</button>

<h3>Dopasowanie typu</h3>

<div class="tm-settings-grid">
    <label for="tm-setting-match-mode">
        Dopasowanie:
    </label>

    <select id="tm-setting-match-mode">
        <option value="contains">
            Zawiera frazę
        </option>
        <option value="exact">
            Dokładne dopasowanie
        </option>
        <option value="regex">
            Wyrażenie regularne
        </option>
    </select>

    <span>Wielkość liter:</span>

    <label class="tm-settings-check">
        <input
            type="checkbox"
            id="tm-setting-case-sensitive"
        >
        Rozróżniaj wielkość liter
    </label>
</div>

<h3>Filtrowanie</h3>

<div class="tm-settings-grid">
    <span>Rodzice:</span>

    <label class="tm-settings-check">
        <input
            type="checkbox"
            id="tm-setting-filter-parents"
        >
        Pokazuj rodziców pasujących elementów
    </label>

    <span>Zamknięte:</span>

    <label class="tm-settings-check">
        <input
            type="checkbox"
            id="tm-setting-hide-closed"
        >
        Ukrywaj zamknięte wiersze podczas filtrowania
    </label>

    <span>Pamięć:</span>

    <label class="tm-settings-check">
        <input
            type="checkbox"
            id="tm-setting-remember-filter"
        >
        Zapamiętuj wybrany filtr
    </label>
</div>

<h3>Kolorowanie</h3>

<div class="tm-settings-grid">
    <span>Kolorowanie:</span>

    <label class="tm-settings-check">
        <input
            type="checkbox"
            id="tm-setting-coloring-enabled"
        >
        Włącz kolorowanie
    </label>

    <span>Zagnieżdżenie:</span>

    <label class="tm-settings-check">
        <input
            type="checkbox"
            id="tm-setting-depth-opacity"
        >
        Zmieniaj intensywność zależnie od poziomu
    </label>

    <label for="tm-setting-base-opacity">
        Poziom 0:
    </label>

    <input
        type="number"
        id="tm-setting-base-opacity"
        min="0"
        max="100"
        step="0.5"
    >

    <label for="tm-setting-depth-decrease">
        Spadek na poziom:
    </label>

    <input
        type="number"
        id="tm-setting-depth-decrease"
        min="0"
        max="100"
        step="0.5"
    >

    <label for="tm-setting-min-opacity">
        Minimalna intensywność:
    </label>

    <input
        type="number"
        id="tm-setting-min-opacity"
        min="0"
        max="100"
        step="0.5"
    >
</div>

<h3>Wyszukiwanie</h3>

<div class="tm-settings-grid">
    <span>Pamięć:</span>

    <label class="tm-settings-check">
        <input
            type="checkbox"
            id="tm-setting-search-remember"
        >
        Zapamiętuj wyszukiwaną frazę
    </label>

    <span>Podświetlenie:</span>

    <label class="tm-settings-check">
        <input
            type="checkbox"
            id="tm-setting-search-highlight"
        >
        Podświetlaj znaleziony tekst
    </label>

    <span>Rodzice:</span>

    <label class="tm-settings-check">
        <input
            type="checkbox"
            id="tm-setting-search-parents"
        >
        Pokazuj rodziców znalezionych elementów
    </label>
</div>

<h3>Drzewo</h3>

<div class="tm-settings-grid">
    <span>Pamięć:</span>

    <label class="tm-settings-check">
        <input
            type="checkbox"
            id="tm-setting-tree-remember"
        >
        Zapamiętuj rozwinięte i zwinięte gałęzie
    </label>

    <span>Zakres drzewa:</span>

    <label class="tm-settings-check">
        <input
            type="checkbox"
            id="tm-setting-tree-per-issue"
        >
        Zapamiętuj stan osobno dla każdego zadania
    </label>

    <label for="tm-setting-tree-default">
        Domyślne zachowanie:
    </label>

    <select id="tm-setting-tree-default">
        <option value="restore">
            Przywróć ostatni stan
        </option>
        <option value="collapse">
            Zwiń wszystko
        </option>
        <option value="expand">
            Rozwiń wszystko
        </option>
    </select>
</div>

<h3>Zamknięte elementy</h3>

<div class="tm-settings-grid">
    <span>Podzadania:</span>

    <label class="tm-settings-check">
        <input
            type="checkbox"
            id="tm-setting-closed-subtasks"
        >
        Zapamiętuj widoczność zamkniętych podzadań
    </label>

    <span>Powiązane zadania:</span>

    <label class="tm-settings-check">
        <input
            type="checkbox"
            id="tm-setting-closed-relations"
        >
        Zapamiętuj widoczność zamkniętych powiązanych zadań
    </label>
</div>

<h3>Zakres ustawień</h3>

<div class="tm-settings-grid">
    <label for="tm-setting-scope">
        Zakres:
    </label>

    <select id="tm-setting-scope">
        <option value="global">
            Globalnie
        </option>
        <option value="project">
            Dla projektu
        </option>
        <option value="issue">
            Dla konkretnego zadania
        </option>
    </select>
</div>

<h3>Zarządzanie konfiguracją</h3>

<div class="tm-settings-buttons">
    <button
        type="button"
        id="tm-settings-export"
    >
        Eksportuj ustawienia
    </button>

    <button
        type="button"
        id="tm-settings-import"
    >
        Importuj ustawienia
    </button>

    <button
        type="button"
        id="tm-settings-defaults"
    >
        Przywróć domyślne
    </button>

    <button
        type="button"
        id="tm-settings-reset-state"
    >
        Resetuj zapisany stan drzewa
    </button>

    <div class="tm-settings-buttons-right">
        <button
            type="button"
            id="tm-settings-cancel"
        >
            Anuluj
        </button>

        <button
            type="button"
            id="tm-settings-save"
        >
            Zapisz
        </button>
    </div>
</div>

<div class="tm-settings-status"></div>
`;

    panel.querySelector("#tm-setting-match-mode").value = draft.matchMode;

    panel.querySelector("#tm-setting-case-sensitive").checked =
      draft.caseSensitive;

    panel.querySelector("#tm-setting-filter-parents").checked =
      draft.filtering.showParents;

    panel.querySelector("#tm-setting-hide-closed").checked =
      draft.filtering.hideClosedRows;

    panel.querySelector("#tm-setting-remember-filter").checked =
      draft.filtering.rememberSelected;

    panel.querySelector("#tm-setting-coloring-enabled").checked =
      draft.coloring.enabled;

    panel.querySelector("#tm-setting-depth-opacity").checked =
      draft.coloring.depthOpacity;

    panel.querySelector("#tm-setting-base-opacity").value = (
      draft.coloring.baseOpacity * 100
    ).toFixed(1);

    panel.querySelector("#tm-setting-depth-decrease").value = (
      draft.coloring.depthDecrease * 100
    ).toFixed(1);

    panel.querySelector("#tm-setting-min-opacity").value = (
      draft.coloring.minOpacity * 100
    ).toFixed(1);

    panel.querySelector("#tm-setting-search-remember").checked =
      draft.search.remember;

    panel.querySelector("#tm-setting-search-highlight").checked =
      draft.search.highlight;

    panel.querySelector("#tm-setting-search-parents").checked =
      draft.search.showParents;

    panel.querySelector("#tm-setting-tree-remember").checked =
      draft.tree.remember;

    panel.querySelector("#tm-setting-tree-per-issue").checked =
      draft.tree.rememberPerIssue;

    panel.querySelector("#tm-setting-tree-default").value =
      draft.tree.defaultBehavior;

    panel.querySelector("#tm-setting-closed-subtasks").checked =
      draft.closed.rememberSubtasks;

    panel.querySelector("#tm-setting-closed-relations").checked =
      draft.closed.rememberRelations;

    panel.querySelector("#tm-setting-scope").value = draft.scope;

    renderTypes();

    panel
      .querySelector("#tm-settings-add-type")
      .addEventListener("click", () => {
        syncSimpleFields();

        draft.types.push({
          id: createTypeId(),
          name: "Nowy typ",
          phrase: "Nowy typ",
          color: "#467aa7",
          showInFilter: true,
          colorize: true,
        });

        render();
      });

    panel.querySelector("#tm-settings-export").addEventListener("click", () => {
      void exportSettings();
    });

    panel.querySelector("#tm-settings-import").addEventListener("click", () => {
      importSettings();
    });

    panel
      .querySelector("#tm-settings-defaults")
      .addEventListener("click", () => {
        draft = deepClone(DEFAULT_SETTINGS);

        render();
      });

    panel
      .querySelector("#tm-settings-reset-state")
      .addEventListener("click", () => {
        void resetCurrentState();
      });

    panel.querySelector("#tm-settings-cancel").addEventListener("click", () => {
      close();
    });

    panel
      .querySelector("#tm-settings-save")
      .addEventListener("click", async () => {
        syncSimpleFields();

        await saveSettings(draft);

        location.reload();
      });
  }

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      close();
    }
  });

  document.addEventListener("keydown", function handleEscape(event) {
    if (event.key === "Escape") {
      document.removeEventListener("keydown", handleEscape);

      close();
    }
  });

  render();
}

function registerSettingsMenu() {
  try {
    if (
      typeof GM !== "undefined" &&
      typeof GM.registerMenuCommand === "function"
    ) {
      GM.registerMenuCommand("Ustawienia Redmine Tree", openSettingsModal);

      return;
    }

    if (typeof GM_registerMenuCommand === "function") {
      GM_registerMenuCommand("Ustawienia Redmine Tree", openSettingsModal);
    }
  } catch {}
}

(async function () {
  "use strict";

  await loadSettings();

  await loadRuntimeState();

  await loadTreeState();

  setupSubtasks();

  setupCorrelatedTasks();

  colorTreeRows();

  initTreeCollapse();

  markRowsWithChildren();

  addTreeSearch();

  registerSettingsMenu();

  if (settings.tree.remember && treeState.initialized) {
    restoreCollapsedState();
  } else {
    applyDefaultTreeBehavior();
  }

  applyTreeFilters();
})();
