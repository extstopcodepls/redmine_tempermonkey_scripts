// ==UserScript==
// @name         Redmine Closed Removed From Subtasks
// @namespace    https://github.com/extstopcodepls/redmine_closed_substasks_remover
// @version      0.9
// @description  Usuwa linki z podzagadnień, które są zamkniętetam
// @author       Paweł Borawski
// @match        https://redmine.x-code.pl/issues/*
// @grant        none
//
// @history      0.9 dodanie kolorowania Uwagi oraz <select> zamiast przycisków do filtrowania. zapamiętanie wyfiltrowania
//
// ==/UserScript==

const STORAGE_PREFIX = 'redmine-tree';
const GLOBAL_STATE_KEY = `${STORAGE_PREFIX}:global:${location.host}`;
const PAGE_STATE_KEY = `${STORAGE_PREFIX}:page:${location.host}:${location.pathname}`;

const DEFAULT_GLOBAL_STATE = {
    typeFilter: '',
    showClosedSubtasks: false,
    showClosedRelations: false
};

const DEFAULT_PAGE_STATE = {
    search: '',
    collapsedIssues: []
};

let globalState = { ...DEFAULT_GLOBAL_STATE };
let pageState = { ...DEFAULT_PAGE_STATE };

async function getStoredValue(key, defaultValue) {
    try {
        if (typeof GM !== 'undefined' && typeof GM.getValue === 'function') {
            return await GM.getValue(key, defaultValue);
        }

        if (typeof GM_getValue === 'function') {
            return GM_getValue(key, defaultValue);
        }

        const value = localStorage.getItem(key);

        if (value === null) {
            return defaultValue;
        }

        return JSON.parse(value);
    } catch {
        return defaultValue;
    }
}

function setStoredValue(key, value) {
    try {
        if (typeof GM !== 'undefined' && typeof GM.setValue === 'function') {
            void GM.setValue(key, value);
            return;
        }

        if (typeof GM_setValue === 'function') {
            GM_setValue(key, value);
            return;
        }

        localStorage.setItem(key, JSON.stringify(value));
    } catch {
    }
}

async function loadPersistentState() {
    const storedGlobalState = await getStoredValue(
        GLOBAL_STATE_KEY,
        DEFAULT_GLOBAL_STATE
    );

    const storedPageState = await getStoredValue(
        PAGE_STATE_KEY,
        DEFAULT_PAGE_STATE
    );

    globalState = {
        ...DEFAULT_GLOBAL_STATE,
        ...storedGlobalState
    };

    pageState = {
        ...DEFAULT_PAGE_STATE,
        ...storedPageState
    };

    if (!Array.isArray(pageState.collapsedIssues)) {
        pageState.collapsedIssues = [];
    }
}

function saveGlobalState() {
    setStoredValue(GLOBAL_STATE_KEY, globalState);
}

function savePageState() {
    setStoredValue(PAGE_STATE_KEY, pageState);
}

function getAllSubtasksRows() {
    return document
        .querySelectorAll('#issue_tree table.list.issues tr.closed');
}

function applySubtasksClosedVisibility(visible) {
    const rows = getAllSubtasksRows();

    rows.forEach(row => {
        row.style.display = visible ? 'table-row' : 'none';
    });

    const toggle = document.querySelector(
        '#issue_tree .tm-subtasks-closed-toggle'
    );

    if (toggle) {
        if (visible) {
            toggle.innerHTML = " - Schowaj zamknięte - ";
            toggle.onclick = hideSubtasks;
        } else {
            toggle.innerHTML =
                " - " + rows.length + " zamkniętych. (pokaż)";
            toggle.onclick = showSubtasks;
        }
    }
}

function showSubtasks(event) {
    if (event) {
        event.preventDefault();
    }

    globalState.showClosedSubtasks = true;
    saveGlobalState();

    applySubtasksClosedVisibility(true);
}

function hideSubtasks(event) {
    if (event) {
        event.preventDefault();
    }

    globalState.showClosedSubtasks = false;
    saveGlobalState();

    applySubtasksClosedVisibility(false);
}

