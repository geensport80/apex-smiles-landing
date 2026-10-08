# Apex Smiles — High-Converting Semantic Landing Page

Clean production scaffolding for a ThemeForest-ready dental clinic landing page. Architecture follows the validated Weeks 1–3 patterns from the Aurelia Dental prototype: semantic HTML5, design-token CSS, separate utilities, and a private IIFE JavaScript shell.

There is no build step — open `index.html` or serve the folder locally.

---

## Key Architectural Features

- **ThemeForest standard compliance** — BEM, mobile-first CSS, semantic landmarks, readable unminified assets
- **Mobile-first** — Breakpoints at 768px, 992px, and 1200px (min-width only)
- **WCAG 2.2 AA baseline** — Skip link, shared section headers, focus-visible, form tokens reserved for later
- **Zero dependencies** — No npm, CDN, or frameworks
- **Scaffold only** — Content bands are anchored; components and interactions land in later milestones

---

## Folder Structure

```text
apex-smiles-landing/
├── index.html
├── README.md
├── .cursorrules
├── favicon.ico
├── documentation/          Buyer help file (index.html + assets/docs.css)
├── tools/
│   ├── check-css.mjs       CSS rule checker (development only, zero dependencies)
│   └── build-package.mjs   Builds the ThemeForest zip (development only, zero dependencies)
└── assets/
    ├── css/
    │   ├── style.css       Design tokens, base, layout, components
    │   └── utilities.css   Single-purpose helpers (!important allowed)
    ├── js/
    │   └── main.js         IIFE App shell (modules ported next)
    └── images/
        ├── branding/
        ├── hero/
        ├── services/
        └── testimonials/
```

### Content blueprint (section anchors)

| Order | Section | Anchor |
| --- | --- | --- |
| 1 | Hero | `#hero` |
| 2 | Trust bar | `#trust-bar` |
| 3 | Services | `#services` |
| 4 | About doctor | `#about-doctor` |
| 5 | Pricing | `#pricing` |
| 6 | Testimonials | `#testimonials` |
| 7 | FAQ | `#faq` |
| 8 | Contact | `#contact` |
| 9 | Footer | `#footer` |

---

## Technologies Used

| Layer | Approach |
| --- | --- |
| Markup | HTML5 landmarks, shared `.section__*` headers |
| Styles | Custom properties, Grid/Flex readiness, cascade via `<link>` (no `@import`) |
| Script | Vanilla ES6+ IIFE, `"use strict"`, deferred load |
| Build | None |

---

## How to Run / Preview Locally

```bash
# From inside apex-smiles-landing/

# Python 3 (built in, no packages to download)
python -m http.server 8000
```

Do not use `npx serve` or similar: npx downloads npm packages at run time, which the zero-CVE policy (rule 6) does not allow.

Visit `http://localhost:8000`.

Asset load order (as shipped):

1. Inline `document.documentElement.classList.add("js")`
2. `assets/css/style.css`
3. `assets/css/utilities.css`
4. `assets/js/main.js` with `defer`

### Building the buyer package

```bash
node tools/build-package.mjs 1.0.0
```

Writes `dist/apex-smiles-1.0.0.zip` with `apex-smiles-html/` (the template) and `documentation/`. Only `index.html`, `favicon.ico`, `assets/` and `documentation/` are packed, so `.git`, `.cursorrules`, `tools/` and editor configs never ship. The block between `staging-only:start` and `staging-only:end` in `index.html` (the `noindex` for the public demo) is removed, and the demo address `https://your-domain.netlify.app/` is swapped for the `https://example.com/` placeholder that the documentation tells buyers to replace. The build refuses to run when the CSS checker fails, a developer note (milestone, TODO, lorem ipsum…) is left in `index.html`, a local path is missing or has the wrong letter case, or a file name is not lowercase-with-hyphens.

### Checking the CSS

```bash
node tools/check-css.mjs
```

Needs Node 18 or later and nothing else: the script uses only Node built-ins, so it adds no npm package (and no advisory) to the project. It checks BEM class names (rule 2), `!important` outside `utilities.css` and the reduced-motion reset (rule 3), max-width media queries (rule 8), transitions on anything but `transform` / `opacity` (rule 14) and `@import` (rule 20). It exits with 1 when it finds a problem, so it can run before every commit or in CI. Pass files or folders to check something else: `node tools/check-css.mjs path/to/file.css`.

Stylelint is deliberately not used: every release depends on `braces`, which has an unpatched CVE (CVE-2026-93687).

### Publishing on Netlify

`netlify.toml` publishes the repository root (`publish = "."`) with no build command. Connect the repo in Netlify, then replace every `https://your-domain.netlify.app/` in `index.html` with the real site URL before the canonical and social cards go live. Asset CSS, JS, WebP and SVG responses are cached for one year (`immutable`). Every response sends `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` and `Referrer-Policy: strict-origin-when-cross-origin`.

### Publishing a GitHub Pages preview

A Pages preview can still be served straight from this repository (`.nojekyll`), with the `noindex` block, not the buyer zip. Canonical and social URLs in that copy point at the Netlify placeholder until you change them.

1. Run `node tools/check-css.mjs` and commit.
2. Push `main` to GitHub.
3. First time only: in the repository on GitHub, open **Settings → Pages**, set **Source** to *Deploy from a branch*, choose `main` and `/ (root)`, save, and tick **Enforce HTTPS** once it is offered.
4. When the site is live, run Lighthouse on the demo URL in a Chrome **Incognito** window (DevTools → Lighthouse, Mobile), so extensions do not skew the result.

`.nojekyll` in the root tells Pages to serve the files as they are, without a Jekyll build. Pages serves over HTTPS with gzip and a fixed 10-minute cache and cannot set the headers in `netlify.toml`. The repository has to be public for Pages on a free GitHub plan, which also makes the development files visible on the preview domain; the buyer zip is unaffected.

---

## License & Attribution

Template scaffolding bundles no third-party scripts, fonts, or stock libraries. Redistribution follows the licence under which you obtain the package (typically Envato Regular or Extended for ThemeForest sales).

| Item | Source | Licence |
| --- | --- | --- |
| Fonts | System font stack | — |
| Placeholder images | Add under `assets/images/*` | Template licence |
| Google Maps embed (optional, loads on click) | External service, not bundled | Google Maps Platform Terms of Service; use the Maps Embed API with your own key in production, or swap `data-map-src` for an OpenStreetMap embed (data © OpenStreetMap contributors, ODbL) |

---

## Changelog

### 1.0.0 — First release

- Pricing (three plans) and FAQ (native `<details>`), complete contact copy.
- Original vector hero illustration and clinician portrait; favicon, app icon and Open Graph image.
- Open Graph and Twitter card tags; staging-only `noindex` for the demo.
- HTML documentation and the package builder.

### 0.1.0 — Scaffold

- Initial folder hierarchy, blueprint section anchors, token stylesheet, utilities sheet, and App IIFE shell.
