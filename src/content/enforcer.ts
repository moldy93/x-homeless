import {
  MIN_SORT_SAMPLE_SIZE,
  PRIMARY_COLUMN_SELECTOR,
  SORT_SCORE_THRESHOLD,
  collectTimelineTimestamps,
  getAlternateSortOption,
  getBinarySortMenuOptions,
  getFollowingTab,
  getForYouTab,
  getHomeTablist,
  getPrimaryColumn,
  getRouteState,
  getOpenSortMenu,
  hasSortMenu,
  isSelectedTab
} from "./dom";
import type { EnforcementResult, RouteState, TimelineScore } from "./types";

const CLOAK_ATTRIBUTE = "data-no-for-you-cloak";
const STYLE_ELEMENT_ID = "no-for-you-style";
const CLOAK_TIMEOUT_MS = 1500;
const ENFORCEMENT_DEBOUNCE_MS = 50;
const FIND_ATTEMPTS = 12;
const FIND_INTERVAL_MS = 125;
const TIMESTAMP_ATTEMPTS = 8;
const TIMESTAMP_INTERVAL_MS = 125;
const SORT_MENU_ATTEMPTS = 4;
const SORT_MENU_INTERVAL_MS = 125;

type TimeoutHandle = ReturnType<Window["setTimeout"]>;

type ObserverTarget = HTMLElement | null;

type SortOutcome = "kept-alternate" | "restored-original" | "skipped";

export class NoForYouController {
  private readonly attemptedSortTabs = new WeakSet<HTMLElement>();
  private readonly browserWindow: Window;
  private cloakTimer: TimeoutHandle | null = null;
  private currentPassId = 0;
  private enforceTimer: TimeoutHandle | null = null;
  private homeObserver: MutationObserver | null = null;
  private homeObserverTarget: ObserverTarget = null;
  private installed = false;
  private readonly onPopState = () => {
    this.scheduleRouteCheck();
  };
  private readonly onRootMutation = () => {
    if (this.browserWindow.location.pathname !== this.routeState.pathname) {
      this.scheduleRouteCheck();
      return;
    }

    if (this.routeState.isHome && !getHomeTablist(this.document)) {
      this.scheduleEnforcement();
    }
  };
  private readonly rootObserver: MutationObserver;
  private routeCheckTimer: TimeoutHandle | null = null;
  private routeState: RouteState;

  constructor(window: Window) {
    this.browserWindow = window;
    this.document = window.document;
    this.rootObserver = new MutationObserver(this.onRootMutation);
    this.routeState = getRouteState(window.location.pathname);
  }

  private readonly document: Document;

  start(): void {
    if (this.installed || this.browserWindow.top !== this.browserWindow.self) {
      return;
    }

    this.installed = true;
    this.ensureStyleElement();
    this.installHistoryPatch();
    this.browserWindow.addEventListener("popstate", this.onPopState, {
      passive: true
    });

    const root = this.document.documentElement;

    if (root) {
      this.rootObserver.observe(root, {
        childList: true,
        subtree: true
      });
    }

    this.handleRouteCheck();
  }

  stop(): void {
    if (!this.installed) {
      return;
    }

    this.installed = false;
    this.clearTimer("cloak");
    this.clearTimer("enforce");
    this.clearTimer("route");
    this.uncloak();
    this.disconnectHomeObserver();
    this.rootObserver.disconnect();
    this.browserWindow.removeEventListener("popstate", this.onPopState);
  }

  trigger(): Promise<EnforcementResult> {
    return this.runEnforcementPass();
  }

  private clearTimer(timer: "cloak" | "enforce" | "route"): void {
    if (timer === "cloak" && this.cloakTimer !== null) {
      this.browserWindow.clearTimeout(this.cloakTimer);
      this.cloakTimer = null;
      return;
    }

    if (timer === "enforce" && this.enforceTimer !== null) {
      this.browserWindow.clearTimeout(this.enforceTimer);
      this.enforceTimer = null;
      return;
    }

    if (timer === "route" && this.routeCheckTimer !== null) {
      this.browserWindow.clearTimeout(this.routeCheckTimer);
      this.routeCheckTimer = null;
    }
  }

  private cloak(passId: number): void {
    this.document.documentElement.setAttribute(CLOAK_ATTRIBUTE, "true");
    this.clearTimer("cloak");
    this.cloakTimer = this.browserWindow.setTimeout(() => {
      if (passId === this.currentPassId) {
        this.uncloak();
      }
    }, CLOAK_TIMEOUT_MS);
  }

