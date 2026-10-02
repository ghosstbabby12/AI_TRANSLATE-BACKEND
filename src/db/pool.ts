import pg from "pg";
import { config } from "../config.js";

// NUMERIC llega como string por defecto; los tiempos los queremos como number.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => Number(v));

export const pool = new pg.Pool({ connectionString: config.DATABASE_URL, max: 10 });
