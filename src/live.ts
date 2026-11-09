/**
 * Live mode: one named person holds control of a service and moves its
 * current item; everyone else follows. Advancing is deliberate, one step at a
 * time, with Back as its undo.
 */
import type { DeviceState, LiveState } from './api_types';

export type LiveRole = 'controller' | 'follower';

/** Whether the person `meId` controls `live` or follows it. */
export function liveRole(live: LiveState, meId: number | null): LiveRole {
  return meId === live.controller.id ? 'controller' : 'follower';
}

/** The index Next moves to, or null on the last item. */
export function nextIndex(live: LiveState): number | null {
  return live.next === null ? null : live.currentIndex + 1;
}

/** The index Back moves to, or null on the first item. */
export function backIndex(live: LiveState): number | null {
  return live.currentIndex > 0 ? live.currentIndex - 1 : null;
}

export interface DeviceBadge {
  readonly label: string;
  readonly tone: 'ok' | 'warning' | 'error' | 'neutral';
}

/** How the page shows a device's state, as the worker reported it. */
export function deviceBadge(state: DeviceState): DeviceBadge {
  switch (state) {
    case 'ok':
      return { label: 'Connected', tone: 'ok' };
    case 'unreachable':
      return { label: 'Unreachable', tone: 'error' };
    case 'unconfigured':
      return { label: 'Not set up', tone: 'neutral' };
    case 'unknown':
      return { label: 'No report yet', tone: 'warning' };
  }
}
