// ==UserScript==
// @name         Redmine Programming Activity As Default
// @namespace    http://pasio-redmine.org
// @version      2026-07-24-1
// @description  try to take over the world!
// @author       You
// @match        https://redmine.x-code.pl/issues/*/time_entries/new*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=x-code.pl
// @grant        none
// ==/UserScript==

(function() {
    const activity = document.querySelector('#time_entry_activity_id');

    activity.value = 10;

    const timeEntryInput = document.querySelector('#time_entry_hours')
    const timeEntryParent = timeEntryInput.closest('p');

    const halfHour = createA(timeEntryInput, '0.5');
    const hour = createA(timeEntryInput, '1');
    const twoHours = createA(timeEntryInput, '2');
    const sevenHours = createA(timeEntryInput, '7');

    timeEntryParent.appendChild(sevenHours);
    timeEntryParent.appendChild(twoHours);
    timeEntryParent.appendChild(hour);
    timeEntryParent.appendChild(halfHour);
    
    function createA(timeEntryInput, timeValue) {
        const a = document.createElement('a');
        a.href = '#';
        a.onclick = function (e) {
            timeEntryInput.value = timeValue;
        }
        a.textContent = `[${timeValue} hours] `;
        return a;
    }
})();
