import { TooManyRequestsError, UnauthorizedError, ConflictError } from "../../domain/errors.js";
import type { User } from "../../domain/user.js";
import { MESSAGES } from "../messages.js";
import type { Deps } from "../ports/index.js";

export interface Credentials {
  email: string;
  password: string;
  /** Id the browser used before signing in, so its earlier videos are kept. */
  anonymousId?: string;
}

export interface Session {
  token: string;
  user: User;
}

export function makeSessionUseCases({ users, videos, passwords, tokens, loginLimiter }: Deps) {
  const startSession = async (user: User, anonymousId?: string): Promise<Session> => {
    if (anonymousId) await videos.transferAnonymousVideos(anonymousId, user.id);
    return { token: await tokens.sign(user.id), user };
  };

  async function register(input: Credentials & { name: string }): Promise<Session> {
    const passwordHash = await passwords.hash(input.password);
    const user = await users.create({ name: input.name, email: input.email, passwordHash });
    if (!user) throw new ConflictError(MESSAGES.auth.emailTaken);
    return startSession(user, input.anonymousId);
  }

  async function login(input: Credentials, ip: string): Promise<Session> {
    if (await loginLimiter.isBlocked(ip, input.email)) throw new TooManyRequestsError(MESSAGES.auth.tooManyAttempts);

    const user = await users.findByEmail(input.email);
    // Verifying against a dummy hash when the email does not exist makes both
    // answers take the same time, so registered emails cannot be guessed.
    const valid = await passwords.verify(input.password, user?.passwordHash ?? passwords.dummyHash);
    if (!user || !valid) {
      await loginLimiter.recordFailure(ip, input.email);
      throw new UnauthorizedError(MESSAGES.auth.wrongCredentials);
    }
    await loginLimiter.reset(ip, input.email);
    return startSession(user, input.anonymousId);
  }

  /** The signed-in user; fails if the account no longer exists. */
  async function currentUser(userId: string): Promise<User> {
    const user = await users.findById(userId);
    if (!user) throw new UnauthorizedError(MESSAGES.auth.invalidSession);
    return user;
  }

  return { register, login, currentUser };
}
