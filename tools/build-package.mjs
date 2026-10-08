#!/usr/bin/env node
/**
 * Apex Smiles — buyer package builder.
 *
 * Builds dist/apex-smiles-<version>.zip, the file uploaded to ThemeForest:
 *
 *   apex-smiles/
 *   ├── apex-smiles-html/   index.html, favicon.ico, assets/  (the template)
 *   └── documentation/      the HTML help file
 *
 * Only an allowlist is packed, so development files (.git, .cursorrules, tools/,
 * editor and lint configs, .gitkeep) can never leak into the download. The
 * staging-only block in index.html (robots noindex for the public demo) is removed, and
 * the demo's Netlify address is swapped back to the example.com placeholder.
 *
 * Before writing anything it refuses to build when:
 *   - the CSS checker (tools/check-css.mjs) reports a problem,
 *   - a staging-only marker is unbalanced, or the noindex would survive,
 *   - developer notes are visible in index.html,
 *   - a local path in index.html or the documentation does not exist with that exact case,
 *   - a packed file name is not lowercase-with-hyphens.
 *
 * Zero dependencies: Node built-ins only (zlib for compression, own ZIP writer), so the
 * build adds no npm package or advisory to the project (.cursorrules rule 6).
 *
 * Usage:  node tools/build-package.mjs [version]     (default 1.0.0)
 * Exit:   0 on success, 1 when a check fails.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VERSION = process.argv[2] || "1.0.0";
const PACKAGE_DIR = "apex-smiles";
const TEMPLATE_DIR = "apex-smiles-html";
const OUTPUT = join(ROOT, "dist", `apex-smiles-${VERSION}.zip`);

/** What ships, relative to ROOT, and where it lands inside the zip. */
const ALLOWLIST = [
  { from: "index.html", to: `${PACKAGE_DIR}/${TEMPLATE_DIR}/index.html` },
  { from: "favicon.ico", to: `${PACKAGE_DIR}/${TEMPLATE_DIR}/favicon.ico` },
  { from: "assets", to: `${PACKAGE_DIR}/${TEMPLATE_DIR}/assets` },
  { from: "documentation", to: `${PACKAGE_DIR}/documentation` },
];

/** Never packed, even inside an allowlisted folder. */
const EXCLUDED_NAMES = new Set([".gitkeep", ".DS_Store", "Thumbs.db", "desktop.ini"]);

/** Phrases that only make sense to the developer and must never reach a buyer. */
const DEV_PHRASES = [/milestone/i, /plug in here/i, /\bweek \d\b/i, /\bscaffold/i, /\bTODO\b/, /\bFIXME\b/, /lorem ipsum/i];

const STAGING_BLOCK = /[ \t]*<!-- staging-only:start[\s\S]*?<!-- staging-only:end -->[ \t]*\r?\n/g;

/**
 * The public demo's absolute URLs (canonical, Open Graph, Twitter and JSON-LD) use the
 * Netlify placeholder below. Buyers get example.com instead, which the documentation
 * tells them to search for. Write that host exactly, or the swap misses it and the
 * github.io guard below will not catch a leftover demo address of a different shape.
 */
const DEMO_ORIGIN = "https://your-domain.netlify.app/";
const BUYER_ORIGIN = "https://example.com/";

/** Lowercase words joined by hyphens, with one extension (rule 5). */
const FILE_NAME = /^[a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9]+)+$/;

const errors = [];
const fail = (message) => errors.push(message);

/* ------------------------------------------------------------------ */
/*  Collect files                                                       */
/* ------------------------------------------------------------------ */

/**
 * @param {string} from Path relative to ROOT (file or folder).
 * @param {string} to Path inside the zip.
 * @returns {{source: string, target: string}[]}
 */
const expand = (from, to) => {
  const source = join(ROOT, from);
  const stats = statSync(source);

  if (stats.isFile()) {
    return [{ source, target: to }];
  }

  return readdirSync(source)
    .filter((name) => !EXCLUDED_NAMES.has(name) && !name.startsWith("."))
    .sort()
    .flatMap((name) => expand(join(from, name), `${to}/${name}`));
};

/* ------------------------------------------------------------------ */
/*  Checks                                                              */
/* ------------------------------------------------------------------ */

/**
 * Exact-case existence check: Windows and macOS ignore case, Linux servers do not.
 * @param {string} base Folder the reference is relative to.
 * @param {string} reference
 * @returns {boolean}
 */
const existsExactCase = (base, reference) => {
  let current = base;

  for (const part of reference.split("/")) {
    if (part === "" || part === ".") {
      continue;
    }

    if (part === "..") {
      current = dirname(current);
      continue;
    }

    let entries;

    try {
      entries = readdirSync(current);
    } catch {
      return false;
    }

    if (!entries.includes(part)) {
      return false;
    }

    current = join(current, part);
  }

  return true;
};

/**
 * Every local src / href / srcset target in an HTML file must exist.
 * @param {string} file Absolute path.
 * @param {string} html
 * @returns {void}
 */
