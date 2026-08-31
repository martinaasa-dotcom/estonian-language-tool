#!/usr/bin/env node
/**
 * Polish passes on the mark the app actually ships, into design/icons/polish/.
 *
 * This is not another round of candidates. Ten rounds looked for a replacement
 * and the answer came back that the person stays; what follows is that same
 * mark with the tilde lifted clear of the head, which is the one thing review
 * asked for, plus what lifting it exposed.
 *
 * The mark is the letter õ read as a face: the bowl is the head and the
 * diacritic is worn as hair. That is why the tilde sitting *in* the head is
 * wrong rather than merely tight. On the letter it is a separate stroke above
 * the bowl, and at 4.6 units thick with its trough reaching y=21.5 against a
 * bowl starting at y=18, this one overlapped by three and a half units. It read
 * as a cowlick growing out of the scalp instead of a diacritic over a letter.
 *
 *   node scripts/make-icon-polish.mjs
 */
import { writeFileSync } from "node:fs";

const f = (n) => Math.round(n * 100) / 100;

/*
  One gradient in user space rather than one per element.
 
  Both the bowl and the tilde were painted `url(#g)`, and a gradient with no
  gradientUnits is in objectBoundingBox units, so each element got the whole
  violet-to-blush ramp across its own box. The tilde is 18 units wide and the
  bowl is 40, so the tilde ran to full blush at its right-hand end while the
  head directly under it was still violet. Touching the head that was hidden;
  lifted clear of it, it is the first thing you see. userSpaceOnUse over the
  mark's own bounds makes the two elements two parts of one object.
*/
const defs = (id) =>
  `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="12" y1="6" x2="52" y2="58">
      <stop offset="0%" stop-color="#7a6bf0"/>
      <stop offset="100%" stop-color="#e2559a"/>
    </linearGradient>`;

/**
 * @param gap   clear background between the tilde's stroke and the bowl's edge
 * @param w     half the tilde's total width
 * @param h     the control-point throw; the crest sits h/2 off the centreline
 * @param sw    the tilde's stroke width
 */
function mark({ cy = 40, r = 18, gap, w, h, sw, id = "g" }) {
  const bowlTop = cy - r;
  const yMid = f(bowlTop - gap - sw / 2 - h / 2);
  const eyeY = f(cy - 3);
  const smileY = f(cy + 5.4);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <defs>
    ${defs(id)}
  </defs>
  <rect width="64" height="64" rx="16" fill="#fbf9ff"/>
  <circle cx="32" cy="${cy}" r="${r}" fill="url(#${id})"/>
  <path d="M${f(32 - w)} ${yMid}q${f(w / 2)} ${-h} ${w} 0t${w} 0" fill="none" stroke="url(#${id})"
        stroke-width="${sw}" stroke-linecap="round"/>
  <circle cx="26" cy="${eyeY}" r="2.9" fill="#ffffff"/>
  <circle cx="38" cy="${eyeY}" r="2.9" fill="#ffffff"/>
  <path d="M26.6 ${smileY}c1.9 3.2 8.9 3.2 10.8 0" fill="none" stroke="#ffffff"
        stroke-width="2.6" stroke-linecap="round"/>
</svg>
`;
}

/* Exactly what ships today, for the comparison. Nothing here is derived: it is
   the file, so that the sheet compares the mark against itself rather than
   against a redrawing of it. */
const NOW = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#7A6BF0"/>
      <stop offset="100%" stop-color="#E2559A"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="16" fill="#FBF9FF"/>
  <circle cx="32" cy="38" r="20" fill="url(#g)"/>
  <path d="M23 15.5q4.5-7.5 9 0t9 0" fill="none" stroke="url(#g)" stroke-width="4.6" stroke-linecap="round"/>
  <circle cx="25" cy="35" r="3" fill="#ffffff"/>
  <circle cx="39" cy="35" r="3" fill="#ffffff"/>
  <path d="M27 44c1.8 3 8.2 3 10 0" fill="none" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round"/>
</svg>
`;

const SET = [
  ["00-praegune", NOW],
  /* Just off the head. The smallest move that stops the two touching. */
  ["01-veidi", mark({ gap: 2.5, w: 9, h: 7, sw: 4.4 })],
  /* Clear, and the tilde widened to about six tenths of the bowl, which is
     roughly where it sits on a real õ. Narrow, it is a cowlick; at this width
     it is the letter's own diacritic. */
  ["02-selge", mark({ gap: 5, w: 11, h: 6.5, sw: 4.2 })],
  /* Properly floating. The bowl gives up a unit so the tilde is not pressed
     against the top of the tile. */
  ["03-korgel", mark({ cy: 41, r: 17, gap: 8, w: 11, h: 6, sw: 4 })],
  /* Clear, but still the narrow tuft, so the width is a separate decision from
     the height rather than one change wearing two hats. */
  ["04-selge-kitsas", mark({ gap: 5, w: 8.5, h: 7, sw: 4.4 })],
];

for (const [name, out] of SET) {
  const file = `design/icons/polish/${name}.svg`;
  writeFileSync(file, out);
  console.log(`${file}  ${out.length} bytes`);
}
