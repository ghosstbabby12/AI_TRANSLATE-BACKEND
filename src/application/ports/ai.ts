export interface Transcription {
  text: string;
  /** ISO code of the detected language, when the model reports it. */
  language?: string;
}

export interface TranslationRequest {
  text: string;
  targetLanguage: string;
  /** The previous segment, used as context so the subtitles read as one text. */
  previous?: { original: string | null; translated: string | null } | null;
}

export interface SummaryRequest {
  title: string;
  language: string;
  fragments: { time: string; text: string }[];
}

/**
 * AI adapters throw `RetryableError` or `PermanentError` (domain/errors.ts),
 * never provider-specific errors.
 */
export interface Transcriber {
  /** `hint` is the end of the previous segment, so names keep the same spelling. */
  transcribe(audio: Buffer, hint?: string | null): Promise<Transcription>;
}

export interface Translator {
  translate(request: TranslationRequest): Promise<string>;
}

export interface Summarizer {
  summarize(request: SummaryRequest): Promise<string>;
}
