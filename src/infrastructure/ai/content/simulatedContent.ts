// Sample texts returned by the simulated AI (IA_MODO=simulada).

export const SAMPLE_PHRASES = [
  "Hola a todos y bienvenidos a este video.",
  "Hoy vamos a ver cómo funciona este sistema paso a paso.",
  "Primero se extrae el audio y se divide en segmentos cortos.",
  "Cada segmento se transcribe y luego se traduce con contexto.",
  "Así los subtítulos aparecen mientras el resto se sigue procesando.",
  "Si un segmento falla, se reintenta sin detener a los demás.",
  "Al final se pueden descargar los subtítulos en SRT o VTT.",
  "Gracias por mirar, nos vemos en el próximo video.",
];

/** A summary with the same format as the real one (## sections and bullets). */
export function sampleSummary(lines: string[], languageName: string): string {
  const timestamp = (line: string) => /^\[([\d:]+)\]/.exec(line)?.[1] ?? "00:00";
  const withoutTimestamp = (line: string) => line.replace(/^\[[\d:]+\]\s*/, "");
  const picked = lines.filter((_, i) => i % Math.max(1, Math.floor(lines.length / 4)) === 0).slice(0, 4);
  return [
    `## Resumen (${languageName}, simulado)`,
    `Este es un resumen de prueba generado sin IA a partir de ${lines.length} fragmento(s) de la transcripción.`,
    "",
    "## Puntos clave",
    ...picked.map((l) => `- ${withoutTimestamp(l).slice(0, 120)}`),
    "",
    "## Momentos destacados",
    ...picked.map((l) => `- [${timestamp(l)}] ${withoutTimestamp(l).slice(0, 80)}`),
  ].join("\n");
}