const checkLocalPaths = (file, html) => {
  // Comments and <pre> code samples (such as the documentation's srcset example) are not
  // real references.
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<pre\b[\s\S]*?<\/pre>/g, "");
  const references = [...withoutComments.matchAll(/\b(?:src|href|srcset)="([^"]+)"/g)]
    .flatMap((match) => match[1].split(",").map((part) => part.trim().split(/\s+/)[0]))
    .filter((reference) => reference && !/^(https?:|mailto:|tel:|#|data:|\.\/$)/.test(reference));

  for (const reference of new Set(references)) {
    const path = reference.split(/[?#]/)[0];

    if (path.startsWith("/")) {
      fail(`${relative(ROOT, file)}: "${reference}" is root-relative and breaks in a sub-folder; make it relative.`);
    } else if (!existsExactCase(dirname(file), path)) {
      fail(`${relative(ROOT, file)}: "${reference}" does not exist (paths are case-sensitive on Linux servers).`);
    }
  }
};

/**
 * @returns {string} index.html as it ships (staging block removed).
 */
const prepareIndex = () => {
  const file = join(ROOT, "index.html");
  const html = readFileSync(file, "utf8");
  const starts = (html.match(/staging-only:start/g) || []).length;
  const ends = (html.match(/staging-only:end/g) || []).length;

  if (starts !== ends) {
    fail(`index.html: ${starts} staging-only:start marker(s) but ${ends} staging-only:end marker(s).`);
  }

  const shipped = html.replace(STAGING_BLOCK, "").split(DEMO_ORIGIN).join(BUYER_ORIGIN);

  if (/name="robots"[^>]*noindex/i.test(shipped)) {
    fail("index.html: a robots noindex would ship to buyers; wrap it in the staging-only block.");
  }

  if (/github\.io/i.test(shipped)) {
    fail(`index.html: a demo address would ship to buyers; write it as ${DEMO_ORIGIN} exactly so it is swapped for ${BUYER_ORIGIN}.`);
  }

  const visibleText = shipped.replace(/<!--[\s\S]*?-->/g, "");
  const comments = (shipped.match(/<!--[\s\S]*?-->/g) || []).join("\n");

  for (const phrase of DEV_PHRASES) {
    if (phrase.test(visibleText) || phrase.test(comments)) {
      fail(`index.html: developer note matching ${phrase} would ship to buyers.`);
    }
  }

  checkLocalPaths(file, shipped);
  return shipped;
};

const runCssCheck = () => {
  try {
    execFileSync(process.execPath, [join(ROOT, "tools", "check-css.mjs")], { cwd: ROOT, stdio: "pipe" });
  } catch (error) {
    fail(`CSS checker failed:\n${String(error.stdout || error.message).trim()}`);
  }
};

/* ------------------------------------------------------------------ */
/*  ZIP writer (stored + deflate, no dependencies)                      */
/* ------------------------------------------------------------------ */

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;

  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }

  return c >>> 0;
});

/**
 * @param {Buffer} buffer
 * @returns {number}
 */
const crc32 = (buffer) => {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
};

/**
 * MS-DOS date and time, as stored in ZIP headers.
 * @param {Date} date
 * @returns {{time: number, day: number}}
 */
const dosDateTime = (date) => ({
  time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
  day: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
});

/**
 * @param {{name: string, data: Buffer}[]} entries
 * @returns {Buffer}
 */
const createZip = (entries) => {
  const { time, day } = dosDateTime(new Date());
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const nameBuffer = Buffer.from(name, "utf8");
    const deflated = deflateRawSync(data, { level: 9 });
    // Already-compressed files (jpg, png, ico) can grow when deflated; store those.
    const useDeflate = deflated.length < data.length;
    const body = useDeflate ? deflated : data;
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(useDeflate ? 8 : 0, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    local.writeUInt16LE(0, 28);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(useDeflate ? 8 : 0, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(day, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt32LE(offset, 42);

    locals.push(local, nameBuffer, body);
    centrals.push(central, nameBuffer);
    offset += local.length + nameBuffer.length + body.length;
  }

  const centralBuffer = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, centralBuffer, end]);
};

/* ------------------------------------------------------------------ */
/*  Build                                                               */
/* ------------------------------------------------------------------ */

const main = () => {
  if (!/^\d+\.\d+\.\d+$/.test(VERSION)) {
    console.error(`build-package: version "${VERSION}" must look like 1.0.0.`);
    return 1;
  }

  runCssCheck();
  const index = prepareIndex();
  const docsIndex = join(ROOT, "documentation", "index.html");
  checkLocalPaths(docsIndex, readFileSync(docsIndex, "utf8"));

  const files = ALLOWLIST.flatMap(({ from, to }) => expand(from, to));

  for (const { source } of files) {
    const name = source.split(sep).pop();

    if (!FILE_NAME.test(name)) {
      fail(`${relative(ROOT, source)}: file names must be lowercase-with-hyphens (rule 5).`);
    }
  }

  if (errors.length) {
    console.error(`Package not built. ${errors.length} problem${errors.length === 1 ? "" : "s"}:\n`);
    errors.forEach((message) => console.error(`  - ${message}`));
    return 1;
  }

  const entries = files.map(({ source, target }) => ({
    name: target,
    data: source === join(ROOT, "index.html") ? Buffer.from(index, "utf8") : readFileSync(source),
  }));

  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, createZip(entries));

  entries.forEach(({ name, data }) => console.log(`  ${name}  (${data.length.toLocaleString("en-US")} bytes)`));
  console.log(`\n${relative(process.cwd(), OUTPUT)}: ${entries.length} files, ` +
    `${statSync(OUTPUT).size.toLocaleString("en-US")} bytes.`);
  return 0;
};

process.exitCode = main();
