/* The door to the sealed half of the bestiary.

   A console command rather than a field on the page, because it is not for
   everybody: the people who have the password have been given it, and a login
   box on the front of a challenge rating calculator would only invite the
   people who have not to wonder what they are missing. */

import { isUnlocked, lock, restore, unlock } from './vault.ts';
import { SEALED_COUNT } from '../data/bestiaryCounts.ts';

interface ConsoleApi {
  unlock: (password: string) => Promise<string>;
  lock: () => string;
  status: () => string;
}

const status = (): string => (isUnlocked()
  ? `Open. All ${SEALED_COUNT} sealed creatures are in the picker.`
  : `Locked. ${SEALED_COUNT} creatures are sealed; the reference document ones are already there.`);

export function installConsoleApi(): void {
  const api: ConsoleApi = {
    async unlock(password: string): Promise<string> {
      if (typeof password !== 'string' || !password) {
        throw new Error("Pass the password as a string: crCalc.unlock('…')");
      }
      const opened = await unlock(password);
      const message = `Open. ${opened} more creatures are now in the picker.`;
      console.info(message);
      return message;
    },
    lock(): string {
      lock();
      return 'Locked again, and the browser has forgotten the password.';
    },
    status,
  };

  /* Not writable, so a page script cannot quietly replace it with one that
     keeps what it is handed. */
  Object.defineProperty(window, 'crCalc', {
    value: Object.freeze(api),
    writable: false,
    configurable: false,
    enumerable: false,
  });

  restore();
  console.info(
    `CR Calculator. ${status()}\nUnlock with crCalc.unlock('…') if you have been given the password.`,
  );
}
