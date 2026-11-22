/** A location identifies a manifest entry or payload field without echoing its value. */
export interface Issue {
  code: string;
  at: string;
  severity: 'error' | 'warning';
}
