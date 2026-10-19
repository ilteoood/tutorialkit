/**
 * Lightweight wrapper around Nodepod.boot
 * to only boot if there's no risk on crashing the browser.
 *
 * This typically might happen on iOS.
 *
 * When iOS is detected, a call to `unblock()` is required
 * to move forward with the boot.
 */
import { Nodepod, type NodepodOptions } from '@r1ck404/nodepod';
import { atom, type ReadableAtom } from 'nanostores';
import { withResolvers } from '../utils/promises.js';

export type BootStatus = 'unknown' | 'blocked' | 'booting' | 'booted';

const localBootStatus = atom<BootStatus>('unknown');
const blockingStatus = withResolvers<void>();

export const bootStatus: ReadableAtom<BootStatus> = localBootStatus;

export async function safeBoot(options: NodepodOptions) {
  if (localBootStatus.get() === 'unknown') {
    localBootStatus.set(isRestricted() ? 'blocked' : 'booting');
  }

  if (localBootStatus.get() === 'blocked') {
    await blockingStatus.promise;

    localBootStatus.set('booting');
  }

  const pod = await Nodepod.boot(options);

  localBootStatus.set('booted');

  return pod;
}

export function unblockBoot() {
  if (localBootStatus.get() !== 'blocked') {
    return;
  }

  blockingStatus.resolve();
}

function isRestricted() {
  const { userAgent, maxTouchPoints, platform } = navigator;

  const iOS = /iPhone/.test(userAgent) || platform === 'iPhone';
  const iPadOS = (platform === 'MacIntel' && maxTouchPoints > 1) || platform === 'iPad';

  return iOS || iPadOS;
}
