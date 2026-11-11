import type { Session } from "../../../application/auth/session.js";
import type { UserView } from "../../../application/profile/profile.js";

/** The user as the client sees it: no password hash, the photo as a temporary URL. */
export const presentUser = ({ user, photoUrl }: UserView) => ({
  id: user.id,
  nombre: user.name,
  email: user.email,
  telefono: user.phone,
  idioma_interfaz: user.interfaceLanguage,
  creado_en: user.createdAt,
  actualizado_en: user.updatedAt,
  url_foto: photoUrl,
});

export const presentSession = (session: Session, view: UserView) => ({
  token: session.token,
  usuario: presentUser(view),
});
