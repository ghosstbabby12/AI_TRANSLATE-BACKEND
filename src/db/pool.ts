import pg from "pg";
import { config } from "../config.js";
import { logLimitado } from "../util/resiliencia.js";

// NUMERIC llega como string por defecto; los tiempos los queremos como number.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => Number(v));

export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  max: 10,
  // Sin esto, pg espera lo que dure el timeout del sistema (más de un minuto)
  // si la base no responde, p. ej. una base gratuita de Render vencida.
  connectionTimeoutMillis: 10_000,
  // Ninguna consulta de la app tarda más de unos milisegundos: si una se
  // atasca, se corta en vez de dejar la petición colgada.
  query_timeout: 15_000,
  statement_timeout: 15_000,
  idleTimeoutMillis: 30_000,
});

// Un cliente inactivo que pierde la conexión emite 'error'; sin este manejador
// Node lo trataría como excepción no capturada y tumbaría el proceso.
pool.on("error", logLimitado("postgres"));
