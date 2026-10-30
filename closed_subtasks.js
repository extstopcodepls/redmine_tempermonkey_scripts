// ==UserScript==
// @name         Redmine Closed Removed From Subtasks
// @namespace    https://github.com/extstopcodepls/redmine_closed_substasks_remover
// @version      2.0.0
// @description  Usuwa linki z podzagadnień, które są zamkniętetam
// @author       Paweł Borawski
// @match        https://redmine.x-code.pl/issues/*
// @grant        none
//
// @history      2.0.0 wtyczytwanie dzieci powiązanych - w opcji lazy i wszystkich
// @history      1.0.1 fix tresci przycisku
// @history      1.0.0 dodanie ustawień - dla każdego coś fajnego
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

  relations: {
    // subtasks: tylko bezposrednie dzieci; all: cale drzewo potomkow.
    loadMode: "subtasks",
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
  // Lista powiązań jest płaska, więc zapisujemy jej zwinięcie osobno.
  relationsInitialized: false,
  relationsCollapsed: false,
};

const TREE_SELECTOR = "#issue_tree";

let settings = deepClone(DEFAULT_SETTINGS);
let runtimeState = deepClone(DEFAULT_RUNTIME_STATE);
let treeState = deepClone(DEFAULT_TREE_STATE);
let quickSettingsSave = Promise.resolve();
let relationsRefreshInProgress = false;

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

  if (source.relations &&
      ["subtasks", "all"].includes(source.relations.loadMode)) {
    result.relations.loadMode = source.relations.loadMode;
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

  await quickSettingsSave;
  await setStoredValue(getScopeModeKey(), normalized.scope);
  await setStoredValue(getSettingsKey(normalized.scope), normalized);

  settings = normalized;
}

