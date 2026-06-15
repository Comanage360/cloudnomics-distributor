export const T = {
  ink: "#0E1424",
  canvas: "#F4F6FA",
  surface: "#FFFFFF",
  line: "#E2E6EF",
  text: "#131A2B",
  muted: "#5C6781",
  ember: "#FF5A36",
  emberSoft: "#FFEDE7",
  emberLine: "#FFD6C9",
  success: "#12A150",
  successSoft: "#E6F6EC",
} as const;

export const money = (n: number) =>
  "$" + Math.round(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
