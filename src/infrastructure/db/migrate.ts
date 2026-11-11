import { applyMigrations } from "./migrations.js";
import { pool } from "./pool.js";

// Manual use: `npm run migrate`. The API also applies them on startup.
applyMigrations()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
