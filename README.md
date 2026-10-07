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

python -m http.server 8000
# or
npx serve .
```

Visit `http://localhost:8000`.

Asset load order (as shipped):

1. Inline `document.documentElement.classList.add("js")`
2. `assets/css/style.css`
3. `assets/css/utilities.css`
4. `assets/js/main.js` with `defer`

---

## License & Attribution

Template scaffolding bundles no third-party scripts, fonts, or stock libraries. Redistribution follows the licence under which you obtain the package (typically Envato Regular or Extended for ThemeForest sales).

| Item | Source | Licence |
| --- | --- | --- |
| Fonts | System font stack | — |
| Placeholder images | Add under `assets/images/*` | Template licence |

---

## Changelog

### 0.1.0 — Scaffold

- Initial folder hierarchy, blueprint section anchors, token stylesheet, utilities sheet, and App IIFE shell.
