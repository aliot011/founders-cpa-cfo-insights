// Minimal types for the QBO API surfaces we touch.

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds (access token)
  x_refresh_token_expires_in: number; // seconds (refresh token)
  token_type: string;
}

export interface QboCompanyInfo {
  CompanyName: string;
  CompanyStartDate?: string; // YYYY-MM-DD
}

export interface QboAccount {
  Id: string;
  Name: string;
  FullyQualifiedName: string;
  AccountType: string;
  AccountSubType?: string;
  Active?: boolean;
}

// ---- Report JSON (GeneralLedger) -------------------------------------------

export interface ReportColData {
  value?: string;
  id?: string;
}

export interface ReportRow {
  type?: 'Data' | 'Section';
  ColData?: ReportColData[];
  Header?: { ColData?: ReportColData[] };
  Rows?: { Row?: ReportRow[] };
  Summary?: { ColData?: ReportColData[] };
}

export interface ReportColumn {
  ColType?: string;
  ColTitle?: string;
  /** The stable column key lives here, e.g. { Name: 'ColKey', Value: 'tx_date' }. */
  MetaData?: { Name?: string; Value?: string }[];
}

export interface GeneralLedgerReport {
  Header?: {
    ReportName?: string;
    StartPeriod?: string;
    EndPeriod?: string;
    Option?: { Name?: string; Value?: string }[];
  };
  Columns?: { Column?: ReportColumn[] };
  Rows?: { Row?: ReportRow[] };
}
