#!/usr/bin/env node
/**
 * Apex Smiles — CSS rule checker.
 *
 * Zero dependencies (Node built-ins only), so it never adds an npm advisory to the
 * project (.cursorrules rule 6). It replaces Stylelint, whose every release depends on
 * a package with an unpatched CVE.
 *
 * Checks:
 *   bem          class names are BEM in lowercase-hyphen      (rule 2)
 *   important    !important only in utilities.css and the
 *                prefers-reduced-motion reset                 (rule 3)
 *   min-width    no max-width / max-height media queries      (rule 8)
 *   transition   transitions name only transform and opacity,
 *                plus visibility with a 0s duration           (rule 14)
 *   import       no @import                                   (rule 20)
 *
 * Usage:   node tools/check-css.mjs [file-or-folder ...]
 *          (no arguments: every .css file under assets/css)
 * Exit:    0 when clean, 1 when any rule is broken, 2 on a usage error.
 *
 * This is a focused checker, not a full CSS parser: it understands comments, strings,
 * blocks and declarations, which is all these rules need.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_TARGET = join(ROOT, "assets", "css");

/** block, block__element, block--modifier; lowercase words joined by single hyphens. */
const BEM = /^[a-z][a-z0-9]*(-[a-z0-9]+)*(__[a-z0-9]+(-[a-z0-9]+)*)?(--[a-z0-9]+(-[a-z0-9]+)*)?$/;

/** The only properties a micro-interaction may transition (rule 14). */
const TRANSITION_ALLOWED = new Set(["transform", "opacity"]);

/** Files where !important is the whole point (rule 3). */
const IMPORTANT_FILES = new Set(["utilities.css"]);

const TIME = /^[+-]?(\d+\.?\d*|\.\d+)m?s$/i;
const EASING_KEYWORDS = new Set([
  "ease", "ease-in", "ease-out", "ease-in-out", "linear", "step-start", "step-end",
  "normal", "allow-discrete",
]);
const EASING_FUNCTION = /^(cubic-bezier|steps|linear)\(/i;

/**
 * Blank out comments and string contents with spaces, keeping newlines and offsets, so
 * braces, semicolons and "!important" inside them are never mistaken for code.
 * @param {string} source
 * @returns {string}
 */
const mask = (source) => {
  let out = "";
  let i = 0;

  while (i < source.length) {
    const c = source[i];

    if (c === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      const stop = end === -1 ? source.length : end + 2;
      out += source.slice(i, stop).replace(/[^\n]/g, " ");
      i = stop;
    } else if (c === '"' || c === "'") {
      let j = i + 1;

      while (j < source.length && source[j] !== c && source[j] !== "\n") {
        j += source[j] === "\\" ? 2 : 1;
      }

      // Keep the quotes so values still read as strings; blank only the contents.
      out += c + source.slice(i + 1, j).replace(/[^\n]/g, " ") + (j < source.length ? source[j] : "");
      i = j + 1;
    } else {
      out += c;
      i += 1;
    }
  }

  return out;
};

/**
 * @param {string} text
 * @returns {(offset: number) => {line: number, column: number}}
 */
const locator = (text) => {
  const starts = [0];

  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "\n") {
      starts.push(i + 1);
    }
  }

  return (offset) => {
    let low = 0;
    let high = starts.length - 1;

    while (low < high) {
      const mid = (low + high + 1) >> 1;

      if (starts[mid] <= offset) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }

    return { line: low + 1, column: offset - starts[low] + 1 };
  };
};

/**
 * Split on a separator at parenthesis depth 0 (commas inside var() or cubic-bezier()
 * are not list separators).
 * @param {string} value
 * @param {RegExp} separator Single-character test.
 * @returns {string[]}
 */
