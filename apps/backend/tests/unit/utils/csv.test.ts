import { describe, expect, it } from "vitest";
import { buildCsv, parseCsv } from "../../../src/utils/csv.js";

describe("CSV safety and round-trip", () => {
  it("round-trips quoted commas, quotes, Turkish text and embedded newlines", () => {
    const csv = buildCsv(
      ["code", "name"],
      [{ code: "TR-1", name: 'İstanbul, "Merkez"\nŞube' }],
    );
    expect(parseCsv(csv).rows).toEqual([
      { code: "TR-1", name: 'İstanbul, "Merkez"\nŞube' },
    ]);
  });

  it.each(["=2+3", "+SUM(A1)", "-1+2", "@cmd"])(
    "neutralizes spreadsheet formula cell %s",
    (value) => {
      expect(buildCsv(["value"], [{ value }])).toContain(`'${value}`);
    },
  );

  it("supports semicolon-delimited input", () => {
    expect(parseCsv("code;name\r\nA;Ürün").rows).toEqual([
      { code: "A", name: "Ürün" },
    ]);
  });
});
