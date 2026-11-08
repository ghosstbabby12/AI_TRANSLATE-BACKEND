import { aplicarMigraciones } from "./migraciones.js";
import { pool } from "./pool.js";

// Uso manual: `npm run migrate`. La API también las aplica sola al arrancar.
aplicarMigraciones()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
