/* ============================================================
   SeaBerry Açaí — Main JavaScript
   main.js

   Sections:
     1. Tailwind Init Flag
     2. AOS Animation Library Init
   ============================================================ */


/* =========================
   1. TAILWIND INIT FLAG
   ========================= */

/*
  Forces Tailwind CDN to apply styles immediately on load.
  Required when using the Tailwind Play CDN (not a build step).
*/
document.documentElement.setAttribute('data-tailwind-ready', 'true');


/* =========================
   2. AOS — ANIMATE ON SCROLL
   ========================= */

/*
  Initialises AOS (Animate On Scroll library).
  - once: true        → elements animate only on first enter, not on scroll back
  - easing            → matches the site's ease-out motion language
  - duration          → default 900ms, overridden per-element via data-aos-duration
  - disable           → auto-disabled when user prefers reduced motion (accessibility)
*/
AOS.init({
  once:     true,
  easing:   'ease-out',
  duration: 900,
  disable:  window.matchMedia('(prefers-reduced-motion: reduce)').matches,
});