function setupSubtasks() {
    var toRemoveElements = getAllSubtasksRows();

    if (toRemoveElements.length) {
        var subTaskTitleElement =
            document.querySelectorAll('#issue_tree > p > strong')[0];

        var showHideElement = document.createElement("a");
        showHideElement.className = 'tm-subtasks-closed-toggle';
        showHideElement.style.cursor = "pointer";

        subTaskTitleElement.parentNode.insertBefore(
            showHideElement,
            subTaskTitleElement.nextSibling
        );

        var linkElement =
            document.querySelectorAll('#issue_tree > p > span')[0];

        if (linkElement) {
            var linkName = document.createElement("strong");
            linkName.innerText = "Tabele: ";
            linkElement.parentNode.insertBefore(linkName, linkElement);
        }

        applySubtasksClosedVisibility(
            globalState.showClosedSubtasks
        );
    }
}

function getAllCorrelatedTasksRows() {
    return document
        .querySelectorAll('#relations table.list.issues tr.closed');
}

function applyCorrelatedTasksClosedVisibility(visible) {
    const rows = getAllCorrelatedTasksRows();

    rows.forEach(row => {
        row.style.display = visible ? 'table-row' : 'none';
    });

    const toggle = document.querySelector(
        '#relations .tm-relations-closed-toggle'
    );

    if (toggle) {
        if (visible) {
            toggle.innerHTML = " - Schowaj zamknięte - ";
            toggle.onclick = hideCorrelatedTasks;
        } else {
            toggle.innerHTML =
                " - " + rows.length + " zamkniętych. (pokaż)";
            toggle.onclick = showCorrelatedTasks;
        }
    }
}

function showCorrelatedTasks(event) {
    if (event) {
        event.preventDefault();
    }

    globalState.showClosedRelations = true;
    saveGlobalState();

    applyCorrelatedTasksClosedVisibility(true);
}

function hideCorrelatedTasks(event) {
    if (event) {
        event.preventDefault();
    }

    globalState.showClosedRelations = false;
    saveGlobalState();

    applyCorrelatedTasksClosedVisibility(false);
}

function setupCorrelatedTasks() {
    var toRemoveElements = getAllCorrelatedTasksRows();

    if (toRemoveElements.length) {
        var subTaskTitleElement =
            document.querySelectorAll('#relations > p > strong')[0];

        var showHideElement = document.createElement("a");
        showHideElement.className = 'tm-relations-closed-toggle';
        showHideElement.style.cursor = "pointer";

        subTaskTitleElement.parentNode.insertBefore(
            showHideElement,
            subTaskTitleElement.nextSibling
        );

        var linkElement =
            document.querySelectorAll('#relations > p > span')[0];

        if (linkElement) {
            var linkName = document.createElement("strong");
            linkName.innerText = "Tabele: ";
            linkElement.parentNode.insertBefore(linkName, linkElement);
        }

        applyCorrelatedTasksClosedVisibility(
            globalState.showClosedRelations
        );
    }
}

function colorTreeRows() {
    document.querySelectorAll('tr').forEach(tr => {
        const text = tr.textContent;

        if (
            !text.includes('Błąd') &&
            !text.includes('Zadanie') &&
            !text.includes('Uwaga')
        ) {
            return;
        }

        const depthClass = [...tr.classList]
            .find(c => /^idnt-\d+$/.test(c));

        const depth = depthClass
            ? Number(depthClass.slice(5))
            : 0;

        const opacity = Math.max(
            0.38 - depth * 0.055,
            0.08
        );

        if (text.includes('Błąd')) {
            tr.style.backgroundColor =
                `rgba(180, 45, 45, ${opacity})`;
        } else if (text.includes('Zadanie')) {
            tr.style.backgroundColor =
                `rgba(45, 105, 180, ${opacity})`;
        } else if (text.includes('Uwaga')) {
            tr.style.backgroundColor =
                `rgba(25, 100, 50, ${opacity})`;
        }
    });
}

