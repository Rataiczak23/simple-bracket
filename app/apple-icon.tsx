import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Same bullseye as icon.svg, on a full-bleed board: iOS rounds the corners
// itself and fills any transparency with black.
export default function AppleIcon() {
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
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {ring(150, "#10b981", ring(128, "#0f172a", ring(84, "#f1ead8", ring(44, "#d62828"))))}
      </div>
    ),
    size
  );
}
