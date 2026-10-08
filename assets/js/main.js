/**
 * Apex Smiles — site behaviours.
 *
 * Vanilla ES6+ only. No jQuery, no build step, no third-party libraries.
 * Modules: navigation (mobile drawer menu) and mapEmbed (click-to-load map).
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

  /** Boot order. App.destroy() stops them in reverse. */
  const MODULES = Object.freeze(["navigation", "mapEmbed"]);

  /** The horizontal menu takes over from the drawer here. Mirrors 992px in style.css (rule 8). */
  const DESKTOP_QUERY = window.matchMedia("(min-width: 992px)");

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
     * Mobile drawer menu. While open it is modal: the rest of the page is inert, page
     * scroll is locked on <html>, and closing with Escape or the backdrop returns focus to
     * the toggle. A link click closes it and lets the browser follow the anchor.
     * Markup, all inside .site-header: button.site-nav__toggle[aria-controls] pointing at
     * nav.site-nav, and div.site-header__backdrop (shipped hidden for no-JS visitors).
     * @namespace App.navigation
     */
    navigation: createModule((signal) => {
      const toggle = document.querySelector(".site-nav__toggle");
      const drawer = toggle ? document.getElementById(toggle.getAttribute("aria-controls") || "") : null;

      if (!toggle || !drawer) {
        return;
      }

      const header = toggle.closest(".site-header");
      const backdrop = header ? header.querySelector(".site-header__backdrop") : null;
      const brand = header ? header.querySelector(".site-header__brand") : null;

      /** Elements this module made inert, so closing restores exactly those. */
      let inerted = [];

      const isOpen = () => toggle.getAttribute("aria-expanded") === "true";

      /**
       * @param {boolean} on
       * @returns {void}
       */
      const setPageInert = (on) => {
        if (on && !inerted.length) {
          const outside = [...document.body.children].filter(
            (el) => el !== header && el.tagName !== "SCRIPT"
          );

          inerted = [...outside, brand].filter((el) => el && !el.inert);
          inerted.forEach((el) => {
            el.inert = true;
          });
        } else if (!on) {
          inerted.forEach((el) => {
            el.inert = false;
          });
          inerted = [];
        }
      };

      /**
       * Single source of truth for the menu state. The drawer only opens below the
       * desktop breakpoint; on desktop the menu is always visible and never inert.
       * @param {boolean} open
       * @param {boolean} [returnFocus=false]
       * @returns {void}
       */
      const setOpen = (open, returnFocus = false) => {
        const isDesktop = DESKTOP_QUERY.matches;
        const show = open && !isDesktop;

        toggle.setAttribute("aria-expanded", String(show));
        drawer.classList.toggle("is-open", show);
        drawer.inert = !show && !isDesktop;
        document.documentElement.classList.toggle("no-scroll", show);

        if (backdrop) {
          backdrop.classList.toggle("is-open", show);
        }

        setPageInert(show);

        if (!show && returnFocus) {
          toggle.focus();
        }
      };

      toggle.addEventListener("click", () => setOpen(!isOpen()), { signal });

      if (backdrop) {
        backdrop.addEventListener("click", () => setOpen(false, true), { signal });
      }

      drawer.addEventListener(
        "click",
        (event) => {
          if (isOpen() && event.target instanceof Element && event.target.closest("a")) {
            setOpen(false);
          }
        },
        { signal }
      );

      document.addEventListener(
        "keydown",
        (event) => {
          if (event.key === "Escape" && isOpen()) {
            setOpen(false, true);
          }
        },
        { signal }
      );

      DESKTOP_QUERY.addEventListener(
        "change",
        (event) => {
          const toggleHadFocus = document.activeElement === toggle;

          if (event.matches) {
            setOpen(false);

            // The toggle is hidden on desktop; keep keyboard focus in the menu.
            const firstLink = toggleHadFocus ? drawer.querySelector("a") : null;

            if (firstLink) {
              firstLink.focus();
            }
          } else {
            // Back on mobile: snap the drawer off-canvas instead of sliding it across.
            drawer.classList.add("site-nav--instant");
            setOpen(false);
            void drawer.offsetWidth; // commit the jump before transitions return
            window.requestAnimationFrame(() => drawer.classList.remove("site-nav--instant"));
          }
        },
        { signal }
      );

      // The backdrop ships hidden for no-JS visitors; from here CSS fades it in and out.
      if (backdrop) {
        backdrop.hidden = false;
      }

      // destroy() and a second init() both abort: close first, so the page is never left
      // scroll-locked, inert, or with a drawer nothing can close.
      signal.addEventListener(
        "abort",
        () => {
          setOpen(false);

          if (backdrop) {
            backdrop.hidden = true;
          }
        },
        { once: true }
      );

      // Cold start: closed, and inert off-canvas on mobile so its links are not tabbable.
      setOpen(false);
    }),

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