function setRelatedLoadMode(mode) {
  // Zmiana w pasku sterowania działa bez przeładowywania strony.
  // Kolejka zapisu chroni przed wyścigiem przy szybkim przełączaniu.
  settings.relations.loadMode = mode === "all" ? "all" : "subtasks";
  quickSettingsSave = quickSettingsSave.then(() =>
    setStoredValue(getSettingsKey(settings.scope), normalizeSettings(settings)),
  );
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

  treeState.relationsInitialized = treeState.relationsInitialized === true;
  treeState.relationsCollapsed = treeState.relationsCollapsed === true;
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

function getRelations() {
  return document.querySelector("#relations");
}

function getIssueRows(section) {
  // Ograniczenie do tbody zapobiega filtrowaniu nagłówków tabel.
  return section?.querySelectorAll("table.list.issues tbody tr") ?? [];
}

function getTreeRows() {
  return getIssueRows(getTree());
}

function getRelatedRows() {
  return getIssueRows(getRelations());
}


// Kazde zrodlo danych zwraca jednolity model:
// { id, parentId, depth, title, url, classes, cells }.
// Dodatkowe zrodlo (np. interfejs programowania aplikacji) wystarczy
// w przyszlosci zarejestrowac tutaj bez zmiany renderowania.
const issueChildrenCache = new Map();

const ISSUE_CHILDREN_SOURCES = {
  "html-direct": {
    load: loadDirectChildrenFromIssueList,
  },
  "html-tree": {
    load: loadAllChildrenFromIssuePage,
  },
};

function getIssueChildrenSource(loadMode) {
  return loadMode === "all" ? "html-tree" : "html-direct";
}

function getIssueReference(link, baseUrl = location.href) {
  if (!link) {
    return null;
  }

  try {
    const url = new URL(link.getAttribute("href"), baseUrl);
    const match = url.pathname.match(/\/issues\/(\d+)\/?$/);

    // Nie pobieramy z innych serwerow, nawet gdy link wskazuje zagadnienie.
    if (url.origin !== location.origin || !match) {
      return null;
    }

    return {
      id: match[1],
      url: url.origin + url.pathname,
    };
  } catch {
    return null;
  }
}

async function fetchIssueHtml(url, view) {
  const requestUrl = new URL(url, location.href);
  if (requestUrl.origin !== location.origin) {
    throw new Error("Zapytanie prowadzi do innej domeny.");
  }

  const response = await fetch(requestUrl.href, {
    method: "GET",
    credentials: "same-origin",
    redirect: "follow",
    headers: { Accept: "text/html,application/xhtml+xml" },
  });

  if (!response.ok) {
    throw new Error(`Błąd HTTP ${response.status}`);
  }

  const finalUrl = new URL(response.url, requestUrl.href);
  if (finalUrl.origin !== location.origin) {
    throw new Error("Strona przekierowała do innej domeny.");
  }

  if (!/html/i.test(response.headers.get("content-type") || "")) {
    throw new Error("Serwer nie zwrócił strony HTML.");
  }

  const parsed = new DOMParser().parseFromString(
    await response.text(), "text/html",
  );

  // Strony logowania, bledow i przekierowania nie sa pusta lista dzieci.
  if (view === "issue") {
    const isIssuePage =
      (parsed.body?.classList.contains("controller-issues") &&
        parsed.body?.classList.contains("action-show")) ||
      Boolean(parsed.querySelector("#content .issue.details"));

    if (!isIssuePage) {
      throw new Error("Nie otrzymano strony zagadnienia (sesja lub uprawnienia).");
    }
  } else if (view === "list") {
    const isIssueList =
      (parsed.body?.classList.contains("controller-issues") &&
        parsed.body?.classList.contains("action-index")) ||
      Boolean(parsed.querySelector("#query_form")) ||
      Boolean(parsed.querySelector("#content table.list.issues"));

    if (!isIssueList) {
      throw new Error("Nie otrzymano listy zagadnień (sesja lub uprawnienia).");
    }
  }

  return parsed;
}

function mapIssueRow(row, reference, parentId, depth, title) {
  return {
    id: reference.id,
    parentId,
    depth,
    title,
    url: reference.url,
    classes: [...row.classList].filter((className) =>
      /^(?:closed|private|overdue|odd|even|tracker-\d+|status-\d+|priority-\d+|project-[\w-]+)$/.test(className),
    ),
    cells: [...row.querySelectorAll("td")].map((td) => ({
      classes: [...td.classList],
      text: (td.textContent || "").trim(),
    })),
  };
}

// Tryb Wszystkie: widok /issues/ID, bez paginacji, w kolejnosci drzewa.
async function loadAllChildrenFromIssuePage(issue) {
  const htmlDocument = await fetchIssueHtml(issue.url, "issue");
  return parseIssueChildrenFromHtml(htmlDocument, issue);
}

function parseIssueChildrenFromHtml(htmlDocument, issue) {
  const rows = [
    ...htmlDocument.querySelectorAll("#issue_tree table.list.issues tr.issue"),
  ];
  const ancestors = [];
  const children = [];
  const firstLevel = rows.reduce(
    (minDepth, row) => Math.min(minDepth, getDepth(row)), Infinity,
  );

  for (const row of rows) {
    const nativeDepth = getDepth(row);
    const cell = row.querySelector("td.subject");
    const link = cell?.querySelector('a[href*="/issues/"]') ??
      row.querySelector('a[href*="/issues/"]');
    const reference = getIssueReference(link, issue.url);

    if (!reference) {
      continue;
    }

    while (ancestors.length &&
      ancestors[ancestors.length - 1].depth >= nativeDepth) {
      ancestors.pop();
    }

    const parentId = ancestors.length
      ? ancestors[ancestors.length - 1].id
      : issue.id;

    // Na stronie zagadnienia Redmine temat jest zwykle poza znacznikiem <a>.
    const subjectText = (cell?.textContent || "").replace(/\s+/g, " ").trim();
    const fallbackText = (link?.getAttribute("title") ||
      link?.textContent || `#${reference.id}`).replace(/\s+/g, " ").trim();

    children.push(mapIssueRow(
      row,
      reference,
      parentId,
      nativeDepth - firstLevel + 1,
      subjectText || fallbackText,
    ));

    ancestors.push({ depth: nativeDepth, id: reference.id });
  }

  return children;
}

// Tryb Podzagadnienia: dedykowany filtr listy /issues?parent_id=ID.
// Zapytanie uzywa tej samej sesji, ale set_filter=1 moze nadpisac
// zapamietany filtr strony /issues w Redmine.
function getDirectChildrenListUrl(issue) {
  const url = new URL(issue.url, location.href);
  const issuePath = /\/issues\/\d+\/?$/;
  if (url.origin !== location.origin || !issuePath.test(url.pathname)) {
    throw new Error("Nieprawidłowy adres zagadnienia.");
  }

  url.pathname = url.pathname.replace(issuePath, "/issues");
  url.search = "";
  url.hash = "";
  url.searchParams.set("set_filter", "1");
  url.searchParams.set("parent_id", String(issue.id));
  url.searchParams.set("status_id", "*");

  // Niezaleznie od konfiguracji kolumn listy potrzebujemy pelnego
  // tematu, typu i statusu. Pozostale kolumny sa opcjonalne.
  for (const column of ["tracker", "subject", "status", "priority", "assigned_to"]) {
    url.searchParams.append("c[]", column);
  }

  return url;
}

function parseDirectChildrenFromIssueList(htmlDocument, issue, baseUrl) {
  const table = htmlDocument.querySelector("#content table.list.issues") ??
    htmlDocument.querySelector("table.list.issues");

  if (!table) {
    if (htmlDocument.querySelector("#content .nodata")) {
      return [];
    }

    throw new Error("Nie znaleziono tabeli zagadnień na pobranej stronie.");
  }

  const children = [];
  for (const row of table.querySelectorAll("tbody tr.issue")) {
    const subject = row.querySelector("td.subject");
    const link = subject?.querySelector('a[href*="/issues/"]') ??
      row.querySelector('a[href*="/issues/"]');
    const reference = getIssueReference(link, baseUrl);

    if (!reference || !subject) {
      throw new Error("Nie można odczytać tematu zagadnienia z tabeli Redmine.");
    }

    const rawTitle = (subject.textContent || "").replace(/\s+/g, " ").trim();
    const tracker = (row.querySelector("td.tracker")?.textContent || "")
      .replace(/\s+/g, " ").trim();
    const hasIssueNumber = new RegExp(`(?:^|\\s)#${reference.id}(?=\\D|$)`).test(rawTitle);
    const title = hasIssueNumber
      ? rawTitle
      : `${tracker ? `${tracker} ` : ""}#${reference.id}: ${rawTitle}`;

    children.push(mapIssueRow(row, reference, issue.id, 1, title));
  }

  return children;
}

function getNextDirectChildrenPage(documentHtml, baseUrl) {
  const anchor = documentHtml.querySelector(
    '.pagination li.next.page a[href], .pagination a.next[href], .pagination a[rel="next"][href]',
  );
  if (!anchor) {
    return null;
  }

  const linkUrl = new URL(anchor.getAttribute("href"), baseUrl);
  const page = Number(linkUrl.searchParams.get("page"));
  if (linkUrl.origin !== location.origin || !Number.isSafeInteger(page) || page < 2) {
    throw new Error("Nieprawidłowy adres kolejnej strony zagadnień.");
  }

  // Kazda strona dostaje pelny filtr, nie polegamy na stanie sesji.
  const nextUrl = new URL(baseUrl);
  nextUrl.searchParams.set("page", String(page));
  return nextUrl;
}

async function loadDirectChildrenFromIssueList(issue) {
  const baseUrl = getDirectChildrenListUrl(issue);
  const seenPages = new Set();
  const seenIssues = new Set();
  const children = [];
  let nextUrl = baseUrl;

  while (nextUrl) {
    if (seenPages.has(nextUrl.href) || seenPages.size >= 1000) {
      throw new Error("Przerwano pobieranie: pętla lub zbyt wiele stron wyników.");
    }

    seenPages.add(nextUrl.href);
    const htmlDocument = await fetchIssueHtml(nextUrl, "list");
    const pageChildren = parseDirectChildrenFromIssueList(
      htmlDocument, issue, nextUrl.href,
    );

    for (const child of pageChildren) {
      if (!seenIssues.has(child.id)) {
        seenIssues.add(child.id);
        children.push(child);
      }
    }

    nextUrl = getNextDirectChildrenPage(htmlDocument, baseUrl);
  }

  return children;
}

async function loadIssueChildren(
  issue,
  options = { loadMode: settings.relations.loadMode },
  source = null,
) {
  const loadMode = options.loadMode === "all" ? "all" : "subtasks";
  const sourceName = source ?? getIssueChildrenSource(loadMode);
  const provider = ISSUE_CHILDREN_SOURCES[sourceName];

  if (!provider || typeof provider.load !== "function") {
    throw new Error("Nieznane źródło danych zagadnień.");
  }

  const cacheKey = `${sourceName}:${issue.url}`;
  if (options.forceRefresh === true) {
    // „Odśwież” musi wykonać nowe żądanie, także po wcześniejszym pobraniu.
    issueChildrenCache.delete(cacheKey);
  }

  if (!issueChildrenCache.has(cacheKey)) {
    const task = Promise.resolve().then(() => provider.load(issue, { ...options, loadMode }));
    issueChildrenCache.set(cacheKey, task);
    task.catch(() => {
      if (issueChildrenCache.get(cacheKey) === task) {
        issueChildrenCache.delete(cacheKey);
      }
    });
  }

  return issueChildrenCache.get(cacheKey);
}

function getRelatedRootRows() {
  return [...getRelatedRows()].filter((row) =>
    !row.classList.contains("tm-related-child"),
  );
}

function findRelatedSubjectLink(row) {
  return row.querySelector('td.subject a[href*="/issues/"]') ??
    row.querySelector('a[href*="/issues/"]');
}

function getRelatedSubjectCell(row) {
  const link = findRelatedSubjectLink(row);
  return link?.closest("td.subject") ?? link?.closest("td") ?? null;
}

function ensureRelatedIssueControl(row) {
  // W trybie Wszystkie potomkowie sa juz wyrenderowani, wiec uzywamy
  // dla nich zwyklego, lokalnego zwijania zamiast kolejnych zapytan.
  if (row.classList.contains("tm-related-child") &&
      (row.dataset.tmRelatedLoadMode || settings.relations.loadMode) === "all") {
    return;
  }

  const link = findRelatedSubjectLink(row);
  const issue = getIssueReference(link);
  const subject = getRelatedSubjectCell(row);

  if (!issue || !subject) {
    return;
  }

  row.dataset.tmRelatedIssueId = issue.id;
  subject.classList.add("tm-related-clickable");
  subject.title = "Kliknij tytuł, aby pobrać lub zwinąć podzadania";
  // Pozbywamy się starej, zbędnej strzałki ↗ również przy ponownej inicjalizacji.
  subject.querySelectorAll(".tm-related-open-link").forEach((element) => element.remove());

  if (!subject.querySelector(".tm-remote-marker")) {
    const marker = document.createElement("span");
    marker.className = "tm-remote-marker tree-toggle-marker";
    marker.title = "Pokaż podzadania tego powiązanego zagadnienia";
    marker.setAttribute("role", "button");
    marker.setAttribute("tabindex", "0");
    marker.setAttribute("aria-label", "Pokaż lub ukryj podzadania");
    link.before(marker);
  }

  // Zarówno kliknięcie samego linku, jak i tytułu będącego tekstem
  // obok linku, obsługuje delegowany handleRowClick().
  updateRelatedIssueMarker(row);
}

function updateRelatedIssueMarker(row) {
  const marker = row.querySelector(".tm-remote-marker");
  if (!marker) {
    return;
  }

  const state = row.dataset.tmRemoteRefreshing === "true"
    ? "loading"
    : row.dataset.tmRemoteState || "idle";
  marker.textContent = state === "loading" ? "…" :
    state === "error" ? "!" :
      state === "empty" ? "·" :
        row.dataset.collapsed === "false" ? "▼" : "▶";
  marker.setAttribute("aria-expanded", String(row.dataset.collapsed === "false"));
  // Lokalna funkcja setCollapsed ustawia bialy kolor dla zwyklego drzewa.
  // Zdalne znaczniki powiazan musza pozostac widoczne na jasnym tle.
  marker.style.color = "#467aa7";
}

function setRelatedRowMessage(row, message, isError = false) {
  const subject = findRelatedSubjectLink(row)?.closest("td");
  if (!subject) {
    return;
  }

  let status = subject.querySelector(".tm-remote-status");
  if (!status) {
    status = document.createElement("span");
    status.className = "tm-remote-status";
    status.setAttribute("role", "status");
    subject.append(status);
  }

  status.textContent = message;
  status.classList.toggle("tm-remote-error", isError);
  status.hidden = !message;
}

function getRelatedChildColumnText(child, templateCell, position) {
  const excluded = new Set(["checkbox", "subject", "buttons"]);
  const wanted = [...templateCell.classList].filter((name) => !excluded.has(name));

  const matching = child.cells.find((cell) =>
    wanted.some((name) => cell.classes.includes(name)),
  );

  if (matching) {
    return matching.text;
  }

  // Jeżeli kolumna ma nazwę, nie podstawiamy wartości obcej kolumny.
  if (wanted.length) {
    return "";
  }

  const positional = child.cells[position];
  return positional?.text || "";
}

function renderRelatedChildren(rootRow, children, loadMode = settings.relations.loadMode) {
  const fragment = document.createDocumentFragment();
  const renderedRows = [];
  const templateCells = [...rootRow.cells];
  const rootId = rootRow.id || `related-${rootRow.dataset.tmRelatedIssueId}`;
  const parentDepth = getDepth(rootRow);

  children.forEach((child, index) => {
    const row = document.createElement("tr");
    const depth = Math.max(1, Math.min(parentDepth + child.depth, 30));

    row.className = [
      "issue", "tm-related-child", "idnt", `idnt-${depth}`,
      `issue-${child.id}`, ...child.classes,
    ].join(" ");

    row.id = `tm-child-${rootId}-${child.id}-${index}`;
    row.dataset.tmRelatedOwner = rootId;
    row.dataset.tmIssueId = child.id;
    row.dataset.tmParentIssueId = child.parentId;
    row.dataset.tmRelatedLoadMode = loadMode;
    row.dataset.collapsed = "false";

    templateCells.forEach((templateCell, position) => {
      const td = document.createElement("td");
      td.className = templateCell.className;

      if (templateCell.classList.contains("subject") ||
          (position === 1 && !templateCells.some((cell) => cell.classList.contains("subject")))) {
        td.classList.add("subject");
        td.style.paddingLeft = `${8 + 16 * depth}px`;
        td.style.backgroundImage = "none";

        const anchor = document.createElement("a");
        anchor.href = child.url;
        anchor.textContent = child.title;
        anchor.title = loadMode === "subtasks"
          ? "Pobierz podzadania (Ctrl+klik otwiera zagadnienie)"
          : "Otwórz zagadnienie";
        td.append(anchor);
      } else if (!templateCell.classList.contains("checkbox") &&
                 !templateCell.classList.contains("buttons")) {
        td.textContent = getRelatedChildColumnText(child, templateCell, position);
      }

      row.append(td);
    });

    fragment.append(row);
    renderedRows.push(row);
  });

  rootRow.after(fragment);

  // W trybie Podzagadnienia kazdy doczytany wiersz moze byc
  // kolejnym rodzicem. Klikniecie pobierze jego bezposrednie dzieci.
  if (loadMode === "subtasks") {
    renderedRows.forEach(ensureRelatedIssueControl);
  }
}

async function fetchAndRenderRelatedChildren(row, { loadMode, forceRefresh = false } = {}) {
  const issue = getIssueReference(findRelatedSubjectLink(row));
  if (!issue || !row.isConnected || row.dataset.tmRemoteState === "loading" ||
      row.dataset.tmRemoteRefreshing === "true") {
    return false;
  }

  const mode = loadMode === "all" ? "all" : "subtasks";
  const previousState = row.dataset.tmRemoteState || "idle";

  if (forceRefresh) {
    // Podczas odświeżania stare dzieci pozostają widoczne aż do sukcesu.
    row.dataset.tmRemoteRefreshing = "true";
  } else {
    row.dataset.tmRemoteState = "loading";
  }

  updateRelatedIssueMarker(row);
  setRelatedRowMessage(row, forceRefresh ? "Odświeżanie podzadań…" : "Pobieranie podzadań…");

  try {
    const children = await loadIssueChildren(issue, { loadMode: mode, forceRefresh });

    // Redmine mogło w międzyczasie podmienić tabelę powiązań.
    if (!row.isConnected) {
      return false;
    }

    // Usuwamy wszystkie stare poziomy danej gałęzi, ale nigdy kolejne
    // główne powiązanie. Dzieci wymieniamy dopiero po udanym pobraniu.
    if (forceRefresh) {
      getDescendantRows(row)
        .filter((child) => child.classList.contains("tm-related-child"))
        .forEach((child) => child.remove());
    }

    if (children.length) {
      renderRelatedChildren(row, children, mode);
      row.dataset.tmRemoteState = "loaded";
      row.dataset.tmLoadedMode = mode;
      // Zwijanie podczas pobierania nie może zostać cofnięte przez wynik.
      if (!forceRefresh) {
        row.dataset.collapsed = "false";
      }
      setRelatedRowMessage(row, "");
    } else {
      row.dataset.tmRemoteState = "empty";
      row.dataset.tmLoadedMode = mode;
      row.dataset.collapsed = "true";
      setRelatedRowMessage(row, "Brak podzadań.");
    }

    delete row.dataset.tmRemoteRefreshing;
    updateRelatedIssueMarker(row);
    ensureClosedToggle(getRelations(), "tm-relations-closed-toggle");
    markRowsWithChildren();
    colorTreeRows();
    applyAllFilters();
    return true;
  } catch (error) {
    if (!row.isConnected) {
      return false;
    }

    row.dataset.tmRemoteState = forceRefresh ? previousState : "error";
    delete row.dataset.tmRemoteRefreshing;
    setRelatedRowMessage(
      row,
      `${error.message || "Nie udało się pobrać podzadań."} Spróbuj ponownie.`,
      true,
    );
    updateRelatedIssueMarker(row);
    applyRelatedFilters();
    return false;
  }
}

async function toggleRelatedIssue(row) {
  if (row.dataset.tmRemoteState === "loading" ||
      row.dataset.tmRemoteRefreshing === "true") {
    return;
  }

  if (row.dataset.tmRemoteState === "loaded") {
    row.dataset.collapsed = String(row.dataset.collapsed !== "true");
    updateRelatedIssueMarker(row);
    applyRelatedFilters();
    return;
  }

  if (row.dataset.tmRemoteState === "empty") {
    setRelatedRowMessage(row, "Brak podzadań.");
    return;
  }

  await fetchAndRenderRelatedChildren(row, { loadMode: settings.relations.loadMode });
}

async function refreshExpandedRelatedRoots(refreshButton) {
  if (relationsRefreshInProgress) {
    return;
  }

  // Tylko już rozwinięte, faktycznie widoczne, GŁÓWNE powiązania.
  // Nie pobieramy niewczytanych ani zwiniętych gałęzi.
  const roots = getRelatedRootRows().filter((row) =>
    row.dataset.tmRemoteState === "loaded" &&
    row.dataset.collapsed === "false" &&
    row.getClientRects().length > 0 &&
    getComputedStyle(row).display !== "none",
  );
  const status = getRelations()?.querySelector(".tm-relations-refresh-status");

  if (!roots.length) {
    if (status) {
      status.textContent = "Brak widocznych, rozwiniętych powiązań.";
    }
    return;
  }

  const mode = settings.relations.loadMode;
  const modeSelect = getRelations()?.querySelector(".tm-relations-load-mode");
  relationsRefreshInProgress = true;
  refreshButton.disabled = true;
  if (modeSelect) {
    modeSelect.disabled = true;
  }

  let completed = 0;
  let succeeded = 0;
  // Ograniczamy liczbę równoległych żądań do trzech.
  const queue = [...roots];

  async function worker() {
    while (queue.length) {
      const row = queue.shift();
      const ok = await fetchAndRenderRelatedChildren(row, {
        loadMode: mode,
        forceRefresh: true,
      });
      completed++;
      if (ok) {
        succeeded++;
      }
      if (status?.isConnected) {
        status.textContent = `Odświeżanie: ${completed}/${roots.length}`;
      }
    }
  }

  try {
    refreshButton.textContent = "Odświeżanie…";
    if (status) {
      status.textContent = `Odświeżanie: 0/${roots.length}`;
    }
    await Promise.all(
      Array.from({ length: Math.min(3, roots.length) }, () => worker()),
    );
    if (status?.isConnected) {
      status.textContent = succeeded === roots.length
        ? `Odświeżono ${succeeded} powiązanych zagadnień.`
        : `Odświeżono ${succeeded}/${roots.length}. Pozostałe: błąd pobierania.`;
    }
  } finally {
    relationsRefreshInProgress = false;
    refreshButton.disabled = false;
    refreshButton.textContent = "Odśwież";
    if (modeSelect?.isConnected) {
      modeSelect.disabled = false;
    }
  }
}

function getDepth(tr) {
  const depthClass = [...tr.classList].find((className) =>
    /^idnt-\d+$/.test(className),
  );

  return depthClass ? Number(depthClass.slice(5)) : 0;
}

function isIndented(tr) {
  return getDepth(tr) > 0;
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
  // Zgodnie z dawnym zachowaniem wymuszamy widoczność zamkniętego wiersza.
  tr.style.display = visible ? (isClosed(tr) ? "table-row" : "") : "none";
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
  // Kolorujemy tylko podzadania i powiązane zagadnienia, nie pozostałe tabele.
  [...getTreeRows(), ...getRelatedRows()].forEach((tr) => {
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
  for (const tr of [...getTreeRows(), ...getRelatedRows()]) {
    // Powiązania główne pobieramy na żądanie, bez sprawdzania dzieci z góry.
    if (!tr.closest(TREE_SELECTOR) &&
        !tr.classList.contains("tm-related-child")) {
      continue;
    }

    if (!hasDirectChildren(tr)) {
      continue;
    }

    tr.classList.add("has-children");
    const subject = tr.querySelector("td.subject") ?? tr.querySelectorAll("td")[1];

    if (!subject || subject.querySelector(".tree-toggle-marker")) {
      continue;
    }

    const marker = document.createElement("span");
    marker.className = "tree-toggle-marker";
    marker.textContent = tr.dataset.collapsed === "true" ? "▶" : "▼";
    marker.style.marginRight = "6px";
    marker.style.cursor = "pointer";
    marker.style.color = "#467aa7";
    marker.setAttribute("role", "button");
    marker.setAttribute("tabindex", "0");
    marker.setAttribute("aria-label", "Zwiń lub rozwiń gałąź");
    subject.prepend(marker);
  }
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
    ...treeState,
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
      ...treeState,
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
  if (!(event.target instanceof Element) || event.button !== 0 ||
      event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
    return;
  }

  const tr = event.target.closest("tr.issue");
  if (!tr) {
    return;
  }

  const inRelated = Boolean(tr.closest("#relations"));
  const inTree = Boolean(tr.closest(TREE_SELECTOR));
  if (!inRelated && !inTree) {
    return;
  }

  if (inRelated &&
      (!tr.classList.contains("tm-related-child") ||
        (tr.dataset.tmRelatedLoadMode || settings.relations.loadMode) === "subtasks")) {
    const subject = getRelatedSubjectCell(tr);
    const issueLink = findRelatedSubjectLink(tr);

    // Temat Redmine często jest tekstem POZA linkiem (link obejmuje
    // jedynie typ i numer). Kliknięcie w dowolne miejsce komórki tematu
    // ma więc taki sam efekt jak kliknięcie w link lub wskaźnik ▶.
    if (!subject || !subject.contains(event.target)) {
      return;
    }

    // Inne linki i przyciski w komórce zachowują swoje własne działanie.
    const interactive = event.target.closest(
      "a, button, input, select, textarea, label",
    );
    if (interactive && interactive !== issueLink) {
      return;
    }

    event.preventDefault();
    void toggleRelatedIssue(tr);
    return;
  }

  // Dla pobranych podzadań tytuł pozostaje zwykłym odnośnikiem.
  if (event.target.closest("a, button, input, select, textarea, label")) {
    return;
  }

  if (!hasDirectChildren(tr)) {
    return;
  }

  setCollapsed(tr, tr.dataset.collapsed !== "true");

  if (inRelated) {
    applyRelatedFilters();
  } else {
    updateTreeStateFromDom();
    applyTreeFilters();
  }
}

function handleToggleKeyboard(event) {
  if (!(event.target instanceof Element) ||
      !event.target.matches(".tree-toggle-marker")) {
    return;
  }

  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    event.target.click();
  }
}

function clearSearchHighlights() {
  for (const section of [getTree(), getRelations()]) {
    section?.querySelectorAll(".tm-search-highlight").forEach((mark) => {
      mark.replaceWith(document.createTextNode(mark.textContent));
    });

    section?.normalize();
  }
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

function hasActiveFilters() {
  return Boolean(getSelectedType() || runtimeState.search.trim());
}

function canDisplayClosedRow(tr, showClosed, filteringActive) {
  if (!isClosed(tr)) {
    return true;
  }

  if (!showClosed) {
    return false;
  }

  return !filteringActive || !settings.filtering.hideClosedRows;
}

function highlightSearchInRow(tr, phrase) {
  if (!phrase || !settings.search.highlight) {
    return;
  }

  tr.querySelectorAll("td").forEach((td) => {
    if (rowMatchesSearch(td, phrase)) {
      highlightText(td, phrase);
    }
  });
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
    if (!canDisplayClosedRow(tr, runtimeState.showClosedSubtasks, true)) {
      return;
    }

    if ((selectedType && !rowMatchesType(tr, selectedType)) ||
        !rowMatchesSearch(tr, phrase)) {
      return;
    }

    rowsToShow.add(tr);

    if ((hasTypeFilter && settings.filtering.showParents) ||
        (hasSearch && settings.search.showParents)) {
      getAncestors(tr).forEach((parent) => {
        if (canDisplayClosedRow(parent, runtimeState.showClosedSubtasks, true)) {
          rowsToShow.add(parent);
        }
      });
    }

    highlightSearchInRow(tr, phrase);
  });

  rows.forEach((tr) => {
    setRowVisible(tr, rowsToShow.has(tr));
  });
}

function setRelatedCollapsed(collapsed) {
  // Zwijamy tylko juz pobrane galezie. Glowna lista powiazan
  // zawsze pozostaje widoczna (o ile nie ukrywa jej filtr).
  treeState.relationsInitialized = true;
  treeState.relationsCollapsed = collapsed;

  getRelatedRows().forEach((row) => {
    const loadedRoot = row.dataset.tmRemoteState === "loaded";
    const childWithChildren =
      row.classList.contains("tm-related-child") && hasDirectChildren(row);

    if (!loadedRoot && !childWithChildren) {
      return;
    }

    setCollapsed(row, collapsed);
    if (loadedRoot) {
      updateRelatedIssueMarker(row);
    }
  });

  void saveTreeState();
  applyRelatedFilters();
}

function applyRelatedFilters() {
  const selectedType = getSelectedType();
  const phrase = runtimeState.search.trim();
  const hasTypeFilter = Boolean(selectedType);
  const hasSearch = Boolean(phrase);
  const filteringActive = hasTypeFilter || hasSearch;
  const showClosed = runtimeState.showClosedRelations;
  const rows = [...getRelatedRows()];
  const rowsToShow = new Set();

  if (filteringActive) {
    rows.forEach((tr) => {
      if (!canDisplayClosedRow(tr, showClosed, true) ||
          (selectedType && !rowMatchesType(tr, selectedType)) ||
          !rowMatchesSearch(tr, phrase)) {
        return;
      }

      const ancestors = getAncestors(tr);
      const hiddenByCollapsedAncestor =
        tr.classList.contains("tm-related-child") &&
        ancestors.some((parent) => parent.dataset.collapsed === "true");

      // Filtr nie odkrywa zwiniętych dzieci, ale moze nadal
      // pokazac ich pasujacego rodzica, zeby dalo sie rozwinac galaz.
      if (!hiddenByCollapsedAncestor) {
        rowsToShow.add(tr);
      }
      if ((hasTypeFilter && settings.filtering.showParents) ||
          (hasSearch && settings.search.showParents)) {
        ancestors.forEach((ancestor) => {
          if (canDisplayClosedRow(ancestor, showClosed, true)) {
            rowsToShow.add(ancestor);
          }
        });
      }
    });
  } else {
    rows.forEach((tr) => {
      if (!canDisplayClosedRow(tr, showClosed, false)) {
        return;
      }

      // Wiersze glowne pozostaja widoczne po kliknieciu 'Zwin'.
      if (!tr.classList.contains("tm-related-child")) {
        rowsToShow.add(tr);
        return;
      }

      // Tylko potomkow ukrywaja zwiniete galezie.
      const ancestors = getAncestors(tr);
      const canShow = ancestors.length > 0 && ancestors.every((ancestor) =>
        canDisplayClosedRow(ancestor, showClosed, false) &&
        ancestor.dataset.collapsed !== "true" &&
        (ancestor.classList.contains("tm-related-child") ||
          ancestor.dataset.tmRemoteState === "loaded"),
      );

      if (canShow) {
        rowsToShow.add(tr);
      }
    });
  }

  rows.forEach((tr) => {
    const visible = rowsToShow.has(tr);
    setRowVisible(tr, visible);
    if (visible && hasSearch) {
      highlightSearchInRow(tr, phrase);
    }
  });
}

function applyAllFilters() {
  clearSearchHighlights();
  applyTreeFilters();
  applyRelatedFilters();
  updateClosedToggle("#issue_tree", "tm-subtasks-closed-toggle",
    runtimeState.showClosedSubtasks, showSubtasks, hideSubtasks);
  updateClosedToggle("#relations", "tm-relations-closed-toggle",
    runtimeState.showClosedRelations, showCorrelatedTasks, hideCorrelatedTasks);
}

function getAllSubtasksRows() {
  return [...getTreeRows()].filter(isClosed);
}

function updateClosedToggle(selector, className, visible, show, hide) {
  const section = document.querySelector(selector);
  const toggle = section?.querySelector(`.${className}`);

  if (!toggle) {
    return;
  }

  const closedCount = [...getIssueRows(section)].filter(isClosed).length;
  toggle.textContent = visible
    ? " - Schowaj zamknięte - "
    : ` - ${closedCount} zamkniętych. (pokaż)`;
  toggle.onclick = visible ? hide : show;
}

function ensureClosedToggle(section, className) {
  const header = section?.querySelector(":scope > p");
  const count = [...getIssueRows(section)].filter(isClosed).length;
  const existing = section?.querySelector(`.${className}`);

  if (!header || !count) {
    existing?.remove();
    return;
  }

  if (existing) {
    return;
  }

  const toggle = document.createElement("a");
  toggle.className = className;
  toggle.href = "#";
  toggle.style.cursor = "pointer";

  const title = header.querySelector("strong");
  if (title) {
    title.insertAdjacentElement("afterend", toggle);
  } else {
    header.prepend(toggle);
  }
}

function applySubtasksClosedVisibility(visible) {
  // Przy filtrowaniu decyduje applyTreeFilters(), a bez filtrów
  // respektujemy zwinięte gałęzie (również dla zamkniętych pozycji).
  if (!hasActiveFilters()) {
    getAllSubtasksRows().forEach((row) => {
      const ancestorsVisible = getAncestors(row).every((ancestor) =>
        ancestor.dataset.collapsed !== "true" &&
        (!isClosed(ancestor) || visible),
      );
      setRowVisible(row, visible && ancestorsVisible);
    });
  }

  updateClosedToggle("#issue_tree", "tm-subtasks-closed-toggle",
    visible, showSubtasks, hideSubtasks);
}

function showSubtasks(event) {
  event?.preventDefault();
  runtimeState.showClosedSubtasks = true;
  void saveRuntimeState();
  applyAllFilters();
}

function hideSubtasks(event) {
  event?.preventDefault();
  runtimeState.showClosedSubtasks = false;
  void saveRuntimeState();
  applyAllFilters();
}

function showCorrelatedTasks(event) {
  event?.preventDefault();
  runtimeState.showClosedRelations = true;
  void saveRuntimeState();
  applyAllFilters();
}

function hideCorrelatedTasks(event) {
  event?.preventDefault();
  runtimeState.showClosedRelations = false;
  void saveRuntimeState();
  applyAllFilters();
}

function setupSubtasks() {
  const tree = getTree();
  if (!tree || !getTreeRows().length) {
    return;
  }

  ensureSectionHeader(tree);
  ensureClosedToggle(tree, "tm-subtasks-closed-toggle");

  const linkElement = tree.querySelector(
    ":scope > p > span:not(.tm-tree-controls)",
  );
  if (linkElement &&
      !linkElement.previousElementSibling?.classList.contains("tm-tables-label")) {
    const label = document.createElement("strong");
    label.className = "tm-tables-label";
    label.textContent = "Tabele: ";
    linkElement.parentNode.insertBefore(label, linkElement);
  }
}

function setupCorrelatedTasks() {
  const section = getRelations();
  if (!section || !getRelatedRootRows().length) {
    return;
  }

  ensureSectionHeader(section);
  ensureClosedToggle(section, "tm-relations-closed-toggle");
}

function ensureSectionHeader(section) {
  let header = section.querySelector(":scope > p");

  if (!header) {
    header = document.createElement("p");
    section.prepend(header);
  }

  return header;
}

function rebuildTypeFilters() {
  const selectedExists = settings.types.some(
    (type) => type.id === runtimeState.selectedType && type.showInFilter,
  );

  if (!selectedExists) {
    runtimeState.selectedType = "";
  }

  document.querySelectorAll(
    "#issue_tree .tm-tree-type-filter, #relations .tm-tree-type-filter",
  ).forEach((select) => {
    select.replaceChildren();

    const all = document.createElement("option");
    all.value = "";
    all.textContent = "Wszystkie";
    select.append(all);

    settings.types.filter((type) => type.showInFilter).forEach((type) => {
      const option = document.createElement("option");
      option.value = type.id;
      option.textContent = type.name;
      select.append(option);
    });

    select.value = runtimeState.selectedType;
  });
}

function syncFilterControls() {
  document.querySelectorAll(
    "#issue_tree .tm-tree-type-filter, #relations .tm-tree-type-filter",
  ).forEach((select) => {
    select.value = runtimeState.selectedType;
  });

  document.querySelectorAll(
    "#issue_tree .tm-tree-search, #relations .tm-tree-search",
  ).forEach((input) => {
    input.value = runtimeState.search;
  });
}

function addTypeFilterControls(header) {
  if (header.querySelector(".tm-tree-type-filter")) {
    return;
  }

  const select = document.createElement("select");
  select.className = "tm-tree-type-filter";
  select.title = "Filtr typu (wspólny dla podzadań i powiązań)";
  select.style.marginLeft = "10px";

  select.addEventListener("change", () => {
    runtimeState.selectedType = select.value;
    syncFilterControls();
    void saveRuntimeState();
    applyAllFilters();
  });

  header.append(select);
}

function addSearchControls(header) {
  if (header.querySelector(".tm-tree-search")) {
    return;
  }

  const input = document.createElement("input");
  input.type = "search";
  input.className = "tm-tree-search";
  input.placeholder = "Szukaj...";
  input.title = "Wyszukiwanie (wspólne dla podzadań i powiązań)";
  input.style.marginLeft = "10px";
  input.value = runtimeState.search;

  input.addEventListener("input", () => {
    runtimeState.search = input.value;
    syncFilterControls();
    void saveRuntimeState();
    applyAllFilters();
  });

  header.append(input);
}

function addSectionControls(section, isTree) {
  if (!section || !getIssueRows(section).length) {
    return;
  }

  const header = ensureSectionHeader(section);
  const className = isTree ? "tm-tree-controls" : "tm-relations-controls";

  if (!header.querySelector(`.${className}`)) {
    const controls = document.createElement("span");
    controls.className = className;
    controls.style.marginLeft = "10px";

    const collapseLink = document.createElement("a");
    collapseLink.href = "#";
    collapseLink.textContent = "Zwiń";
    collapseLink.style.marginRight = "10px";

    const expandLink = document.createElement("a");
    expandLink.href = "#";
    expandLink.textContent = "Rozwiń";
    expandLink.style.marginRight = "10px";

    const settingsLink = document.createElement("a");
    settingsLink.href = "#";
    settingsLink.textContent = "Ustawienia";

    collapseLink.addEventListener("click", (event) => {
      event.preventDefault();
      if (isTree) {
        collapseAll();
        applySubtasksClosedVisibility(runtimeState.showClosedSubtasks);
      } else {
        setRelatedCollapsed(true);
      }
    });

    expandLink.addEventListener("click", (event) => {
      event.preventDefault();
      if (isTree) {
        showAll();
        applySubtasksClosedVisibility(runtimeState.showClosedSubtasks);
      } else {
        setRelatedCollapsed(false);
      }
    });

    settingsLink.addEventListener("click", (event) => {
      event.preventDefault();
      openSettingsModal();
    });

    controls.append(collapseLink, expandLink, settingsLink);

    if (!isTree) {
      const modeLabel = document.createElement("label");
      modeLabel.htmlFor = "tm-relations-load-mode-quick";
      modeLabel.textContent = "Wczytuj:";
      modeLabel.style.marginLeft = "12px";

      const modeSelect = document.createElement("select");
      modeSelect.id = "tm-relations-load-mode-quick";
      modeSelect.className = "tm-relations-load-mode";
      modeSelect.title = "Zakres pobierania potomków powiązanych zagadnień";
      modeSelect.style.marginLeft = "5px";

      for (const [value, label] of [
        ["subtasks", "Podzagadnienia"],
        ["all", "Wszystkie"],
      ]) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        modeSelect.append(option);
      }
      modeSelect.value = settings.relations.loadMode;
      modeSelect.addEventListener("change", () => {
        setRelatedLoadMode(modeSelect.value);
        const status = section.querySelector(".tm-relations-refresh-status");
        if (status) {
          status.textContent = "";
        }
        // Istniejące gałęzie zostają w bieżącym stanie.
        // „Odśwież” wczytuje je z nowo wybranego źródła.
      });

      const refreshButton = document.createElement("button");
      refreshButton.type = "button";
      refreshButton.className = "tm-relations-refresh";
      refreshButton.textContent = "Odśwież";
      refreshButton.title = "Ponownie pobierz dzieci widocznych, rozwiniętych głównych powiązań";
      refreshButton.style.marginLeft = "10px";
      refreshButton.addEventListener("click", () => {
        void refreshExpandedRelatedRoots(refreshButton);
      });

      const status = document.createElement("span");
      status.className = "tm-relations-refresh-status";
      status.setAttribute("role", "status");
      status.style.marginLeft = "8px";

      controls.append(modeLabel, modeSelect, refreshButton, status);
    }

    header.append(controls);
  }

  addTypeFilterControls(header);
  addSearchControls(header);
}

