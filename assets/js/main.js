/**
 * Apex Smiles — site behaviours (scaffold).
 *
 * Vanilla ES6+ only. No jQuery, no build step, no third-party libraries.
 * Full modules (navigation, stickyHeader, smoothScroll, accordion, formValidation)
 * land in later milestones; this file only boots the App shell safely.
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
  const MODULES = Object.freeze(["scaffold"]);

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
     * Placeholder module so App.init() is safe on the empty skeleton.
     * @namespace App.scaffold
     */
    scaffold: createModule(() => {
      // Feature modules attach here in later milestones.
    }),
  };

  // Nothing is attached to window. Defer-friendly boot.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", App.init, { once: true });
  } else {
    App.init();
  }
})();