const TREE_SELECTOR = '#issue_tree';

function getTree() {
    return document.querySelector(TREE_SELECTOR);
}

function getTreeRows() {
    return getTree()?.querySelectorAll('tr') ?? [];
}

function getDepth(tr) {
    const depthClass = [...tr.classList]
        .find(c => /^idnt-\d+$/.test(c));

    return depthClass
        ? Number(depthClass.slice(5))
        : 0;
}

function getIssueId(tr) {
    const rowIdMatch = tr.id?.match(/^issue-(\d+)$/);

    if (rowIdMatch) {
        return rowIdMatch[1];
    }

    const issueLink = tr.querySelector('a[href*="/issues/"]');

    if (!issueLink) {
        return null;
    }

    const href = issueLink.getAttribute('href');
    const hrefMatch = href?.match(/\/issues\/(\d+)/);

    if (!hrefMatch) {
        return null;
    }

    return hrefMatch[1];
}

function isIndented(tr) {
    return [...tr.classList]
        .some(c => /^idnt-\d+$/.test(c));
}

function containsText(tr, text) {
    return [...tr.querySelectorAll('td')]
        .some(td => td.textContent.includes(text));
}

function isClosed(tr) {
    return containsText(tr, 'Zamknięty');
}

function setRowVisible(tr, visible) {
    tr.style.display = visible ? '' : 'none';
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

function setDescendantsVisible(tr, visible) {
    getDescendantRows(tr).forEach(row => {
        if (!isClosed(row)) {
            setRowVisible(row, visible);
        }
    });
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

function hideDescendants(tr) {
    getDescendantRows(tr).forEach(row => {
        if (!isClosed(row)) {
            setRowVisible(row, false);
        }
    });
}

function showDirectChildren(tr) {
    getDirectChildren(tr).forEach(row => {
        if (!isClosed(row)) {
            setRowVisible(row, true);
        }
    });
}

function hasDirectChildren(tr) {
    const depth = getDepth(tr);
    const next = tr.nextElementSibling;

    return Boolean(
        next &&
        getDepth(next) === depth + 1
    );
}

function markRowsWithChildren() {
    getTreeRows().forEach(tr => {
        if (!hasDirectChildren(tr)) {
            return;
        }

        tr.classList.add('has-children');

        const firstTd = tr.querySelectorAll('td')[1];

        if (
            !firstTd ||
            firstTd.querySelector('.tree-toggle-marker')
        ) {
            return;
        }

        const marker = document.createElement('span');

        marker.className = 'tree-toggle-marker';
        marker.textContent = '▶';
        marker.style.marginRight = '6px';
        marker.style.cursor = 'pointer';
        marker.style.color = '#467aa7';

        firstTd.prepend(marker);
    });
}

function setCollapsed(tr, collapsed) {
    tr.dataset.collapsed = String(collapsed);

    const marker = tr.querySelector(
        '.tree-toggle-marker'
    );

    if (marker) {
        marker.textContent = collapsed
            ? '▶'
            : '▼';

        marker.style.color = collapsed
            ? '#467aa7'
            : 'white';
    }
}

function saveCollapsedState() {
    const collapsedIssues = [];

    getTreeRows().forEach(tr => {
        if (
            tr.dataset.collapsed !== 'true' ||
            !hasDirectChildren(tr)
        ) {
            return;
        }

        const issueId = getIssueId(tr);

        if (issueId) {
            collapsedIssues.push(issueId);
        }
    });

    pageState.collapsedIssues = collapsedIssues;
    savePageState();
}

function restoreCollapsedState() {
    const collapsedIssues = new Set(
        pageState.collapsedIssues.map(String)
    );

    getTreeRows().forEach(tr => {
        if (!isClosed(tr)) {
            setRowVisible(tr, true);
        }

        if (hasDirectChildren(tr)) {
            setCollapsed(tr, false);
        }
    });

    getTreeRows().forEach(tr => {
        if (!hasDirectChildren(tr)) {
            return;
        }

        const issueId = getIssueId(tr);

        if (
            issueId &&
            collapsedIssues.has(String(issueId))
        ) {
            setCollapsed(tr, true);
            hideDescendants(tr);
        }
    });
}

function handleRowClick(event) {
    const tr = event.target.closest(
        `${TREE_SELECTOR} tr`
    );

    if (
        !tr ||
        isClosed(tr) ||
        !hasDirectChildren(tr)
    ) {
        return;
    }

    const collapsed =
        tr.dataset.collapsed === 'true';

    if (collapsed) {
        showDirectChildren(tr);
        setCollapsed(tr, false);
    } else {
        hideDescendants(tr);
        setCollapsed(tr, true);
    }

    saveCollapsedState();
}

function collapseAll() {
    getTreeRows().forEach(tr => {
        if (
            isIndented(tr) &&
            !isClosed(tr)
        ) {
            setRowVisible(tr, false);
        }

        if (
            !isClosed(tr) &&
            hasDirectChildren(tr)
        ) {
            setCollapsed(tr, true);
        }
    });

    saveCollapsedState();
}

function showAll() {
    getTreeRows().forEach(tr => {
        if (!isClosed(tr)) {
            setRowVisible(tr, true);
        }

        if (
            !isClosed(tr) &&
            hasDirectChildren(tr)
        ) {
            setCollapsed(tr, false);
        }
    });

    pageState.collapsedIssues = [];
    savePageState();
}

function addTreeControls() {
    const tree = getTree();

    if (
        !tree ||
        tree.querySelector('.tm-tree-controls')
    ) {
        return;
    }

    const p = tree.querySelector(':scope > p');

    if (!p) {
        return;
    }

    const controls = document.createElement('span');
    controls.className = 'tm-tree-controls';
    controls.style.marginLeft = '10px';

    const collapseLink = document.createElement('a');
    collapseLink.href = '#';
    collapseLink.textContent = 'Zwiń';
    collapseLink.style.marginRight = '10px';

    const showLink = document.createElement('a');
    showLink.href = '#';
    showLink.textContent = 'Rozwiń';

    collapseLink.addEventListener(
        'click',
        event => {
            event.preventDefault();
            collapseAll();
        }
    );

    showLink.addEventListener(
        'click',
        event => {
            event.preventDefault();
            showAll();
        }
    );

    controls.append(
        collapseLink,
        showLink
    );

    p.insertAdjacentElement(
        'beforeend',
        controls
    );

    addTypeFilterControls(p);
}

function addTreeSearch() {
    const tree = getTree();

    if (!tree) {
        return;
    }

    const p = tree.querySelector(':scope > p');

    if (
        !p ||
        p.querySelector('.tm-tree-search')
    ) {
        return;
    }

    const input = document.createElement('input');

    input.type = 'search';
    input.className = 'tm-tree-search';
    input.placeholder = 'Search...';
    input.style.marginLeft = '10px';
    input.value = pageState.search;

    input.addEventListener('input', () => {
        pageState.search = input.value;
        savePageState();
        applyTreeFilters();
    });

    p.append(input);
}

function getAncestors(tr) {
    const result = [];
    let depth = getDepth(tr);
    let previous = tr.previousElementSibling;

    while (
        previous &&
        depth > 0
    ) {
        const previousDepth =
            getDepth(previous);

        if (previousDepth < depth) {
            result.push(previous);
            depth = previousDepth;
        }

        previous =
            previous.previousElementSibling;
    }

    return result;
}

function highlightText(element, phrase) {
    const search =
        phrase.trim().toLocaleLowerCase();

    if (!search) {
        return;
    }

    const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT
    );

    const nodes = [];

    while (walker.nextNode()) {
        if (
            walker.currentNode
                .parentElement
                ?.closest('.tm-search-highlight')
        ) {
            continue;
        }

        nodes.push(walker.currentNode);
    }

    nodes.forEach(node => {
        const text = node.textContent;
        const index = text
            .toLocaleLowerCase()
            .indexOf(search);

        if (index === -1) {
            return;
        }

        const before =
            document.createTextNode(
                text.slice(0, index)
            );

        const match =
            document.createElement('mark');

        const after =
            document.createTextNode(
                text.slice(
                    index + phrase.length
                )
            );

        match.className =
            'tm-search-highlight';

        match.textContent =
            text.slice(
                index,
                index + phrase.length
            );

        node.replaceWith(
            before,
            match,
            after
        );
    });
}

function clearSearchHighlights() {
    getTree()
        ?.querySelectorAll(
            '.tm-search-highlight'
        )
        .forEach(mark => {
            mark.replaceWith(
                document.createTextNode(
                    mark.textContent
                )
            );
        });

    getTree()?.normalize();
}

function applyTreeFilters() {
    clearSearchHighlights();

    const rows = [...getTreeRows()];
    const type = globalState.typeFilter;
    const phrase = pageState.search;
    const search =
        phrase.trim().toLocaleLowerCase();

    const hasTypeFilter = Boolean(type);
    const hasSearch = Boolean(search);

    if (
        !hasTypeFilter &&
        !hasSearch
    ) {
        restoreCollapsedState();
        return;
    }

    const rowsToShow = new Set();

    rows.forEach(tr => {
        if (isClosed(tr)) {
            return;
        }

        const cells = [
            ...tr.querySelectorAll('td')
        ];

        const typeMatches =
            !hasTypeFilter ||
            cells.some(td =>
                td.textContent.includes(type)
            );

        const matchingCells =
            hasSearch
                ? cells.filter(td =>
                    td.textContent
                        .toLocaleLowerCase()
                        .includes(search)
                )
                : [];

        const searchMatches =
            !hasSearch ||
            matchingCells.length > 0;

        if (
            !typeMatches ||
            !searchMatches
        ) {
            return;
        }

        rowsToShow.add(tr);

        getAncestors(tr).forEach(parent => {
            if (!isClosed(parent)) {
                rowsToShow.add(parent);
            }
        });

        if (hasSearch) {
            matchingCells.forEach(td => {
                highlightText(td, phrase);
            });
        }
    });

    rows.forEach(tr => {
        if (!isClosed(tr)) {
            setRowVisible(
                tr,
                rowsToShow.has(tr)
            );
        }
    });
}

function filterTreeRows(phrase) {
    pageState.search = phrase;
    savePageState();
    applyTreeFilters();
}

function showRowsByType(type) {
    globalState.typeFilter = type;
    saveGlobalState();
    applyTreeFilters();
}

function addTypeFilterControls(p) {
    const select =
        document.createElement('select');

    select.className =
        'tm-tree-type-filter';

    select.style.marginLeft = '10px';

    const allOption =
        document.createElement('option');

    allOption.value = '';
    allOption.textContent = 'Wszystkie';

    const errorOption =
        document.createElement('option');

    errorOption.value = 'Błąd';
    errorOption.textContent = 'Błąd';

    const taskOption =
        document.createElement('option');

    taskOption.value = 'Zadanie';
    taskOption.textContent = 'Zadanie';

    const noteOption =
        document.createElement('option');

    noteOption.value = 'Uwaga';
    noteOption.textContent = 'Uwaga';

    select.append(
        allOption,
        errorOption,
        taskOption,
        noteOption
    );

    select.value =
        globalState.typeFilter;

    select.addEventListener(
        'change',
        event => {
            showRowsByType(
                event.target.value
            );
        }
    );

    p.append(select);
}

function initTreeCollapse() {
    document.addEventListener(
        'click',
        handleRowClick
    );

    addTreeControls();
}

(async function() {
    'use strict';

    await loadPersistentState();

    setupSubtasks();

    setupCorrelatedTasks();

    colorTreeRows();

    initTreeCollapse();

    markRowsWithChildren();

    addTreeSearch();

    if (
        pageState.collapsedIssues.length === 0
    ) {
        collapseAll();
    } else {
        restoreCollapsedState();
    }

    applyTreeFilters();
})();
