const TZ = process.env.NEXT_PUBLIC_APP_TIMEZONE ?? "America/Sao_Paulo";

const dateTimeOpts: Intl.DateTimeFormatOptions = {
  timeZone: TZ,
  dateStyle: "short",
  timeStyle: "short",
};

const dateOpts: Intl.DateTimeFormatOptions = {
  timeZone: TZ,
  dateStyle: "short",
};

const timeOpts: Intl.DateTimeFormatOptions = {
  timeZone: TZ,
  timeStyle: "short",
};

export function formatDateTimePtBr(iso: string | number | Date): string {
  return new Date(iso).toLocaleString("pt-BR", dateTimeOpts);
}

export function formatDatePtBr(iso: string | number | Date): string {
  return new Date(iso).toLocaleString("pt-BR", dateOpts);
}

export function formatTimePtBr(iso: string | number | Date): string {
  return new Date(iso).toLocaleString("pt-BR", timeOpts);
}
