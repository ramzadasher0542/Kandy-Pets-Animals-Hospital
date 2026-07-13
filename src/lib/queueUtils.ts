/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClinicQueueItem } from '../types';

const urgencyRank = (u?: ClinicQueueItem['urgency']): number => {
  if (u === 'emergency') return 0;
  if (u === 'non-emergency') return 1;
  return 2; // routine, and undefined (treated as routine)
};

/**
 * Single source of truth for ordering the shared clinic queue: emergency first,
 * then non-emergency, then routine/undefined — FIFO by checkInTime within each tier.
 * Does not mutate the input array.
 */
export function sortQueueByUrgency(queue: ClinicQueueItem[]): ClinicQueueItem[] {
  return [...queue].sort((a, b) => {
    const rankDiff = urgencyRank(a.urgency) - urgencyRank(b.urgency);
    if (rankDiff !== 0) return rankDiff;
    return new Date(a.checkInTime).getTime() - new Date(b.checkInTime).getTime();
  });
}
