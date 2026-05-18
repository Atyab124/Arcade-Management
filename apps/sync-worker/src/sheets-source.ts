import { google } from 'googleapis';
import { JWT } from 'google-auth-library';

/**
 * Google Sheets source — service-account authenticated, supports both metadata fetch
 * (for the modifiedTime gate) and batched value reads.
 *
 * Setup gotcha: the sheet must be shared with the service account's email address.
 * Both the Sheets API AND the Drive API must be enabled in the GCP project — Drive is
 * required for the modifiedTime metadata lookup.
 */

export interface SheetsRow {
  rowNumber: number;
  values: Record<string, string>;
}

export interface SheetsSource {
  getModifiedTime(spreadsheetId: string): Promise<Date | null>;
  readRows(spreadsheetId: string, range: string): Promise<SheetsRow[]>;
}

export class GoogleSheetsSource implements SheetsSource {
  private readonly auth: JWT;

  constructor(credentialsJson: object) {
    this.auth = new JWT({
      email: (credentialsJson as { client_email: string }).client_email,
      key: (credentialsJson as { private_key: string }).private_key,
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets.readonly',
        'https://www.googleapis.com/auth/drive.metadata.readonly',
      ],
    });
  }

  async getModifiedTime(spreadsheetId: string): Promise<Date | null> {
    const drive = google.drive({ version: 'v3', auth: this.auth });
    const res = await drive.files.get({ fileId: spreadsheetId, fields: 'modifiedTime' });
    const modified = res.data.modifiedTime;
    return modified ? new Date(modified) : null;
  }

  async readRows(spreadsheetId: string, range: string): Promise<SheetsRow[]> {
    const sheets = google.sheets({ version: 'v4', auth: this.auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
      // UNFORMATTED_VALUE keeps numbers and dates as raw values; FORMATTED_VALUE returns
      // user-locale strings ("5/18/2026") which break parsing.
      valueRenderOption: 'UNFORMATTED_VALUE',
      dateTimeRenderOption: 'FORMATTED_STRING',
    });
    const grid = res.data.values ?? [];
    if (grid.length < 2) return [];
    const headers = (grid[0] ?? []).map(h => String(h ?? '').trim());
    const out: SheetsRow[] = [];
    for (let i = 1; i < grid.length; i++) {
      const row = grid[i] ?? [];
      const values: Record<string, string> = {};
      for (let j = 0; j < headers.length; j++) {
        const h = headers[j];
        if (!h) continue;
        const v = row[j];
        values[h] = v === undefined || v === null ? '' : String(v);
      }
      out.push({ rowNumber: i + 1, values });
    }
    return out;
  }
}

/** In-memory fake for tests and dev when no GCP credentials are present. */
export class FakeSheetsSource implements SheetsSource {
  constructor(
    public rows: SheetsRow[] = [],
    public modifiedTime: Date | null = new Date(),
  ) {}
  async getModifiedTime(): Promise<Date | null> { return this.modifiedTime; }
  async readRows(): Promise<SheetsRow[]> { return this.rows; }
}