  private disconnectHomeObserver(): void {
    this.homeObserver?.disconnect();
    this.homeObserver = null;
    this.homeObserverTarget = null;
  }

  private ensureStyleElement(): void {
    if (this.document.getElementById(STYLE_ELEMENT_ID)) {
      return;
    }

    const styleElement = this.document.createElement("style");
    styleElement.id = STYLE_ELEMENT_ID;
    styleElement.textContent = `
html[${CLOAK_ATTRIBUTE}="true"] ${PRIMARY_COLUMN_SELECTOR} [aria-label="Home-Timeline"] {
  opacity: 0 !important;
  pointer-events: none !important;
}
`;

    const head = this.document.head;

    if (head) {
      head.appendChild(styleElement);
      return;
    }

    this.document.documentElement.appendChild(styleElement);
  }

  private handleRouteCheck(): void {
    this.routeState = getRouteState(this.browserWindow.location.pathname);

    if (!this.routeState.isHome) {
      this.clearTimer("enforce");
      this.disconnectHomeObserver();
      this.uncloak();
      return;
    }

    this.refreshHomeObserver();
    this.scheduleEnforcement(0);
  }

  private installHistoryPatch(): void {
    const history = this.browserWindow.history as History & {
      __noForYouPatched?: boolean;
    };

    if (history.__noForYouPatched) {
      return;
    }

    const originalPushState = history.pushState.bind(history);
    const originalReplaceState = history.replaceState.bind(history);

    history.pushState = ((...arguments_) => {
      const result = originalPushState(...arguments_);
      this.scheduleRouteCheck();
      return result;
    }) as History["pushState"];

    history.replaceState = ((...arguments_) => {
      const result = originalReplaceState(...arguments_);
      this.scheduleRouteCheck();
      return result;
    }) as History["replaceState"];

    history.__noForYouPatched = true;
  }

  private refreshHomeObserver(): void {
    if (!this.routeState.isHome) {
      this.disconnectHomeObserver();
      return;
    }

    const nextTarget = getPrimaryColumn(this.document);

    if (!nextTarget || nextTarget === this.homeObserverTarget) {
      return;
    }

    this.disconnectHomeObserver();

    this.homeObserverTarget = nextTarget;
    const homeObserver = new MutationObserver((mutations: MutationRecord[]) => {
      for (const mutation of mutations) {
        if (
          mutation.type === "childList" ||
          mutation.attributeName === "aria-expanded" ||
          mutation.attributeName === "aria-selected"
        ) {
          this.scheduleEnforcement();
          return;
        }
      }
    });

    this.homeObserver = homeObserver;

    homeObserver.observe(nextTarget, {
      attributeFilter: ["aria-expanded", "aria-selected"],
      attributes: true,
      childList: true,
      subtree: true
    });
  }

  private async restoreOriginalSort(trigger: HTMLElement, passId: number): Promise<void> {
    trigger.click();

    const menu = await this.waitForValue(
      () => getOpenSortMenu(this.document),
      SORT_MENU_ATTEMPTS,
      SORT_MENU_INTERVAL_MS,
      passId
    );

    if (!menu) {
      return;
    }

    const options = getBinarySortMenuOptions(menu);
    const alternateOption = getAlternateSortOption(options);

    if (!alternateOption) {
      return;
    }

    alternateOption.click();
    await this.waitForTimestamps(passId);
  }

