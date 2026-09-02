// ==UserScript==
// @name         Redmine Closed Removed From Subtasks
// @namespace    https://github.com/extstopcodepls/redmine_closed_substasks_remover
// @version      0.7
// @description  Usuwa linki z podzagadnień, które są zamknięte
// @author       Paweł Borawski
// @match        https://redmine.x-code.pl/issues/*
// @grant        none
// ==/UserScript==

function getAllSubtasksRows() {
     return document
            .querySelectorAll('#issue_tree table.list.issues tr.closed');
}

function showSubtasks(event) {
    var toUnblockElements = getAllSubtasksRows();
    toUnblockElements.forEach(function (toUnblockElement) {
        toUnblockElement.style.display = 'table-row';
    });
    event.target.innerHTML = " - Schowaj zamknięte - ";
    event.target.onclick = hideSubtasks;
}

function hideSubtasks(event) {
    var toRemoveElements = getAllSubtasksRows();
    toRemoveElements
        .forEach(function (closedElement) {
            closedElement.style.display = 'none';
        });
    event.target.innerHTML = " - " + toRemoveElements.length + " zamkniętych. (pokaż)";;
    event.target.onclick = showSubtasks;
}

function setupSubtasks() {
    var toRemoveElements = getAllSubtasksRows();

    if (toRemoveElements.length) {
        var subTaskTitleElement =
            document.querySelectorAll('#issue_tree > p > strong')[0];

        var showHideElement = document.createElement("a");
        showHideElement.innerHTML = " - " + toRemoveElements.length + " zamkniętych. (pokaż)";
        showHideElement.style.cursor = "pointer";
        showHideElement.onclick = showSubtasks;

        subTaskTitleElement.parentNode.insertBefore(showHideElement, subTaskTitleElement.nextSibling);

        var linkElement =
            document.querySelectorAll('#issue_tree > p > span')[0]

        if (linkElement) {
            var linkName = document.createElement("strong");
            linkName.innerText = "Tabele: ";
            linkElement.parentNode.insertBefore(linkName, linkElement);
        }

        toRemoveElements.forEach(function (closedElement) {
            closedElement.style.display = 'none';
        });
    }
}

function getAllCorrelatedTasksRows() {
     return document
            .querySelectorAll('#relations table.list.issues tr.closed');
}

function showCorrelatedTasks(event) {
    var toUnblockElements = getAllCorrelatedTasksRows();
    toUnblockElements.forEach(function (toUnblockElement) {
        toUnblockElement.style.display = 'table-row';
    });
    event.target.innerHTML = " - Schowaj zamknięte - ";
    event.target.onclick = hideCorrelatedTasks;
}

function hideCorrelatedTasks(event) {
    var toRemoveElements = getAllCorrelatedTasksRows();
    toRemoveElements
        .forEach(function (closedElement) {
            closedElement.style.display = 'none';
        });
    event.target.innerHTML = " - " + toRemoveElements.length + " zamkniętych. (pokaż)";;
    event.target.onclick = showCorrelatedTasks;
}

function setupCorrelatedTasks() {

    var toRemoveElements = getAllCorrelatedTasksRows();

    if (toRemoveElements.length) {
        var subTaskTitleElement =
            document.querySelectorAll('#relations > p > strong')[0];

        var showHideElement = document.createElement("a");
        showHideElement.innerHTML = " - " + toRemoveElements.length + " zamkniętych. (pokaż)";
        showHideElement.style.cursor = "pointer";
        showHideElement.onclick = showSubtasks;

        subTaskTitleElement.parentNode.insertBefore(showHideElement, subTaskTitleElement.nextSibling);

        var linkElement =
            document.querySelectorAll('#relations > p > span')[0]

        if (linkElement) {
            var linkName = document.createElement("strong");
            linkName.innerText = "Tabele: ";
            linkElement.parentNode.insertBefore(linkName, linkElement);
        }

        toRemoveElements
            .forEach(function (closedElement) {
            closedElement.style.display = 'none';
        });
    }
}

