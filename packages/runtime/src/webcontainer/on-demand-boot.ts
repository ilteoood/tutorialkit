/**
 * Lightweight wrapper around Nodepod.boot that only boots if there's no
 * risk of crashing the browser.
 *
 * On iOS we delay boot behind `unblock()` so a tap can authorize the pod.
 */
import { Nodepod } from '@r1ck404/nodepod';
import { atom, type ReadableAtom } from 'nanostores';
import { withResolvers } from '../utils/promises.js';

export type BootStatus = 'unknown' | 'blocked' | 'booting' | 'booted';

export interface BootOptions {
  workdirName?: string;
  files?: Record<string, string | Uint8Array>;
}

const localBootStatus = atom<BootStatus>('unknown');
const blockingStatus = withResolvers<void>();

export const bootStatus: ReadableAtom<BootStatus> = localBootStatus;

export async function safeBoot(options: BootOptions = {}) {
  if (localBootStatus.get() === 'unknown') {
    localBootStatus.set(isRestricted() ? 'blocked' : 'booting');
  }

  if (localBootStatus.get() === 'blocked') {
    await blockingStatus.promise;

    localBootStatus.set('booting');
  }

  const nodepod = await Nodepod.boot({
    workdir: `/home/${options.workdirName ?? 'tutorial'}`,
    files: options.files,
  });

  localBootStatus.set('booted');

  return nodepod;
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
