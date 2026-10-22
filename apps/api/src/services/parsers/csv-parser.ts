import { parse } from 'csv-parse';
import { Readable } from 'node:stream';
import { FINANCIAL_LIMITS, ERROR_CODES } from '@moneylens/shared';
import { AppError } from '../../middleware/error-handler.js';

export interface ParsedFileContent {
  headers: string[];
  rows: { rowNumber: number; data: Record<string, string> }[];
  totalRows: number;
}

/**
 * Parses CSV buffer into structured headers and rows with bounded processing.
 */
export async function parseCsvBuffer(buffer: Buffer): Promise<ParsedFileContent> {
  if (buffer.length === 0) {
    throw new AppError(400, ERROR_CODES.EMPTY_FILE, 'The uploaded CSV file is empty.');
  }

  return new Promise((resolve, reject) => {
    const rows: { rowNumber: number; data: Record<string, string> }[] = [];
    let headers: string[] = [];
    let rowCounter = 0;

    const parser = parse({
      columns: (firstRow: string[]) => {
        headers = firstRow.map((col) => col.trim());
        return headers;
      },
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      max_record_size: 65536,
    });

    const stream = Readable.from(buffer);

    parser.on('readable', () => {
      let record: Record<string, string> | null;
      while ((record = parser.read()) !== null) {
        rowCounter++;

        if (rowCounter > FINANCIAL_LIMITS.MAX_ROW_COUNT) {
          parser.destroy();
          reject(
            new AppError(
              400,
              ERROR_CODES.ROW_LIMIT_EXCEEDED,
              `File exceeds the maximum limit of ${FINANCIAL_LIMITS.MAX_ROW_COUNT} rows.`,
            ),
          );
          return;
        }

        // Clean string values
        const cleanRecord: Record<string, string> = {};
        for (const [key, val] of Object.entries(record)) {
          cleanRecord[key] = val !== undefined && val !== null ? String(val).trim() : '';
        }

        rows.push({
          rowNumber: rowCounter + 1, // 1-indexed (row 1 is header)
          data: cleanRecord,
        });
      }
    });

    parser.on('error', (err) => {
      reject(
        new AppError(400, ERROR_CODES.INVALID_ROW_DATA, `Failed to parse CSV file: ${err.message}`),
      );
    });

    parser.on('end', () => {
      if (headers.length === 0 || rows.length === 0) {
        reject(
          new AppError(
            400,
            ERROR_CODES.EMPTY_FILE,
            'The CSV file does not contain valid header columns or data rows.',
          ),
        );
        return;
      }

      resolve({
        headers,
        rows,
        totalRows: rows.length,
      });
    });

    stream.pipe(parser);
  });
}
