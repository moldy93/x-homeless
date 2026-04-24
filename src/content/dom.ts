import type { RouteState, TimelineScore } from "./types";

export const PRIMARY_COLUMN_SELECTOR = 'div[data-testid="primaryColumn"]';
export const HOME_TIMELINE_SELECTOR = 'div[aria-label="Home-Timeline"]';
export const HOME_TABLIST_SELECTOR =
  'div[role="tablist"][data-testid="ScrollSnap-List"]';
export const HOME_TAB_SELECTOR = '[role="tab"]';
export const TIMESTAMP_SELECTOR = "article time[datetime]";
export const SORT_MENU_SELECTOR = '[role="menu"]';
export const SORT_MENU_ITEM_SELECTOR =
  '[role="menuitemradio"], [role="menuitem"]';
export const MIN_SORT_SAMPLE_SIZE = 3;
export const MAX_SORT_SAMPLE_SIZE = 8;
export const SORT_SCORE_THRESHOLD = 0.75;

export function isHomePath(pathname: string): boolean {
  return pathname === "/home";
}

export function getRouteState(pathname: string): RouteState {
  return {
    isHome: isHomePath(pathname),
    pathname
  };
}

export function getPrimaryColumn(root: ParentNode = document): HTMLElement | null {
  return root.querySelector<HTMLElement>(PRIMARY_COLUMN_SELECTOR);
}

export function getHomeTimeline(root: ParentNode = document): HTMLElement | null {
  return root.querySelector<HTMLElement>(HOME_TIMELINE_SELECTOR);
}

export function getHomeTablist(root: ParentNode = document): HTMLElement | null {
  const homeTimeline = getHomeTimeline(root);

  return (
    homeTimeline?.querySelector<HTMLElement>(HOME_TABLIST_SELECTOR) ??
    root.querySelector<HTMLElement>(HOME_TABLIST_SELECTOR)
  );
}

export function getHomeTabs(tablist: ParentNode): HTMLElement[] {
  return Array.from(tablist.querySelectorAll<HTMLElement>(HOME_TAB_SELECTOR));
}

export function getForYouTab(tablist: ParentNode): HTMLElement | null {
  return getHomeTabs(tablist)[0] ?? null;
}

export function getFollowingTab(tablist: ParentNode): HTMLElement | null {
  return getHomeTabs(tablist)[1] ?? null;
}

export function isSelectedTab(tab: Element): boolean {
  return tab.getAttribute("aria-selected") === "true";
}

export function hasSortMenu(tab: Element): boolean {
  return tab.getAttribute("aria-haspopup") === "menu";
}

export function collectTimelineTimestamps(
  root: ParentNode = document,
  limit = MAX_SORT_SAMPLE_SIZE
): number[] {
  const homeTimeline = getHomeTimeline(root);

  if (!homeTimeline) {
    return [];
  }

  const timestamps: number[] = [];
  const seen = new Set<string>();

  for (const timestamp of Array.from(
    homeTimeline.querySelectorAll<HTMLTimeElement>(TIMESTAMP_SELECTOR)
  )) {
    if (!isElementVisible(timestamp)) {
      continue;
    }

    const iso = timestamp.dateTime;

    if (!iso || seen.has(iso)) {
      continue;
    }

    const parsed = Date.parse(iso);

    if (Number.isNaN(parsed)) {
      continue;
    }

    seen.add(iso);
    timestamps.push(parsed);

    if (timestamps.length >= limit) {
      break;
    }
  }

  return timestamps;
}

export function scoreTimelineTimestamps(timestamps: number[]): TimelineScore {
  const sampleSize = timestamps.length;
  const pairCount = Math.max(0, sampleSize - 1);
  let descendingPairs = 0;

  for (let index = 0; index < pairCount; index += 1) {
    if (timestamps[index] >= timestamps[index + 1]) {
      descendingPairs += 1;
    }
  }

  return {
    descendingPairs,
    pairCount,
    sampleSize,
    score: pairCount === 0 ? 1 : descendingPairs / pairCount,
    timestamps: [...timestamps]
  };
}

export function getSortMenus(root: ParentNode = document): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(SORT_MENU_SELECTOR));
}

export function getBinarySortMenuOptions(menu: ParentNode): HTMLElement[] {
  const options = Array.from(
    menu.querySelectorAll<HTMLElement>(SORT_MENU_ITEM_SELECTOR)
  ).filter(isElementVisible);

  return options.length === 2 ? options : [];
}

export function getAlternateSortOption(options: readonly HTMLElement[]): HTMLElement | null {
  if (options.length !== 2) {
    return null;
  }

  const selectedIndex = options.findIndex((option) =>
    option.getAttribute("aria-checked") === "true" ||
    option.getAttribute("aria-selected") === "true"
  );

  if (selectedIndex === 0) {
    return options[1];
  }

  if (selectedIndex === 1) {
    return options[0];
  }

  return options[1];
}

export function isElementVisible(element: Element): boolean {
  const htmlElement = element as HTMLElement;

  if (htmlElement.hidden || htmlElement.getAttribute("aria-hidden") === "true") {
    return false;
  }

  const ownerWindow = htmlElement.ownerDocument.defaultView;

  if (!ownerWindow) {
    return true;
  }

  const computedStyle = ownerWindow.getComputedStyle(htmlElement);

  return computedStyle.display !== "none" && computedStyle.visibility !== "hidden";
}
