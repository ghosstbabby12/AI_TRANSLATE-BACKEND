// Idiomas destino soportados: código ISO-639-1 -> nombre que se le pasa al LLM.
export const IDIOMAS = {
  es: "español",
  en: "inglés",
  pt: "portugués",
  fr: "francés",
  de: "alemán",
  it: "italiano",
  ja: "japonés",
  ko: "coreano",
  zh: "chino (simplificado)",
} as const;

export type CodigoIdioma = keyof typeof IDIOMAS;

export const CODIGOS_IDIOMA = Object.keys(IDIOMAS) as [CodigoIdioma, ...CodigoIdioma[]];

export function nombreIdioma(codigo: string): string {
  return IDIOMAS[codigo as CodigoIdioma] ?? codigo;
}
