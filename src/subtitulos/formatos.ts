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
