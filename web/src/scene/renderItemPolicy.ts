export interface OpacityRenderItem {
  opacity: number;
}

export function isRenderableItem(item: OpacityRenderItem): boolean {
  return Number.isFinite(item.opacity) && item.opacity > 0;
}

export function renderableItems<TItem extends OpacityRenderItem>(
  items: TItem[],
): TItem[] {
  return items.filter(isRenderableItem);
}
