import { ImageResponse } from "next/og";

/**
 * The home-screen icon on iOS.
 *
 * iOS ignores the SVG in the manifest and wants a PNG at a fixed size, so this
 * draws the same mark at 180×180: the same face, the same tilde clear of it,
 * the same gradient. It used to draw a bare õ glyph in a serif instead, so the
 * browser tab, the Android launcher and the iOS home screen each showed a
 * different thing and one of the three was a letter nobody had drawn.
 *
 * No rounded corners of its own. iOS applies its own superellipse mask and
 * composites the result on black wherever the source is transparent, so the
 * background is painted square and edge to edge and the system does the
 * rounding. That mask crops far less than Android's circle, which is why this
 * carries the mark at full size and `public/app-icon-maskable.svg` does not.
 *
 * The mark is handed over as a data URI rather than rebuilt out of divs,
 * because a tilde is a curve and satori's box model has no way to draw one.
 */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const MARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="180" height="180">
  <defs>
    <linearGradient id="g" gradientUnits="userSpaceOnUse" x1="12" y1="6" x2="52" y2="58">
      <stop offset="0%" stop-color="#7a6bf0"/>
      <stop offset="100%" stop-color="#e2559a"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" fill="#fbf9ff"/>
  <circle cx="32" cy="40" r="18" fill="url(#g)"/>
  <path d="M21 15.15q5.5 -6.5 11 0t11 0" fill="none" stroke="url(#g)" stroke-width="4.2" stroke-linecap="round"/>
  <circle cx="26" cy="37" r="2.9" fill="#ffffff"/>
  <circle cx="38" cy="37" r="2.9" fill="#ffffff"/>
  <path d="M26.6 45.4c1.9 3.2 8.9 3.2 10.8 0" fill="none" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round"/>
</svg>`;

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex" }}>
        <img
          width={size.width}
          height={size.height}
          src={`data:image/svg+xml;utf8,${encodeURIComponent(MARK)}`}
          alt=""
        />
      </div>
    ),
    size,
  );
}