  private async dismissOpenSortMenu(
    referenceElement?: HTMLElement | null
  ): Promise<void> {
    const escapeEventOptions: KeyboardEventInit = {
      bubbles: true,
      cancelable: true,
      key: "Escape"
    };

    referenceElement?.dispatchEvent(new KeyboardEvent("keydown", escapeEventOptions));
    this.document.dispatchEvent(
      new KeyboardEvent("keydown", escapeEventOptions)
    );
    this.browserWindow.dispatchEvent(
      new KeyboardEvent("keydown", escapeEventOptions)
    );

    await this.sleep(0);

    if (
      getOpenSortMenu(this.document) ||
      referenceElement?.getAttribute("aria-expanded") === "true"
    ) {
      const clickTarget =
        referenceElement ??
        getPrimaryColumn(this.document) ??
        this.document.body;

      clickTarget?.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          cancelable: true
        })
      );
      clickTarget?.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true
        })
      );

      await this.sleep(0);
    }

    referenceElement?.blur();
  }

  private async switchToFollowing(
    forYouTab: HTMLElement,
    followingTab: HTMLElement,
    passId: number
  ): Promise<HTMLElement | null> {
    const keyboardSelectedFollowingTab = await this.tryKeyboardSwitchToFollowing(
      forYouTab,
      passId
    );

    if (keyboardSelectedFollowingTab) {
      return keyboardSelectedFollowingTab;
    }

    followingTab.click();
    return this.waitForSelectedFollowing(passId);
  }

  private async tryKeyboardSwitchToFollowing(
    forYouTab: HTMLElement,
    passId: number
  ): Promise<HTMLElement | null> {
    forYouTab.focus();

    const keyboardEventOptions: KeyboardEventInit = {
      bubbles: true,
      cancelable: true,
      code: "ArrowRight",
      key: "ArrowRight"
    };

    forYouTab.dispatchEvent(new KeyboardEvent("keydown", keyboardEventOptions));
    forYouTab.dispatchEvent(new KeyboardEvent("keyup", keyboardEventOptions));

    return this.waitForSelectedFollowing(passId, 4, 50);
  }

  private async waitForSelectedFollowing(
    passId: number,
    attempts = FIND_ATTEMPTS,
    intervalMs = FIND_INTERVAL_MS
  ): Promise<HTMLElement | null> {
    return this.waitForValue(() => {
      const refreshedTablist = getHomeTablist(this.document);
      const refreshedFollowingTab = refreshedTablist
        ? getFollowingTab(refreshedTablist)
        : null;

      if (refreshedFollowingTab && isSelectedTab(refreshedFollowingTab)) {
        return refreshedFollowingTab;
      }

      return null;
    }, attempts, intervalMs, passId);
  }

  async runEnforcementPass(): Promise<EnforcementResult> {
    const passId = ++this.currentPassId;

    if (!this.routeState.isHome) {
      this.uncloak();
      return {
        attemptedSort: false,
        didSwitchTab: false,
        phase: "idle",
        reason: "not-home"
      };
    }

    const tablist = await this.waitForValue(
      () => getHomeTablist(this.document),
      FIND_ATTEMPTS,
      FIND_INTERVAL_MS,
      passId
    );

    if (!tablist) {
      this.uncloak();
      return {
        attemptedSort: false,
        didSwitchTab: false,
        phase: "cloaked",
        reason: "missing-tablist"
      };
    }

    this.refreshHomeObserver();

    const forYouTab = getForYouTab(tablist);
    const followingTab = getFollowingTab(tablist);

    if (!followingTab || !forYouTab) {
      this.uncloak();
      return {
        attemptedSort: false,
        didSwitchTab: false,
        phase: "route-check",
        reason: "missing-following-tab"
      };
    }

    let didSwitchTab = false;

    if (isSelectedTab(forYouTab)) {
      this.cloak(passId);
      didSwitchTab = true;
      const selectedFollowingTab = await this.switchToFollowing(
        forYouTab,
        followingTab,
        passId
      );

      if (!selectedFollowingTab) {
        this.uncloak();
        return {
          attemptedSort: false,
          didSwitchTab,
          phase: "switching-following",
          reason: "switch-failed"
        };
      }

      await this.dismissOpenSortMenu(selectedFollowingTab);
    }

    const activeTablist = getHomeTablist(this.document);
    const activeFollowingTab = activeTablist
      ? getFollowingTab(activeTablist)
      : null;

    if (!activeFollowingTab || !isSelectedTab(activeFollowingTab)) {
      this.uncloak();
      return {
        attemptedSort: false,
        didSwitchTab,
        phase: "switching-following",
        reason: "switch-failed"
      };
    }

    const timestamps = await this.waitForTimestamps(passId);
    const score =
      timestamps.length >= MIN_SORT_SAMPLE_SIZE
        ? this.scoreTimestamps(timestamps)
        : undefined;

    let attemptedSort = false;
    let sortOutcome: SortOutcome = "skipped";

    if (
      score &&
      score.score < SORT_SCORE_THRESHOLD &&
      hasSortMenu(activeFollowingTab) &&
      !this.attemptedSortTabs.has(activeFollowingTab)
    ) {
      attemptedSort = true;
      this.attemptedSortTabs.add(activeFollowingTab);
      sortOutcome = await this.tryAlternateSort(activeFollowingTab, score, passId);
    }

    await this.dismissOpenSortMenu(activeFollowingTab);
    this.uncloak();

    return {
      attemptedSort,
      didSwitchTab,
      phase: "complete",
      reason: this.resolveReason(didSwitchTab, sortOutcome),
      score
    };
  }

  private resolveReason(
    didSwitchTab: boolean,
    sortOutcome: SortOutcome
  ): EnforcementResult["reason"] {
    if (sortOutcome === "kept-alternate") {
      return "sort-kept-alternate";
    }

    if (sortOutcome === "restored-original") {
      return "sort-restored-original";
    }

    return didSwitchTab ? "switched-following" : "already-following";
  }

  private scheduleEnforcement(delay = ENFORCEMENT_DEBOUNCE_MS): void {
    if (!this.routeState.isHome) {
      return;
    }

    this.clearTimer("enforce");
    this.enforceTimer = this.browserWindow.setTimeout(() => {
      void this.runEnforcementPass();
    }, delay);
  }

  private scheduleRouteCheck(delay = ENFORCEMENT_DEBOUNCE_MS): void {
    this.clearTimer("route");
    this.routeCheckTimer = this.browserWindow.setTimeout(() => {
      this.handleRouteCheck();
    }, delay);
  }

  private scoreTimestamps(timestamps: number[]): TimelineScore {
    return {
      ...this.scoreTimelineTimestamps(timestamps)
    };
  }

  private scoreTimelineTimestamps(timestamps: number[]): TimelineScore {
    const pairCount = Math.max(0, timestamps.length - 1);
    let descendingPairs = 0;

    for (let index = 0; index < pairCount; index += 1) {
      if (timestamps[index] >= timestamps[index + 1]) {
        descendingPairs += 1;
      }
    }

    return {
      descendingPairs,
      pairCount,
      sampleSize: timestamps.length,
      score: pairCount === 0 ? 1 : descendingPairs / pairCount,
      timestamps: [...timestamps]
    };
  }

  private async tryAlternateSort(
    trigger: HTMLElement,
    baselineScore: TimelineScore,
    passId: number
  ): Promise<SortOutcome> {
    trigger.click();

    const menu = await this.waitForValue(
      () => getOpenSortMenu(this.document),
      SORT_MENU_ATTEMPTS,
      SORT_MENU_INTERVAL_MS,
      passId
    );

    if (!menu) {
      return "skipped";
    }

    const options = getBinarySortMenuOptions(menu);
    const alternateOption = getAlternateSortOption(options);

    if (!alternateOption) {
      return "skipped";
    }

    alternateOption.click();

    const alternateTimestamps = await this.waitForTimestamps(passId);

    if (alternateTimestamps.length < MIN_SORT_SAMPLE_SIZE) {
      return "skipped";
    }

    const alternateScore = this.scoreTimestamps(alternateTimestamps);

    if (alternateScore.score > baselineScore.score) {
      return "kept-alternate";
    }

    await this.restoreOriginalSort(trigger, passId);
    return "restored-original";
  }

  private uncloak(): void {
    this.clearTimer("cloak");
    this.document.documentElement.removeAttribute(CLOAK_ATTRIBUTE);
  }

  private async waitForTimestamps(passId: number): Promise<number[]> {
    const timestamps = await this.waitForValue(() => {
      const values = collectTimelineTimestamps(this.document);

      return values.length >= MIN_SORT_SAMPLE_SIZE ? values : null;
    }, TIMESTAMP_ATTEMPTS, TIMESTAMP_INTERVAL_MS, passId);

    return timestamps ?? collectTimelineTimestamps(this.document);
  }

  private async waitForValue<T>(
    getter: () => T | null,
    attempts: number,
    intervalMs: number,
    passId: number
  ): Promise<T | null> {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (passId !== this.currentPassId) {
        return null;
      }

      const value = getter();

      if (value !== null) {
        return value;
      }

      if (attempt < attempts - 1) {
        await this.sleep(intervalMs);
      }
    }

    return null;
  }

  private sleep(milliseconds: number): Promise<void> {
    return new Promise((resolve) => {
      this.browserWindow.setTimeout(resolve, milliseconds);
    });
  }
}
