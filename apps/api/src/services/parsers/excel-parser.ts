import ExcelJS from 'exceljs';
import { FINANCIAL_LIMITS, ERROR_CODES } from '@moneylens/shared';
import { AppError } from '../../middleware/error-handler.js';
import type { ParsedFileContent } from './csv-parser.js';

/**
 * Extracts a safe scalar string from an Excel cell value without executing formulas.
 */
function extractCellValue(cell: ExcelJS.Cell): string {
  const value = cell.value;
  if (value === null || value === undefined) {
    return '';
  }

  // Handle formula cells: ExcelJS represents formulas as { formula: '...', result: ... }
  if (typeof value === 'object' && 'formula' in value) {
    const result = (value as { result?: unknown }).result;
    return result !== null && result !== undefined ? String(result).trim() : '';
  }

  // Handle rich text
  if (typeof value === 'object' && 'richText' in value) {
    const richTexts = (value as { richText: { text: string }[] }).richText;
    return richTexts
      .map((r) => r.text)
      .join('')
      .trim();
  }

  // Handle Date cells
  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value).trim();
}

/**
 * Parses XLSX buffer into structured headers and rows using ExcelJS.
 */
export async function parseExcelBuffer(buffer: Buffer): Promise<ParsedFileContent> {
  if (buffer.length === 0) {
    throw new AppError(400, ERROR_CODES.EMPTY_FILE, 'The uploaded Excel file is empty.');
  }

  // Magic bytes check for ZIP/XLSX: PK.. (0x50, 0x4B, 0x03, 0x04)
  if (
    buffer.length < 4 ||
    buffer[0] !== 0x50 ||
    buffer[1] !== 0x4b ||
    buffer[2] !== 0x03 ||
    buffer[3] !== 0x04
  ) {
    throw new AppError(
      400,
      ERROR_CODES.INVALID_FILE_FORMAT,
      'The file does not have a valid Excel (.xlsx) file signature.',
    );
  }

  const workbook = new ExcelJS.Workbook();

  try {
    // Read from buffer
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch (err) {
    throw new AppError(
      400,
      ERROR_CODES.INVALID_FILE_FORMAT,
      `Failed to parse Excel file structure: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet || worksheet.rowCount === 0) {
    throw new AppError(
      400,
      ERROR_CODES.EMPTY_FILE,
      'The Excel file contains no readable worksheets or data rows.',
    );
  }

  const headerRow = worksheet.getRow(1);
  const headers: string[] = [];

  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const headerVal = extractCellValue(cell);
    headers[colNumber - 1] = headerVal || `Column_${colNumber}`;
  });

  if (headers.length === 0) {
    throw new AppError(
      400,
      ERROR_CODES.EMPTY_FILE,
      'The Excel worksheet does not contain valid header columns in row 1.',
    );
  }

  const rows: { rowNumber: number; data: Record<string, string> }[] = [];
  let rowCount = 0;

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    // Skip header row
    if (rowNumber === 1) return;

    rowCount++;
    if (rowCount > FINANCIAL_LIMITS.MAX_ROW_COUNT) {
      throw new AppError(
        400,
        ERROR_CODES.ROW_LIMIT_EXCEEDED,
        `Excel sheet exceeds the maximum limit of ${FINANCIAL_LIMITS.MAX_ROW_COUNT} rows.`,
      );
    }

    const rowData: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      const headerName = headers[i];
      if (headerName) {
        const cell = row.getCell(i + 1);
        rowData[headerName] = extractCellValue(cell);
      }
    }

    rows.push({
      rowNumber,
      data: rowData,
    });
  });

  if (rows.length === 0) {
    throw new AppError(
      400,
      ERROR_CODES.EMPTY_FILE,
      'The Excel sheet does not contain any transaction data rows.',
    );
  }

  return {
    headers: headers.filter(Boolean),
    rows,
    totalRows: rows.length,
  };
}
