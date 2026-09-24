// ==UserScript==
// @name         Redmine - podgląd podzadań w iframe
// @namespace    redmine-subtask-preview
// @version      1.0.0
// @description  Podgląd podzadań Redmine w wysuwanym panelu iframe
// @match        https://redmine.x-code.pl/issues/*
// @match        https://redmine.x-code.pl/projects/*
// @grant        none
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function () {
    'use strict';

    /*
     * ZMIEŃ:
     *
     *   https://YOUR-REDMINE-HOST/*
     *
     * np. na:
     *
     *   https://redmine.example.com/*
     */

    // Skrypt może działać tylko w głównym oknie.
    if (window.self !== window.top) {
        return;
    }

    const PREVIEW_LINK_SELECTOR = [
        // Podzagadnienia na stronie zagadnienia
        '#issue_tree td.subject a[href]',

        // Lista zagadnień - kolumna "Temat"
        'table.list.issues tr[id^="issue-"] td.subject a[href]',

        // Lista zagadnień - kolumna "Zadanie nadrzędne"
        'table.list.issues tr[id^="issue-"] td.parent a[href]',

        // Lista zagadnień - kolumna "Temat zadania nadrzędnego"
        'table.list.issues tr[id^="issue-"] td.parent-subject a[href]'
    ].join(', ');

    const DEFAULT_WIDTH = Math.min(
        900,
        Math.max(550, window.innerWidth * 0.48)
    );

    const MIN_WIDTH = 400;

    let panel = null;
    let iframe = null;
    let titleElement = null;
    let openOriginalLink = null;
    let loadingElement = null;

    // -------------------------------------------------------------------------
    // Sprawdzanie adresu zagadnienia
    // -------------------------------------------------------------------------

    function isIssueUrl(url) {
        try {
            const parsed = new URL(url, location.href);

            return (
                parsed.origin === location.origin &&
                /\/issues\/\d+(?:\/|$)/.test(parsed.pathname)
            );
        } catch {
            return false;
        }
    }

    // -------------------------------------------------------------------------
    // Tworzenie panelu
    // -------------------------------------------------------------------------

    function createPanel() {
        if (panel) {
            return;
        }

        panel = document.createElement('div');

        Object.assign(panel.style, {
            position: 'fixed',
            top: '0',
            right: '0',
            width: `${DEFAULT_WIDTH}px`,
            height: '100vh',
            zIndex: '2147483647',
            display: 'none',
            background: '#fff',
            borderLeft: '1px solid #aaa',
            boxShadow: '-6px 0 18px rgba(0, 0, 0, 0.20)',
            boxSizing: 'border-box'
        });

        panel.innerHTML = `
            <div
                id="redmine-preview-resize"
                style="
                    position: absolute;
                    left: -5px;
                    top: 0;
                    width: 10px;
                    height: 100%;
                    cursor: ew-resize;
                    z-index: 20;
                "
            ></div>

            <div
                style="
                    display: flex;
                    flex-direction: column;
                    width: 100%;
                    height: 100%;
                    overflow: hidden;
                "
            >
                <div
                    style="
                        flex: 0 0 46px;
                        display: flex;
                        align-items: center;
                        gap: 6px;
                        padding: 0 8px 0 12px;
                        background: #f5f5f5;
                        border-bottom: 1px solid #ccc;
                        font-family: Arial, Helvetica, sans-serif;
                        box-sizing: border-box;
                    "
                >
                    <button
                        id="redmine-preview-back"
                        type="button"
                        title="Wstecz"
                        style="
                            border: 0;
                            background: transparent;
                            cursor: pointer;
                            font-size: 20px;
                            padding: 5px 8px;
                        "
                    >
                        ←
                    </button>

                    <button
                        id="redmine-preview-forward"
                        type="button"
                        title="Dalej"
                        style="
                            border: 0;
                            background: transparent;
                            cursor: pointer;
                            font-size: 20px;
                            padding: 5px 8px;
                        "
                    >
                        →
                    </button>

                    <button
                        id="redmine-preview-reload"
                        type="button"
                        title="Odśwież"
                        style="
                            border: 0;
                            background: transparent;
                            cursor: pointer;
                            font-size: 18px;
                            padding: 5px 8px;
                        "
                    >
                        ↻
                    </button>

                    <div
                        id="redmine-preview-title"
                        style="
                            flex: 1;
                            min-width: 0;
                            overflow: hidden;
                            white-space: nowrap;
                            text-overflow: ellipsis;
                            font-size: 13px;
                            font-weight: 600;
                            color: #333;
                        "
                    >
                        Podgląd Redmine
                    </div>

                    <a
                        id="redmine-preview-open"
                        href="#"
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Otwórz bieżącą stronę w nowej karcie"
                        style="
                            border: 0;
                            background: transparent;
                            cursor: pointer;
                            font-size: 18px;
                            padding: 5px 8px;
                            text-decoration: none;
                            color: #333;
                        "
                    >
                        ↗
                    </a>

                    <button
                        id="redmine-preview-close"
                        type="button"
                        title="Zamknij"
                        style="
                            border: 0;
                            background: transparent;
                            cursor: pointer;
                            font-size: 23px;
                            font-weight: bold;
                            padding: 5px 8px;
                            color: #333;
                        "
                    >
                        ×
                    </button>
                </div>

                <div
                    style="
                        position: relative;
                        flex: 1 1 auto;
                        min-height: 0;
                        background: #fff;
                    "
                >
                    <iframe
                        id="redmine-preview-frame"
                        style="
                            display: block;
                            width: 100%;
                            height: 100%;
                            border: 0;
                            background: #fff;
                        "
                    ></iframe>

                    <div
                        id="redmine-preview-loading"
                        style="
                            display: none;
                            position: absolute;
                            inset: 0;
                            align-items: center;
                            justify-content: center;
                            background: rgba(255, 255, 255, 0.82);
                            font-family: Arial, Helvetica, sans-serif;
                            font-size: 14px;
                            color: #444;
                            z-index: 10;
                            pointer-events: none;
                        "
                    >
                        Ładowanie...
                    </div>
                </div>
            </div>
        `;

        document.documentElement.appendChild(panel);

        iframe = panel.querySelector('#redmine-preview-frame');
        titleElement = panel.querySelector('#redmine-preview-title');
        openOriginalLink = panel.querySelector('#redmine-preview-open');
        loadingElement = panel.querySelector('#redmine-preview-loading');

        /*
         * Sandbox jest opcjonalny.
         *
         * Pozwala Redmine:
         * - wykonywać skrypty,
         * - korzystać z formularzy,
         * - zachować ten sam origin,
         * - wyświetlać confirm/alert,
         * - otwierać nowe karty,
         * - pobierać pliki.
         *
         * Nie dodajemy allow-top-navigation, dzięki czemu zwykła zawartość
         * iframe nie powinna przejąć głównej karty.
         */
        iframe.setAttribute(
            'sandbox',
            [
                'allow-same-origin',
                'allow-scripts',
                'allow-forms',
                'allow-modals',
                'allow-popups',
                'allow-popups-to-escape-sandbox',
                'allow-downloads'
            ].join(' ')
        );

        panel
            .querySelector('#redmine-preview-close')
            .addEventListener('click', closePanel);

        panel
            .querySelector('#redmine-preview-back')
            .addEventListener('click', () => {
                try {
                    iframe.contentWindow.history.back();
                } catch (error) {
                    console.warn('[Redmine preview] Wstecz:', error);
                }
            });

        panel
            .querySelector('#redmine-preview-forward')
            .addEventListener('click', () => {
                try {
                    iframe.contentWindow.history.forward();
                } catch (error) {
                    console.warn('[Redmine preview] Dalej:', error);
                }
            });

        panel
            .querySelector('#redmine-preview-reload')
            .addEventListener('click', () => {
                try {
                    iframe.contentWindow.location.reload();
                } catch (error) {
                    console.warn('[Redmine preview] Odśwież:', error);
                }
            });

        /*
         * Zdarzenie load uruchamia się po:
         *
         * - kliknięciu linku,
         * - wysłaniu formularza,
         * - przekierowaniu,
         * - history.back(),
         * - history.forward(),
         * - reload().
         */
        iframe.addEventListener('load', handleIframeLoad);

        setupResizing();
    }

    // -------------------------------------------------------------------------
    // Zmiana szerokości panelu
    // -------------------------------------------------------------------------

    function setupResizing() {
        const handle =
            panel.querySelector('#redmine-preview-resize');

        let resizing = false;
        let startX = 0;
        let startWidth = 0;

        handle.addEventListener('pointerdown', event => {
            resizing = true;

            startX = event.clientX;
            startWidth =
                panel.getBoundingClientRect().width;

            handle.setPointerCapture(event.pointerId);

            event.preventDefault();
        });

        handle.addEventListener('pointermove', event => {
            if (!resizing) {
                return;
            }

            const difference =
                startX - event.clientX;

            const maxWidth =
                window.innerWidth * 0.95;

            const newWidth = Math.min(
                maxWidth,
                Math.max(
                    MIN_WIDTH,
                    startWidth + difference
                )
            );

            panel.style.width =
                `${newWidth}px`;
        });

        handle.addEventListener('pointerup', event => {
            resizing = false;

            try {
                handle.releasePointerCapture(
                    event.pointerId
                );
            } catch {
                // brak działania
            }
        });
    }

    // -------------------------------------------------------------------------
    // Ładowanie strony
    // -------------------------------------------------------------------------

    function openPreview(url) {
        createPanel();

        panel.style.display = 'block';

        loadingElement.style.display = 'flex';

        titleElement.textContent =
            'Ładowanie...';

        openOriginalLink.href = url;

        /*
         * Tutaj NIE używamy fetch().
         *
         * Przeglądarka sama ładuje pełną stronę Redmine
         * do iframe.
         */
        iframe.src = url;
    }

    // -------------------------------------------------------------------------
    // Zdarzenie załadowania dokumentu iframe
    // -------------------------------------------------------------------------

    function handleIframeLoad() {
        loadingElement.style.display = 'none';

        try {
            const frameWindow =
                iframe.contentWindow;

            const frameDocument =
                iframe.contentDocument;

            /*
             * Ponieważ Redmine jest z tego samego origin,
             * możemy odczytać aktualny URL oraz title.
             */
            const currentUrl =
                frameWindow.location.href;

            const currentTitle =
                frameDocument.title;

            openOriginalLink.href =
                currentUrl;

            titleElement.textContent =
                currentTitle ||
                currentUrl;

        } catch (error) {
            /*
             * Jeżeli iframe został przekierowany na inną domenę,
             * Same Origin Policy uniemożliwi odczyt jego zawartości.
             *
             * Sama strona nadal może działać.
             */
            titleElement.textContent =
                'Podgląd Redmine';

            console.warn(
                '[Redmine preview] Brak dostępu do dokumentu iframe:',
                error
            );
        }
    }

    // -------------------------------------------------------------------------
    // Zamknięcie
    // -------------------------------------------------------------------------

    function closePanel() {
        if (!panel) {
            return;
        }

        panel.style.display = 'none';
    }

    // -------------------------------------------------------------------------
    // Kliknięcie podzadania na stronie głównej
    // -------------------------------------------------------------------------

    document.addEventListener(
        'click',
        event => {
            if (
                event.button !== 0 ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey ||
                event.metaKey
            ) {
                return;
            }

            const target =
                  event.target instanceof Element
            ? event.target
            : null;

            if (!target) {
                return;
            }

            const link =
                  target.closest(
                      PREVIEW_LINK_SELECTOR
                  );

            if (!link) {
                return;
            }

            if (!isIssueUrl(link.href)) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();

            openPreview(link.href);
        },
        true
    );

    // -------------------------------------------------------------------------
    // Escape zamyka panel
    // -------------------------------------------------------------------------

    document.addEventListener(
        'keydown',
        event => {
            if (
                event.key === 'Escape' &&
                panel?.style.display !== 'none'
            ) {
                closePanel();
            }
        }
    );

    // -------------------------------------------------------------------------
    // Double-click on the main Redmine page closes the preview
    // -------------------------------------------------------------------------

    document.addEventListener('dblclick', event => {
        if (!panel || panel.style.display === 'none') {
            return;
        }

        const target =
              event.target instanceof Element
        ? event.target
        : null;

        if (!target) {
            return;
        }

        // Do not close when double-clicking the preview panel itself.
        if (panel.contains(target)) {
            return;
        }

        closePanel();
    });

})();
