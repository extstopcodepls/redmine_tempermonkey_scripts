// ==UserScript==
// @name         Redmine Programming Activity As Default
// @namespace    http://pasio-redmine.org
// @version      2026-05-25
// @description  try to take over the world!
// @author       You
// @match        https://redmine.x-code.pl/issues/*/time_entries/new
// @icon         https://www.google.com/s2/favicons?sz=64&domain=x-code.pl
// @grant        none
// ==/UserScript==

(function() {
    const activity = document.querySelector('#time_entry_activity_id');
    activity.value = 10;
})();