function colorTreeRows() {
    document.querySelectorAll('tr').forEach(tr => {
        const text = tr.textContent;

        if (!text.includes('Błąd') && !text.includes('Zadanie')) {
            return;
        }

        const depthClass = [...tr.classList].find(c => /^idnt-\d+$/.test(c));
        const depth = depthClass ? Number(depthClass.slice(5)) : 0;

        const opacity = Math.max(0.38 - depth * 0.055, 0.08);

        if (text.includes('Błąd')) {
            tr.style.backgroundColor = `rgba(180, 45, 45, ${opacity})`;
        } else if (text.includes('Zadanie')) {
            tr.style.backgroundColor = `rgba(45, 105, 180, ${opacity})`;
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
    const depthClass = [...tr.classList].find(c => /^idnt-\d+$/.test(c));
    return depthClass ? Number(depthClass.slice(5)) : 0;
}

function isIndented(tr) {
    return [...tr.classList].some(c => /^idnt-\d+$/.test(c));
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

    return next && getDepth(next) === depth + 1;
}

function markRowsWithChildren() {
    getTreeRows().forEach(tr => {
        if (!hasDirectChildren(tr)) {
            return;
        }

        tr.classList.add('has-children');

        const firstTd = tr.querySelectorAll('td')[1];
        if (!firstTd || firstTd.querySelector('.tree-toggle-marker')) {
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

    const marker = tr.querySelector('.tree-toggle-marker');

    if (marker) {
        marker.textContent = collapsed ? '▶' : '▼';
        marker.style.color = collapsed ? marker.style.color : 'white';
    }
}

function handleRowClick(event) {
    const tr = event.target.closest(`${TREE_SELECTOR} tr`);
    if (!tr || isClosed(tr) || !hasDirectChildren(tr)) return;

    const collapsed = tr.dataset.collapsed === 'true';

    if (collapsed) {
        showDirectChildren(tr);
        setCollapsed(tr, false);
    } else {
        hideDescendants(tr);
        setCollapsed(tr, true);
    }
}

function collapseAll() {
    getTreeRows().forEach(tr => {
        if (isIndented(tr) && !isClosed(tr)) {
            setRowVisible(tr, false);
        }

        if (!isClosed(tr) && hasDirectChildren(tr)) {
            setCollapsed(tr, true);
        }
    });
}

function showAll() {
    getTreeRows().forEach(tr => {
        if (!isClosed(tr)) {
            setRowVisible(tr, true);
            tr.dataset.collapsed = 'false';
        }
    });
}

function addTreeControls() {
    const tree = getTree();
    if (!tree || tree.querySelector('.tm-tree-controls')) return;

    const p = tree.querySelector(':scope > p');
    if (!p) return;

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

    collapseLink.addEventListener('click', event => {
        event.preventDefault();
        collapseAll();
    });

    showLink.addEventListener('click', event => {
        event.preventDefault();
        showAll();
    });

    controls.append(collapseLink, showLink);
    p.insertAdjacentElement('beforeend', controls);
}

function addTreeSearch() {
    const tree = getTree();
    if (!tree) return;

    const p = tree.querySelector(':scope > p');
    if (!p || p.querySelector('.tm-tree-search')) return;

    const input = document.createElement('input');

    input.type = 'search';
    input.className = 'tm-tree-search';
    input.placeholder = 'Search...';
    input.style.marginLeft = '10px';

    input.addEventListener('input', () => {
        filterTreeRows(input.value);
    });

    p.append(input);
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

function filterTreeRows(phrase) {
    const search = phrase.trim().toLocaleLowerCase();

    clearSearchHighlights();

    if (!search) {
        showAll();
        return;
    }

    const rows = [...getTreeRows()];
    const rowsToShow = new Set();

    rows.forEach(tr => {
        if (isClosed(tr)) return;

        const matchingCells = [...tr.querySelectorAll('td')]
            .filter(td => td.textContent.toLocaleLowerCase().includes(search));

        if (!matchingCells.length) {
            return;
        }

        rowsToShow.add(tr);

        getAncestors(tr).forEach(parent => {
            if (!isClosed(parent)) {
                rowsToShow.add(parent);
            }
        });

        matchingCells.forEach(td => {
            highlightText(td, phrase);
        });
    });

    rows.forEach(tr => {
        if (!isClosed(tr)) {
            setRowVisible(tr, rowsToShow.has(tr));
        }
    });
}

function highlightText(element, phrase) {
    const search = phrase.trim().toLocaleLowerCase();
    if (!search) return;

    const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT
    );

    const nodes = [];

    while (walker.nextNode()) {
        if (
            walker.currentNode.parentElement?.closest('.tm-search-highlight')
        ) {
            continue;
        }

        nodes.push(walker.currentNode);
    }

    nodes.forEach(node => {
        const text = node.textContent;
        const index = text.toLocaleLowerCase().indexOf(search);

        if (index === -1) return;

        const before = document.createTextNode(text.slice(0, index));
        const match = document.createElement('mark');
        const after = document.createTextNode(
            text.slice(index + phrase.length)
        );

        match.className = 'tm-search-highlight';
        match.textContent = text.slice(index, index + phrase.length);

        node.replaceWith(before, match, after);
    });
}

function clearSearchHighlights() {
    getTree()?.querySelectorAll('.tm-search-highlight').forEach(mark => {
        mark.replaceWith(document.createTextNode(mark.textContent));
    });

    getTree()?.normalize();
}

function initTreeCollapse() {
    document.addEventListener('click', handleRowClick);
    addTreeControls();
}

(function() {
    'use strict';

    setupSubtasks();

    setupCorrelatedTasks();

    colorTreeRows();

    initTreeCollapse();

    markRowsWithChildren();

    collapseAll();

    addTreeSearch();
})();
