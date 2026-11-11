export type InterfaceLanguage = "es" | "en";

export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  phone: string | null;
  photoKey: string | null;
  interfaceLanguage: InterfaceLanguage;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProfileChanges {
  name?: string;
  email?: string;
  phone?: string | null;
  interfaceLanguage?: InterfaceLanguage;
}
