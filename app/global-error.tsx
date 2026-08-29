"use client";

/**
 * The last resort: an error in the root layout itself.
 *
 * `globals.css` may never have loaded, so every token would resolve to nothing.
 * This is the one file allowed a raw hex — the design-system invariant exempts
 * it by name for exactly that reason — and the values are copied from the light
 * palette so a reader who never sees this page twice does not notice the seam.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#fbf9ff",
          color: "#241f35",
        }}
      >
        <main style={{ maxWidth: "34rem", padding: "2rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.5rem", margin: 0 }}>Kodukeel could not start</h1>
          <p style={{ marginTop: ".75rem", lineHeight: 1.6, color: "#5b5470" }}>
            Something failed before the app could load. Your deck and review history are stored on
            the server and are not affected.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: "1.5rem", padding: ".55rem 1rem", fontSize: ".95rem",
              borderRadius: ".375rem", border: "1px solid #241f35",
              background: "#241f35", color: "#fbf9ff", cursor: "pointer",
            }}
          >
            Try again
          </button>
          {error.digest && (
            <p style={{ marginTop: "2rem", fontSize: ".8rem", color: "#5b5470" }}>
              Reference {error.digest}
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
