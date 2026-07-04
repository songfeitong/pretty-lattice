export interface BatchPickItem {
  id: string;
}

export interface BatchPickRegistry<TItem extends BatchPickItem> {
  batchIdByItemId: Map<string, number>;
  itemByBatchId: Map<number, TItem>;
}

export function createBatchPickRegistry<TItem extends BatchPickItem>(): BatchPickRegistry<TItem> {
  return {
    batchIdByItemId: new Map<string, number>(),
    itemByBatchId: new Map<number, TItem>(),
  };
}

export function registerBatchPickItem<TItem extends BatchPickItem>(
  registry: BatchPickRegistry<TItem>,
  batchId: number,
  item: TItem,
) {
  registry.itemByBatchId.set(batchId, item);
  registry.batchIdByItemId.set(item.id, batchId);
}

export function itemForBatchId<TItem extends BatchPickItem>(
  registry: BatchPickRegistry<TItem>,
  batchId: number | undefined,
): TItem | null {
  if (batchId === undefined) {
    return null;
  }

  return registry.itemByBatchId.get(batchId) ?? null;
}