const splitTopLevel = (value, separator) => {
  const parts = [];
  let depth = 0;
  let current = "";

  for (const c of value) {
    if (c === "(") {
      depth += 1;
    } else if (c === ")") {
      depth = Math.max(0, depth - 1);
    }

    if (depth === 0 && separator.test(c)) {
      parts.push(current);
      current = "";
    } else {
      current += c;
    }
  }

  parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
};

/**
 * Property named by one item of the transition shorthand. With no property named the
 * browser transitions "all"; a var() may then be hiding the property, which cannot be
 * checked, so both are reported with their own wording.
 * @param {string} item
 * @returns {string}
 */
const transitionProperty = (item) => {
  let sawVar = false;

  for (const token of splitTopLevel(item, /\s/)) {
    const lower = token.toLowerCase();

    if (TIME.test(lower) || EASING_KEYWORDS.has(lower) || EASING_FUNCTION.test(lower)) {
      continue;
    }

    if (/^var\(/.test(lower)) {
      // A var() in a timing slot is fine; only a var() standing in for the property is not.
      sawVar = true;
      continue;
    }

    return lower;
  }

  return sawVar ? "var() (name transform or opacity explicitly)" : "all (no property named)";
};

/**
 * True when a transition item's duration (the first time value) is zero, so the change
 * is a delayed switch rather than an animation.
 * @param {string} item
 * @returns {boolean}
 */
const isInstant = (item) => {
  const time = splitTopLevel(item, /\s/).find((token) => TIME.test(token));
  return time !== undefined && parseFloat(time) === 0;
};

/**
 * Check one stylesheet.
 * @param {string} file
 * @returns {{file: string, line: number, column: number, rule: string, message: string}[]}
 */
const checkFile = (file) => {
  const source = readFileSync(file, "utf8");
  const text = mask(source);
  const at = locator(text);
  const problems = [];
  const fileName = basename(file);

  /** Open blocks, innermost last: { kind: "at" | "rule", prelude }. */
  const stack = [];
  let segmentStart = 0;

  const report = (offset, rule, message) => {
    problems.push({ file, ...at(offset), rule, message });
  };

  /** Offset of the first non-space character of a segment. */
  const firstCharOffset = (start, segment) => start + (segment.length - segment.trimStart().length);

  const inside = (test) => stack.some((block) => block.kind === "at" && test(block.prelude));

  const checkAtRule = (prelude, offset) => {
    if (/^@import\b/i.test(prelude)) {
      report(offset, "import", "Load stylesheets with <link>, never @import (rule 20)");
    }

    if (/^@media\b/i.test(prelude)) {
      const query = prelude.toLowerCase();

      if (/\bmax-(width|height)\b/.test(query) || /\b(width|height)\s*<|>\s*=?\s*(width|height)\b/.test(query)) {
        report(offset, "min-width", "Breakpoints are min-width only: 768px, 992px, 1200px (rule 8)");
      }
    }
  };

  const checkSelector = (prelude, offset) => {
    // Keyframe selectors (from, to, 50%) are not class selectors.
    if (inside((p) => /^@(-webkit-)?keyframes\b/i.test(p))) {
      return;
    }

    // Attribute selectors can hold dots in their values; drop them before scanning.
    const selector = prelude.replace(/\[[^\]]*\]/g, (m) => " ".repeat(m.length));

    for (const match of selector.matchAll(/\.(-?[_a-zA-Z -￿][\w -￿-]*)/g)) {
      if (!BEM.test(match[1])) {
        report(
          offset + match.index,
          "bem",
          `".${match[1]}" is not BEM: use block, block__element or block--modifier in lowercase-hyphen (rule 2)`
        );
      }
    }
  };

  const checkDeclaration = (segment, start) => {
    const colon = segment.indexOf(":");

    if (colon === -1) {
      return;
    }

    const property = segment.slice(0, colon).trim().toLowerCase();
    const value = segment.slice(colon + 1).trim();
    const offset = firstCharOffset(start, segment);

    if (/!\s*important\s*$/i.test(value)) {
      const allowed =
        IMPORTANT_FILES.has(fileName) || inside((p) => /prefers-reduced-motion\s*:\s*reduce/i.test(p));

      if (!allowed) {
        report(offset, "important", "!important belongs only in utilities.css and the reduced-motion reset (rule 3)");
      }
    }

    const bare = value.replace(/!\s*important\s*$/i, "").trim();

    if (property === "transition" || property === "-webkit-transition") {
      if (bare.toLowerCase() === "none") {
        return;
      }

      for (const item of splitTopLevel(bare, /,/)) {
        const name = transitionProperty(item);

        // Rule 14's exception: visibility may flip after a fade-out with a 0s duration.
        if (name === "visibility" && isInstant(item)) {
          continue;
        }

        if (!TRANSITION_ALLOWED.has(name)) {
          report(offset, "transition", `Transition "${name}": only transform and opacity may transition (rule 14)`);
        }
      }
    }

    if (property === "transition-property") {
      for (const name of splitTopLevel(bare.toLowerCase(), /,/)) {
        if (name !== "none" && !TRANSITION_ALLOWED.has(name)) {
          report(offset, "transition", `Transition "${name}": only transform and opacity may transition (rule 14)`);
        }
      }
    }
  };

  /** A segment that ends with ";" or "}" is a declaration in a rule, or an at-rule statement. */
  const handleStatement = (segment, start) => {
    const trimmed = segment.trim();

    if (!trimmed) {
      return;
    }

    if (trimmed.startsWith("@")) {
      checkAtRule(trimmed, firstCharOffset(start, segment));
    } else if (stack.length && stack[stack.length - 1].kind === "rule") {
      checkDeclaration(segment, start);
    }
  };

  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];

    if (c === "{") {
      const segment = text.slice(segmentStart, i);
      const prelude = segment.trim();
      const offset = firstCharOffset(segmentStart, segment);
      const kind = prelude.startsWith("@") ? "at" : "rule";

      if (kind === "at") {
        checkAtRule(prelude, offset);
      } else {
        checkSelector(prelude, offset);
      }

      stack.push({ kind, prelude });
      segmentStart = i + 1;
    } else if (c === ";") {
      handleStatement(text.slice(segmentStart, i), segmentStart);
      segmentStart = i + 1;
    } else if (c === "}") {
      // The last declaration in a block may omit its semicolon.
      handleStatement(text.slice(segmentStart, i), segmentStart);
      stack.pop();
      segmentStart = i + 1;
    }
  }

  return problems;
};

