import path from "node:path";
import { BadRequestError, ConflictError, ForbiddenError } from "../../domain/errors.js";
import type { ProfileChanges, User } from "../../domain/user.js";
import { describeError } from "../../shared/resilience.js";
import { MESSAGES } from "../messages.js";
import type { Deps } from "../ports/index.js";
import { storageKeys } from "../shared/storageKeys.js";

export interface UserView {
  user: User;
  photoUrl: string | null;
}

export function makeProfileUseCases({ users, passwords, storage, media, workspace }: Deps) {
  const PHOTO_URL_SECONDS = 24 * 3600;

  /** What the client sees: the photo as a temporary URL. */
  async function view(user: User): Promise<UserView> {
    return { user, photoUrl: user.photoKey ? await storage.signedUrl(user.photoKey, PHOTO_URL_SECONDS) : null };
  }

  /** Changing the email requires the current password: a stolen session must not take over the account. */
  async function update(user: User, changes: ProfileChanges, currentPassword?: string): Promise<User> {
    if (changes.email && changes.email !== user.email) {
      const confirmed = currentPassword && (await passwords.verify(currentPassword, user.passwordHash));
      if (!confirmed) throw new ForbiddenError(MESSAGES.profile.confirmPasswordForEmail);
    }
    const updated = await users.updateProfile(user.id, changes);
    if (!updated) throw new ConflictError(MESSAGES.auth.emailTaken);
    return updated;
  }

  async function changePassword(user: User, current: string, next: string): Promise<void> {
    if (!(await passwords.verify(current, user.passwordHash))) throw new ForbiddenError(MESSAGES.profile.wrongCurrentPassword);
    await users.updatePassword(user.id, await passwords.hash(next));
  }

  async function setPhoto(user: User, uploadedPath: string): Promise<User> {
    const key = storageKeys.profilePhoto(user.id);
    await workspace.withTempDir("foto-", async (dir) => {
      const output = path.join(dir, "foto.jpg");
      await media.makeAvatar(uploadedPath, output).catch(() => {
        throw new BadRequestError(MESSAGES.profile.unreadableImage);
      });
      await storage.upload(key, output, "image/jpeg");
    });
    await replacePhoto(user.id, key);
    return (await users.findById(user.id))!;
  }

  async function removePhoto(user: User): Promise<User> {
    await replacePhoto(user.id, null);
    return (await users.findById(user.id))!;
  }

  async function replacePhoto(userId: string, key: string | null) {
    const previous = await users.setPhoto(userId, key);
    if (previous) storage.delete(previous).catch((e) => console.warn(`[profile] old photo not deleted: ${describeError(e)}`));
  }

  return { view, update, changePassword, setPhoto, removePhoto };
}
