import { ImageResponse } from "next/og";

/**
 * The home-screen icon on iOS.
 *
 * iOS ignores the SVG in the manifest and wants a PNG at a fixed size, so this
 * draws the same mark — the letter that says "Estonian" faster than any
 * wordmark could — at 180×180. Generated rather than committed as a binary so
 * there is one definition of the brand colour, not two that drift.
 */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#3e6ba8",
          color: "#ffffff",
          fontSize: 118,
          fontWeight: 700,
          fontFamily: "serif",
        }}
      >
        õ
      </div>
    ),
    size,
  );
}
