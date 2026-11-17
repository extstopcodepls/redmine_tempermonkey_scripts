// ==UserScript==
// @name         Redmine - włączenie przewijania filmow
// @namespace    local-video-seeking
// @version      1.0
// @match        https://redmine.x-code.pl/attachments/*
// @connect      *
// @description  Umożliwia przewijanie filmów z załączników z zadania
// ==/UserScript==

(() => {
    "use strict";

    const processed = new WeakSet();
    const observed = new WeakSet();
    const blobUrls = new Set();

    async function enableSeeking(video) {
        if (processed.has(video)) return;

        const src =
            video.currentSrc ||
            video.src ||
            video.querySelector("source[src]")?.src;

        if (!src || src.startsWith("blob:")) return;

        processed.add(video);

        try {
            console.log("[VideoSeeking] Downloading:", src);

            const response = await fetch(src, {
                credentials: "include"
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const blob = await response.blob();

            // Ignore videos that were removed or changed.
            if (!video.isConnected) return;

            const currentSrc = video.currentSrc || video.src;
            if (currentSrc && currentSrc !== src) return;

            const blobUrl = URL.createObjectURL(blob);
            blobUrls.add(blobUrl);

            const previousTime = video.currentTime;
            const wasPlaying = !video.paused;

            video.pause();

            video.addEventListener("loadedmetadata", () => {
                if (Number.isFinite(previousTime)) {
                    video.currentTime = previousTime;
                }

                if (wasPlaying) {
                    video.play().catch(console.error);
                }

                console.log("[VideoSeeking] Ready:", {
                    duration: video.duration,
                    seekable: video.seekable.length
                        ? video.seekable.end(video.seekable.length - 1)
                        : 0
                });
            }, { once: true });

            video.src = blobUrl;
            video.controls = true;
            video.load();

        } catch (error) {
            console.error("[VideoSeeking] Failed:", error);
        }
    }

    function scanVideos() {
        document.querySelectorAll("video").forEach(video => {
            if (!observed.has(video)) {
                observed.add(video);
                video.addEventListener("loadstart", () => {
                    enableSeeking(video);
                });
            }

            enableSeeking(video);
        });
    }

    const observer = new MutationObserver(scanVideos);

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["src"]
    });

    scanVideos();

    window.addEventListener("pagehide", () => {
        for (const url of blobUrls) {
            URL.revokeObjectURL(url);
        }
        blobUrls.clear();
    });
})();
