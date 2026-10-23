import { ImageResponse } from "next/og";

export const alt = "Simple Bracket — darts tournaments";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Kept centered and narrow: Slack often shows this as a small square thumbnail
// cropped from the middle, and the bullseye and name should survive that crop.
export default function OpengraphImage() {
  const ring = (diameter: number, background: string, child?: React.ReactNode) => (
    <div
      style={{
        width: diameter,
        height: diameter,
        borderRadius: "50%",
        background,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {child}
    </div>
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#0f172a",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 36,
        }}
      >
        {ring(260, "#10b981", ring(222, "#0f172a", ring(146, "#f1ead8", ring(76, "#d62828"))))}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 76, color: "#f1f5f9", letterSpacing: -1 }}>Simple Bracket</div>
          <div style={{ fontSize: 32, color: "#94a3b8" }}>Darts tournaments, single &amp; double elim</div>
        </div>
      </div>
    ),
    size
  );
}
