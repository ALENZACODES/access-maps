import { PRIORITIES, compareText, integer } from './p15am-model.mts';
import type { Cursor, Desk, Item } from './p15am-model.mts';
import { inspectReviewQueue } from './p15am-queue.mts';

export interface Assignment {
  proposalId: string;
  deskId: string;
}

export interface Deferred {
  proposalId: string;
  why: 'excluded' | 'capacity' | 'limit';
}

export interface DispatchPlan {
  cursor: Cursor;
  assignments: Assignment[];
  deferred: Deferred[];
}

interface SlotGroup {
  desk: Desk;
  exclusions: Set<string>;
  occupied: number;
  planned: Set<Item>;
}

function urgency(a: Item, b: Item): number {
  const x = a.candidate;
  const y = b.candidate;
  return PRIORITIES.indexOf(x.priority) - PRIORITIES.indexOf(y.priority)
    || compareText(x.provenance.retrievedOn, y.provenance.retrievedOn)
    || y.recordIds.length - x.recordIds.length
    || compareText(x.proposalId, y.proposalId);
}

function load(group: SlotGroup): number {
  return group.occupied + group.planned.size;
}

function byOccupancy(a: SlotGroup, b: SlotGroup): number {
  // Use fractions without floating point to compare desks of different sizes.
  return load(a) * b.desk.capacity - load(b) * a.desk.capacity
    || compareText(a.desk.deskId, b.desk.deskId);
}

/**
 * Find a free slot directly, or move tentative assignments along an alternating
 * path. Existing live claims are fixed. Previously selected higher-priority
 * proposals retain a slot even when their tentative destination changes.
 */
function reserve(item: Item, groups: SlotGroup[], placement: Map<Item, SlotGroup>): boolean {
  const waiting = [item];
  const seenItems = new Set(waiting);
  const via = new Map<SlotGroup, Item>();
  for (let i = 0; i < waiting.length; i++) {
    const current = waiting[i]!;
    const eligible = groups.filter(group =>
      !via.has(group) && !group.exclusions.has(current.candidate.sourceId)
    ).sort(byOccupancy);
    for (const group of eligible) {
      via.set(group, current);
      if (load(group) < group.desk.capacity) {
        let target: SlotGroup | undefined = group;
        while (target) {
          const moved = via.get(target)!;
          const previous = placement.get(moved);
          previous?.planned.delete(moved);
          target.planned.add(moved);
          placement.set(moved, target);
          target = previous;
        }
        return true;
      }
      for (const assigned of group.planned) {
        if (!seenItems.has(assigned)) {
          seenItems.add(assigned);
          waiting.push(assigned);
        }
      }
    }
  }
  return false;
}

/**
 * Return review suggestions for a single verified queue revision. Caps,
 * declared source conflicts and ownership are all enforced again on claim.
 */
export function planReviewAssignments(input: unknown, limit: number = 2048): DispatchPlan {
  integer(limit, 0, 2048);
  const view = inspectReviewQueue(input);
  const groups: SlotGroup[] = view.desks.map(desk => ({
    desk, exclusions: new Set(desk.excludedSources), occupied: 0, planned: new Set()
  }));
  const byId = new Map(groups.map(group => [group.desk.deskId, group]));
  for (const item of view.items) {
    if (item.owner !== null) byId.get(item.owner)!.occupied++;
  }
  const free = groups.reduce((sum, group) => sum + group.desk.capacity - group.occupied, 0);
  const ready = view.items.filter(item => item.phase === 'ready').sort(urgency);
  const placement = new Map<Item, SlotGroup>();
  const deferred: Deferred[] = [];
  for (const item of ready) {
    const proposalId = item.candidate.proposalId;
    if (groups.every(group => group.exclusions.has(item.candidate.sourceId))) {
      deferred.push({ proposalId, why: 'excluded' });
    } else if (placement.size === free) {
      deferred.push({ proposalId, why: 'capacity' });
    } else if (placement.size === limit) {
      deferred.push({ proposalId, why: 'limit' });
    } else if (!reserve(item, groups, placement)) {
      deferred.push({ proposalId, why: 'capacity' });
    }
  }
  const assignments = ready.flatMap(item => {
    const group = placement.get(item);
    return group ? [{ proposalId: item.candidate.proposalId, deskId: group.desk.deskId }] : [];
  });
  return { cursor: view.cursor, assignments, deferred };
}
