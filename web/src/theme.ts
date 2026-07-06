export const money = (n: number) =>
  "$" + Math.round(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
