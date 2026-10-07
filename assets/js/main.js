/**
 * Apex Smiles — site behaviours.
 *
 * Vanilla ES6+ only. No jQuery, no build step, no third-party libraries.
 * Full modules (navigation, stickyHeader, smoothScroll, accordion, formValidation)
 * land in later milestones. mapEmbed is the first feature module.
 */
(function () {
  "use strict";

  /**
   * @typedef {Object} Module
   * @property {AbortController|null} controller
   * @property {function(): void} init
   * @property {function(): void} destroy
   */

  /**
   * @param {function(AbortSignal): void} start
   * @param {Object} [members]
   * @returns {Module}
   */
  const createModule = (start, members) => {
    const module = {
      ...members,
      controller: null,

      init: () => {
        if (module.controller) {
          module.controller.abort();
        }

        module.controller = new AbortController();
        start(module.controller.signal);
      },

      destroy: () => {
        if (module.controller) {
          module.controller.abort();
          module.controller = null;
        }
      },
    };

    return module;
  };

  /** Boot order grows as feature modules are ported from Week 1–3. */
  const MODULES = Object.freeze(["mapEmbed"]);

  /**
   * Hosts a map embed may load from. data-map-src is markup a page builder can edit, so
   * anything else is refused rather than framed on a page that collects health details.
   */
  const MAP_HOSTS = Object.freeze(["www.google.com", "maps.google.com", "www.openstreetmap.org"]);

  /**
   * @param {string} message
   * @param {*} error
   * @returns {void}
   */
  const reportError = (message, error) => {
    console.error(`[Apex Smiles] ${message}`, error);
  };

  /**
   * @param {"init"|"destroy"} method
   * @param {readonly string[]} names
   * @returns {void}
   */
  const runAll = (method, names) => {
    names.forEach((name) => {
      try {
        App[name][method]();
      } catch (error) {
        reportError(`${name}.${method}() failed.`, error);
      }
    });
  };

  /**
   * @namespace App
   */
  const App = {
    init: () => runAll("init", MODULES),

    destroy: () => runAll("destroy", [...MODULES].reverse()),

    /**
     * Click-to-load maps. The facade costs nothing until the visitor presses
     * [data-action="load-map"]; then its contents are swapped for the iframe in a box of
     * the same size, so there is no layout shift and no third-party request before consent.
     * Markup: figure.map-embed[data-map-src][data-map-title] (copy stays in the markup).
     * @namespace App.mapEmbed
     */
    mapEmbed: createModule((signal) => {
      /**
       * @param {string|null} src
       * @returns {URL|null} The URL when it is https on an allowed host, otherwise null.
       */
      const safeMapUrl = (src) => {
        try {
          const url = new URL(src || "");
          return url.protocol === "https:" && MAP_HOSTS.includes(url.hostname) ? url : null;
        } catch {
          return null;
        }
      };

      /**
       * Replace the facade with the live map and move focus into it, because the button
       * that had focus is removed with the facade.
       * @param {HTMLElement} container
       * @returns {void}
       */
      const load = (container) => {
        const url = safeMapUrl(container.getAttribute("data-map-src"));

        if (!url) {
          reportError("Map not loaded: data-map-src must be https on an allowed host.", container);
          return;
        }

        const frame = document.createElement("iframe");

        frame.className = "map-embed__frame";
        frame.title = container.getAttribute("data-map-title") || "";
        frame.src = url.href;
        frame.width = "600";
        frame.height = "450";
        frame.allowFullscreen = true;
        frame.referrerPolicy = "strict-origin-when-cross-origin";
        // Maps needs scripts, its own origin and popups (directions); nothing else.
        frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox");

        container.replaceChildren(frame);
        frame.focus();
      };

      document.querySelectorAll(".map-embed[data-map-src]").forEach((container) => {
        container.addEventListener(
          "click",
          (event) => {
            if (event.target instanceof Element && event.target.closest('[data-action="load-map"]')) {
              load(container);
            }
          },
          { signal }
        );
      });
    }),
  };

  // Nothing is attached to window. Defer-friendly boot.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", App.init, { once: true });
  } else {
    App.init();
  }
})();
