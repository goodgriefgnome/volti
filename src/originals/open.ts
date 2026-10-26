// A PDF's password. The password that opened a PDF is remembered on the tablet by its file's id,
// so it is asked for only once, even after a restart, and never forgotten. Asking is the caller's
// (dialogs/passwords.ts); without a way to ask, a PDF whose password isn't remembered doesn't open.

import { keys, kv } from '../storage';
import { titleOf } from './names';
import type { SourceFile } from './original';

/** Ask for a PDF's password, saying whether the last one tried was wrong; null when it isn't given. */
export type AskPassword = (title: string, wrong: boolean) => Promise<string | null>;

/** Opening stopped because the PDF's password wasn't given. */
export class PasswordNotGiven extends Error {
  name = 'PasswordNotGiven';
}

/** The password remembered for a file, if it has needed one. */
export const savedPassword = (id: string) => kv.get<string>(keys.password(id));

/**
 * The passwords to try for an original's PDF, once it has been tried without one: the one
 * remembered for it, then each one `ask` gives. `refused` once there are no more.
 */
export class Passwords {
  private tried?: string;
  refused = false;

  private constructor(private o: SourceFile, private saved: string | undefined, private ask?: AskPassword) {}

  static async for(o: SourceFile, ask?: AskPassword) { return new Passwords(o, await savedPassword(o.id), ask); }

  /** The next password to try, after one that was `wrong`: null when there is none. */
  async next(wrong: boolean): Promise<string | null> {
    if (this.saved !== undefined && this.tried === undefined) return (this.tried = this.saved);
    const p = this.ask ? await this.ask(titleOf(this.o.path), wrong || this.tried !== undefined) : null;
    if (p === null) this.refused = true;
    else this.tried = p;
    return p;
  }

  /** The PDF opened: remember the password that opened it, if it is a new one. */
  async keep() {
    if (this.tried !== undefined && this.tried !== this.saved) await kv.set(keys.password(this.o.id), this.tried);
  }

  /** Why opening stopped: PasswordNotGiven when it was for want of a password. */
  failure(e: unknown) {
    return this.refused ? new PasswordNotGiven(`“${titleOf(this.o.path)}” needs its password`) : e;
  }
}

