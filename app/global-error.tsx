"use client";

/**
 * The last resort: an error in the root layout itself, where no app chrome and
 * none of the theme variables are available. It therefore carries its own
 * colours and its own <html>/<body>, and depends on nothing.
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
          background: "#faf9f7",
          color: "#1c1a17",
        }}
      >
        <main style={{ maxWidth: "34rem", padding: "2rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.5rem", margin: 0 }}>Kodukeel could not start</h1>
          <p style={{ marginTop: ".75rem", lineHeight: 1.6, color: "#54504a" }}>
            Something failed before the app could load. Your deck and review history are stored on
            the server and are not affected.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: "1.5rem", padding: ".55rem 1rem", fontSize: ".95rem",
              borderRadius: ".375rem", border: "1px solid #1c1a17",
              background: "#1c1a17", color: "#faf9f7", cursor: "pointer",
            }}
          >
            Try again
          </button>
          {error.digest && (
            <p style={{ marginTop: "2rem", fontSize: ".8rem", color: "#8a847c" }}>
              Reference {error.digest}
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