/**
 * @param {string[]} targets Files or folders.
 * @returns {string[]} Every .css file, sorted.
 */
const collect = (targets) => {
  const files = [];

  const walk = (path) => {
    const stats = statSync(path);

    if (stats.isDirectory()) {
      readdirSync(path).forEach((name) => walk(join(path, name)));
    } else if (path.endsWith(".css")) {
      files.push(path);
    }
  };

  targets.forEach((target) => walk(resolve(target)));
  return files.sort();
};

const main = () => {
  const targets = process.argv.slice(2);
  let files;

  try {
    files = collect(targets.length ? targets : [DEFAULT_TARGET]);
  } catch (error) {
    console.error(`check-css: ${error.message}`);
    return 2;
  }

  if (!files.length) {
    console.error("check-css: no .css files found.");
    return 2;
  }

  const problems = files.flatMap(checkFile);

  problems.forEach(({ file, line, column, rule, message }) => {
    console.log(`${relative(process.cwd(), file)}:${line}:${column}  ${message}  [${rule}]`);
  });

  const summary = `${files.length} file${files.length === 1 ? "" : "s"} checked, ` +
    `${problems.length} problem${problems.length === 1 ? "" : "s"}.`;
  console.log(problems.length ? `\n${summary}` : summary);

  return problems.length ? 1 : 0;
};

process.exitCode = main();
