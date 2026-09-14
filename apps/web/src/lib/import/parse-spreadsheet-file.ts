function escapeCsvCell(value: string): string {
  return /[",\r\n;]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  )
    return String(value);
  if (
    typeof value === "object" &&
    "text" in value &&
    typeof value.text === "string"
  )
    return value.text;
  if (typeof value === "object" && "result" in value)
    return cellText(value.result);
  return String(value);
}

export async function parseSpreadsheetFile(file: File): Promise<string> {
  if (file.name.toLocaleLowerCase("tr-TR").endsWith(".csv")) return file.text();
  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();
  const workbookBytes = new Uint8Array(await file.arrayBuffer());
  await workbook.xlsx.load(workbookBytes);
  const worksheet = workbook.worksheets[0];
  if (!worksheet)
    throw new Error("Excel dosyasında okunabilir çalışma sayfası bulunamadı.");
  const rows: string[] = [];
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    const values: string[] = [];
    for (let column = 1; column <= worksheet.columnCount; column += 1) {
      values.push(escapeCsvCell(cellText(row.getCell(column).value).trim()));
    }
    rows.push(values.join(","));
  });
  if (rows.length < 2)
    throw new Error(
      "Excel dosyasında başlık ve en az bir veri satırı bulunmalıdır.",
    );
  return rows.join("\n");
}