function refreshIssueSections() {
  setupSubtasks();
  setupCorrelatedTasks();
  addSectionControls(getTree(), true);
  addSectionControls(getRelations(), false);
  getRelatedRows().forEach(ensureRelatedIssueControl);
  rebuildTypeFilters();
  syncFilterControls();
  markRowsWithChildren();
  colorTreeRows();
  applyAllFilters();
}

function observeIssueSections() {
  // Redmine może podmieniać listę powiązań po operacji AJAX.
  // Reagujemy wyłącznie na dodanie/usunięcie wierszy lub całej tabeli.
  let scheduled = false;
  const observer = new MutationObserver((mutations) => {
    const relevant = mutations.some((mutation) => {
      const target = mutation.target instanceof Element
        ? mutation.target
        : mutation.target.parentElement;
      const inside = target?.closest("#issue_tree, #relations");

      return [...mutation.addedNodes, ...mutation.removedNodes].some((node) => {
        if (!(node instanceof Element)) {
          return false;
        }

        if (node.matches("#issue_tree, #relations") ||
            node.querySelector("#issue_tree, #relations")) {
          return true;
        }

        if (!inside) {
          return false;
        }

        return node.matches("table.list.issues, tbody, tr") ||
          Boolean(node.querySelector("table.list.issues, tbody tr"));
      });
    });

    if (relevant && !scheduled) {
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        refreshIssueSections();
      });
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}


function ensureSettingsStyles() {
  if (document.getElementById("tm-redmine-settings-style")) {
    return;
  }

  const style = document.createElement("style");

  style.id = "tm-redmine-settings-style";

  style.textContent = `
#relations .tm-related-child td.subject { background-image: none; }
#relations .tm-remote-marker {
    display: inline-block;
    min-width: 1.1em;
    margin-right: 6px;
    color: #467aa7;
    cursor: pointer;
    user-select: none;
    text-align: center;
}
#relations .tm-remote-marker:focus-visible,
#relations .tree-toggle-marker:focus-visible {
    outline: 2px solid #467aa7;
    outline-offset: 2px;
}
#relations tr.issue td.tm-related-clickable,
#relations tr.issue td.tm-related-clickable a[href*="/issues/"] {
    cursor: pointer;
}
#relations .tm-remote-status {
    margin-left: 8px;
    font-size: 90%;
    color: #666;
}
#relations .tm-remote-status.tm-remote-error { color: #ac2323; }
#relations .tm-relations-refresh {
    background: none;
    border: 0;
    padding: 0;
    color: #467aa7;
    text-decoration: underline;
    cursor: pointer;
    font: inherit;
}
#relations .tm-relations-refresh:disabled {
    opacity: 0.55;
    cursor: wait;
}
#relations .tm-relations-refresh-status {
    color: #666;
    font-size: 90%;
}
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

    draft.relations.loadMode = panel.querySelector(
      "#tm-setting-relations-load-mode",
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

<p>Konfiguracja kolorowania, typów, filtrów i wyszukiwania dotyczy zarówno podzadań, jak i powiązanych zagadnień. Filtr i fraza wyszukiwania są wspólne dla obu sekcji.</p>

<h3>Typy wierszy (podzadania i powiązania)</h3>

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
        Zmieniaj intensywność zależnie od poziomu (powiązane: poziom 0)
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

<h3>Drzewo i lista powiązanych</h3>

<div class="tm-settings-grid">
    <span>Pamięć:</span>

    <label class="tm-settings-check">
        <input
            type="checkbox"
            id="tm-setting-tree-remember"
        >
        Zapamiętuj zwinięte gałęzie i listę powiązanych
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

<h3>Pobieranie powiązanych zagadnień</h3>

<div class="tm-settings-grid">
    <label for="tm-setting-relations-load-mode">
        Wczytuj:
    </label>

    <select id="tm-setting-relations-load-mode">
        <option value="subtasks">
            Podzagadnienia
        </option>
        <option value="all">
            Wszystkie
        </option>
    </select>

    <span>Zakres:</span>
    <span>
        Podzagadnienia – lista /issues?parent_id=... z paginacją; kolejne poziomy na kliknięcie.
        Wszystkie – pełne drzewo z /issues/{id}, bez paginacji.
    </span>
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
        Resetuj zapisany stan widoku
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

    panel.querySelector("#tm-setting-relations-load-mode").value =
      draft.relations.loadMode;

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

  ensureSettingsStyles();
  // Faza przechwytywania: kliknięcia odnośników nie giną, nawet jeśli
  // skrypty motywu Redmine zatrzymają propagację zdarzenia.
  document.addEventListener("click", handleRowClick, true);
  document.addEventListener("keydown", handleToggleKeyboard);
  registerSettingsMenu();
  refreshIssueSections();
  observeIssueSections();
})();
