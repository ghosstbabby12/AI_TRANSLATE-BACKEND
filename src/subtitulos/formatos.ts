import type { Segmento } from "../models/types.js";

export interface Cue {
  inicio: number;
  fin: number;
  texto: string;
}

const MAX_CHARS_CUE = 84; // ~2 líneas de 42 caracteres, estándar de subtítulos

/**
 * Un segmento de 20 s es demasiado texto para una sola línea en pantalla.
 * Se parte el texto traducido en frases/trozos cortos y se reparte el tiempo
 * del segmento proporcionalmente a la longitud de cada trozo.
 */
export function generarCues(segmentos: Segmento[]): Cue[] {
  const cues: Cue[] = [];
  for (const s of segmentos) {
    const texto = s.texto_traducido?.trim();
    if (!texto) continue;
    const trozos = partirTexto(texto, MAX_CHARS_CUE);
    const total = trozos.reduce((n, t) => n + t.length, 0);
    const duracion = s.tiempo_fin - s.tiempo_inicio;
    let t = s.tiempo_inicio;
    for (const trozo of trozos) {
      const d = (duracion * trozo.length) / total;
      cues.push({ inicio: t, fin: t + d, texto: trozo });
      t += d;
    }
  }
  return cues;
}

function partirTexto(texto: string, max: number): string[] {
  // Primero por fin de frase; las frases largas se parten por palabras.
  const frases = texto.match(/[^.!?。！？]+[.!?。！？]*\s*/g) ?? [texto];
  const resultado: string[] = [];
  let actual = "";
  for (const frase of frases.map((f) => f.trim()).filter(Boolean)) {
    if ((actual + " " + frase).trim().length <= max) {
      actual = (actual + " " + frase).trim();
      continue;
    }
    if (actual) resultado.push(actual);
    actual = "";
    if (frase.length <= max) {
      actual = frase;
      continue;
    }
    for (const palabra of frase.split(/\s+/)) {
      if ((actual + " " + palabra).trim().length > max && actual) {
        resultado.push(actual);
        actual = palabra;
      } else {
        actual = (actual + " " + palabra).trim();
      }
    }
  }
  if (actual) resultado.push(actual);
  return resultado;
}

function tiempo(seg: number, separador: "," | "."): string {
  const ms = Math.round(seg * 1000);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(h)}:${p(m)}:${p(s)}${separador}${p(ms % 1000, 3)}`;
}

export function aSrt(cues: Cue[]): string {
  return cues
    .map((c, i) => `${i + 1}\n${tiempo(c.inicio, ",")} --> ${tiempo(c.fin, ",")}\n${c.texto}\n`)
    .join("\n");
}

/** WebVTT es el formato que entiende <track> en el navegador. */
export function aVtt(cues: Cue[]): string {
  const cuerpo = cues.map((c) => `${tiempo(c.inicio, ".")} --> ${tiempo(c.fin, ".")}\n${c.texto}\n`).join("\n");
  return `WEBVTT\n\n${cuerpo}`;
}

export const marcaTiempo = (seg: number) => {
  const s = Math.floor(seg);
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

/**
 * Transcripción legible en texto plano: un párrafo por segmento con su
 * marca de tiempo. Pensado para leer o copiar, no para un reproductor.
 */
export function aTxt(segmentos: Segmento[], encabezado: { titulo: string; idiomas: string }): string {
  const parrafos = segmentos
    .filter((s) => s.texto_traducido?.trim())
    .map((s) => `[${marcaTiempo(s.tiempo_inicio)}] ${s.texto_traducido!.trim()}`);
  return `${encabezado.titulo}\n${encabezado.idiomas}\n\n${parrafos.join("\n\n")}\n`;
}

/**
 * Resumen en texto plano para descargar. El resumen guardado usa "## Título"
 * para las secciones; en el .txt se subrayan para que se lean como títulos.
 */
export function aTxtResumen(resumen: string, encabezado: { titulo: string; idiomas: string }): string {
  const cuerpo = resumen
    .trim()
    .split("\n")
    .map((linea) => {
      const titulo = /^#{1,6}\s+(.+)$/.exec(linea.trim())?.[1];
      return titulo ? `${titulo.toUpperCase()}\n${"─".repeat(Math.min(titulo.length, 60))}` : linea;
    })
    .join("\n");
  return `${encabezado.titulo}\n${encabezado.idiomas}\n\n${cuerpo}\n`;
}
