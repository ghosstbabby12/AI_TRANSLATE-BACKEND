import { aplicarMigraciones } from "./db/migraciones.js";
import { describirError, reintentarHastaLograr } from "./util/resiliencia.js";

/**
 * Estado del arranque. La API abre el puerto de inmediato (así /salud responde
 * siempre) y aplica las migraciones en segundo plano; mientras no estén
 * listas, las rutas que usan la base responden 503 en vez de colgarse.
 */
export const estadoArranque = {
  migraciones: "pendiente" as "pendiente" | "ok",
  ultimoError: null as string | null,
};

export async function prepararBaseDeDatos(): Promise<void> {
  await reintentarHastaLograr("base de datos", aplicarMigraciones, (err) => {
    estadoArranque.ultimoError = describirError(err);
  });
  estadoArranque.migraciones = "ok";
  estadoArranque.ultimoError = null;
  console.log("Base de datos lista");
}
