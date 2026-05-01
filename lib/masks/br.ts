/** Digits only, max 11 (mobile) or 10 (landline without 9). */
export function normalizePhoneDigits(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 11);
}

/** (99) 99999-9999 or (99) 9999-9999 */
export function maskPhoneBr(raw: string): string {
  const d = normalizePhoneDigits(raw);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10)
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7, 11)}`;
}

export function normalizeCep(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 8);
}

/** 99999-999 */
export function maskCep(raw: string): string {
  const d = normalizeCep(raw);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

export function normalizeEmailInput(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "");
}
