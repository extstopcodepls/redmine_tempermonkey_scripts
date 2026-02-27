// ==UserScript==
// @name         Redmine AdditionalButtons whole these
// @namespace    http://pasio.corp
// @version      2026-02-19
// @description  A żeby łatwiej było
// @author       @extstopcodepls
// @match        https://redmine.x-code.pl/issues/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    var buttons = document.querySelector('.contextual');

    var newButton = document.createElement("a");
    newButton.setAttribute('href', "#");
    newButton.setAttribute('class', "icon icon-summary");

    var span = document.createElement("span");
    span.setAttribute('class', 'icon-label');
    //span.innerText = "Ω Nazwa brancha";
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
})();
