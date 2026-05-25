// ==UserScript==
// @name         Redmine AdditionalButtons whole these
// @namespace    http://pasio.corp
// @version      2026-05-25
// @description  A żeby łatwiej było
// @author       @extstopcodepls
// @match        https://redmine.x-code.pl/issues/*
// @grant        GM_openInTab
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function() {
    'use strict';

    const commitIssueName = setupCopyIssueNameForCommit();

    setupCopyBranchName();
    setupSearchForMrs(commitIssueName);


})();

function setupCopyIssueNameForCommit() {
    const element = document.querySelector('#content > h2');

    wrapH2WithAnchor(element);

    element.addEventListener('click', function(e) {
        let text = e.currentTarget.textContent;
        navigator.clipboard.writeText(text);
    });

    return element;
}

function wrapH2WithAnchor(element) {
  if (!element || element.tagName !== 'H2') return;

  // skip if already wrapped
  if (element.parentElement?.tagName === 'A') return;

  const a = document.createElement('a');
  a.href = '#';
  a.style.cursor = 'pointer';
  a.style.color = '#467aa7';
  a.style.textDecoration = 'underline';

  element.style.cursor = 'pointer';
  element.style.color = '#467aa7';
  element.style.textDecoration = 'underline';

  // prevent navigation
  a.addEventListener('click', e => e.preventDefault());

  element.replaceWith(a);
  a.appendChild(element);
}

function setupSearchForMrs(commitIssueName) {
    var buttons = document.querySelector('#content .contextual');

    var newButton = document.createElement("a");
    newButton.setAttribute('href', "#");
    newButton.setAttribute('class', "icon icon-summary");

    var span = document.createElement("span");
    span.setAttribute('class', 'icon-label');
    span.innerText = "Poszukaj MR";
    newButton.insertAdjacentElement("beforeend", span);

    buttons.insertBefore(newButton, buttons.querySelector('.icon-edit'))

    newButton.onclick = function() {

        let gitlabUrl = GM_getValue('pasio::gitlab', null);

        if (!gitlabUrl) {
            gitlabUrl = prompt('Podaj adres url gitlaba - bez /');
            GM_setValue('pasio::gitlab', gitlabUrl);
        }

        const url = new URL(`${gitlabUrl}/dashboard/merge_requests/search?scope=all&state=all`);

        url.searchParams.set('search', commitIssueName.textContent);

        GM_openInTab(url.toString(), {
            active: true,
            insert: true
        });
    }
}

function setupCopyBranchName() {
    var buttons = document.querySelector('#content .contextual');

    var newButton = document.createElement("a");
    newButton.setAttribute('href', "#");
    newButton.setAttribute('class', "icon icon-summary");

    var span = document.createElement("span");
    span.setAttribute('class', 'icon-label');
    span.innerText = "Nazwa brancha";
    newButton.insertAdjacentElement("beforeend", span);

    buttons.insertBefore(newButton, buttons.querySelector('.icon-edit'))

    newButton.onclick = function() {
        var typeOfIssue = document.querySelector('#content h2').innerText;

        var issueId = window.location.pathname.split('/').pop();

        if (typeOfIssue.includes("Błąd")) {
            navigator.clipboard.writeText(`blad_${issueId}`);
        }

        if (typeOfIssue.includes("Zadanie")) {
            navigator.clipboard.writeText(`zadanie_${issueId}`);
        }

        if (typeOfIssue.includes("Modyfikacja")) {
            navigator.clipboard.writeText(`modyfikacja_${issueId}`);
        }

        if (typeOfIssue.includes("Uwaga")) {
            navigator.clipboard.writeText(`uwaga_${issueId}`);
        }
    }
}
