// ==UserScript==
// @name         Redmine - podgląd podzadań w iframe
// @namespace    redmine-subtask-preview
// @version      1.1.0
// @description  Podgląd podzadań Redmine w wysuwanym panelu iframe
// @match        https://redmine.x-code.pl/issues/*
// @match        https://redmine.x-code.pl/projects/*
// @grant        none
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function () {
    'use strict';

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

    const DEFAULT_WIDTH = 950;
    const MIN_WIDTH = 450;

    let panel = null;
    let iframe = null;
    let titleElement = null;
    let openOriginalLink = null;
    let loadingElement = null;

    let isFullscreen = false;
    let widthBeforeFullscreen = null;

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
        id="redmine-preview-go"
        type="button"
        title="Przejdź do tej strony"
        style="
            border: 0;
            background: transparent;
            cursor: pointer;
            font-size: 18px;
            padding: 5px 8px;
        "
    >
        ⇱
    </button>

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

    <button
        id="redmine-preview-fullscreen"
        type="button"
        title="Pełny ekran"
        style="
            border: 0;
            background: transparent;
            cursor: pointer;
            font-size: 18px;
            padding: 5px 8px;
            color: #333;
        "
    >
        ⛶
    </button>

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

        panel
            .querySelector('#redmine-preview-fullscreen')
            .addEventListener('click', toggleFullscreen);

        panel
            .querySelector('#redmine-preview-go')
            .addEventListener('click', () => {
                try {
                    const currentUrl =
                          iframe.contentWindow.location.href;

                    window.location.href = currentUrl;
                } catch (error) {
                    console.warn(
                        '[Redmine preview] Nie można przejść do strony:',
                        error
                    );
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

            if (isFullscreen) {
                return;
            }

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

            panel.style.width = `${newWidth}px`;
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

    function toggleFullscreen() {
        if (!panel) {
            return;
        }

        const fullscreenButton =
              panel.querySelector('#redmine-preview-fullscreen');

        if (!isFullscreen) {
            /*
         * Zapamiętujemy obecną szerokość,
         * żeby można było ją później przywrócić.
         */
            widthBeforeFullscreen =
                panel.getBoundingClientRect().width;

            panel.style.top = '0';
            panel.style.right = '0';
            panel.style.bottom = '0';
            panel.style.left = '0';

            panel.style.width = '100vw';
            panel.style.height = '100vh';

            panel.style.borderLeft = '0';
            panel.style.boxShadow = 'none';

            isFullscreen = true;

            fullscreenButton.textContent = '🗗';
            fullscreenButton.title = 'Wyjdź z pełnego ekranu';

        } else {
            panel.style.top = '0';
            panel.style.right = '0';
            panel.style.bottom = 'auto';
            panel.style.left = 'auto';

            panel.style.width =
                widthBeforeFullscreen
                ? `${widthBeforeFullscreen}px`
            : `${DEFAULT_WIDTH}px`;

            panel.style.height = '100vh';

            panel.style.borderLeft =
                '1px solid #aaa';

            panel.style.boxShadow =
                '-6px 0 18px rgba(0, 0, 0, 0.20)';

            isFullscreen = false;

            fullscreenButton.textContent = '⛶';
            fullscreenButton.title = 'Pełny ekran';
        }
    }

})();
