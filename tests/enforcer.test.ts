import { NoForYouController } from "../src/content/enforcer";
import { loadFixture, getTab, setFeedTimes, setSelectedTab } from "./helpers";

function installTabSwitchBehavior(): void {
  const forYouTab = getTab(0);
  const followingTab = getTab(1);

  forYouTab.addEventListener("click", () => {
    setSelectedTab(0);
  });

  followingTab.addEventListener("click", () => {
    const role = followingTab.getAttribute("data-role");

    if (role === "sort-trigger") {
      renderSortMenu();
      return;
    }

    setSelectedTab(1);
  });
}

function renderSortMenu(): void {
  const existingMenu = document.querySelector('[role="menu"]');

  existingMenu?.remove();

  const menu = document.createElement("div");
  menu.setAttribute("role", "menu");
  menu.innerHTML = `
    <button aria-checked="true" data-sort="ranked" role="menuitemradio">Relevant</button>
    <button aria-checked="false" data-sort="recent" role="menuitemradio">Neueste</button>
  `;

  const rankedButton = menu.querySelector<HTMLElement>('[data-sort="ranked"]');
  const recentButton = menu.querySelector<HTMLElement>('[data-sort="recent"]');

  if (!rankedButton || !recentButton) {
    throw new Error("Expected sort buttons");
  }

  rankedButton.addEventListener("click", () => {
    rankedButton.setAttribute("aria-checked", "true");
    recentButton.setAttribute("aria-checked", "false");
    setFeedTimes([
      "2026-04-21T10:00:00.000Z",
      "2026-04-21T10:03:00.000Z",
      "2026-04-21T09:59:00.000Z"
    ]);
    menu.remove();
  });

  recentButton.addEventListener("click", () => {
    rankedButton.setAttribute("aria-checked", "false");
    recentButton.setAttribute("aria-checked", "true");
    setFeedTimes([
      "2026-04-21T10:03:00.000Z",
      "2026-04-21T10:01:00.000Z",
      "2026-04-21T09:59:00.000Z"
    ]);
    menu.remove();
  });

  document.body.appendChild(menu);
}

function installMenuDismissBehavior(): void {
  const dismiss = () => {
    document.querySelector('[role="menu"]')?.remove();
  };

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      dismiss();
    }
  });

  document.addEventListener("click", dismiss);
}

describe("NoForYouController", () => {
  const controllers: NoForYouController[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    window.history.replaceState({}, "", "/home");
    loadFixture("home-de.html");
  });

  afterEach(() => {
    for (const controller of controllers.splice(0)) {
      controller.stop();
    }

    vi.useRealTimers();
    document.documentElement.removeAttribute("data-no-for-you-cloak");
  });

  it("switches from Für dich to Folge ich", async () => {
    installTabSwitchBehavior();

    const controller = new NoForYouController(window);
    controllers.push(controller);
    const resultPromise = controller.trigger();

    await vi.runAllTimersAsync();

    const result = await resultPromise;

    expect(getTab(0).getAttribute("aria-selected")).toBe("false");
    expect(getTab(1).getAttribute("aria-selected")).toBe("true");
    expect(result.didSwitchTab).toBe(true);
  });

  it("does not click the following tab again when already selected and feed is ordered", async () => {
    setSelectedTab(1);
    installTabSwitchBehavior();
    setFeedTimes([
      "2026-04-21T10:03:00.000Z",
      "2026-04-21T10:01:00.000Z",
      "2026-04-21T09:59:00.000Z"
    ]);

    const followingTab = getTab(1);
    let followingClickCount = 0;

    followingTab.addEventListener("click", () => {
      followingClickCount += 1;
    });

    const controller = new NoForYouController(window);
    controllers.push(controller);
    const resultPromise = controller.trigger();

    await vi.runAllTimersAsync();

    const result = await resultPromise;

    expect(result.didSwitchTab).toBe(false);
    expect(result.reason).toBe("already-following");
    expect(followingClickCount).toBe(0);
  });

  it("cleans up cloak state after timeout if tablist never appears", async () => {
    document.body.innerHTML = `
      <main role="main">
        <div data-testid="primaryColumn">
          <div aria-label="Home-Timeline"></div>
        </div>
      </main>
    `;

    const controller = new NoForYouController(window);
    controllers.push(controller);
    const resultPromise = controller.trigger();

    expect(document.documentElement.getAttribute("data-no-for-you-cloak")).toBe("true");

    await vi.advanceTimersByTimeAsync(1500);
    await vi.runAllTimersAsync();

    const result = await resultPromise;

    expect(result.reason).toBe("missing-tablist");
    expect(document.documentElement.hasAttribute("data-no-for-you-cloak")).toBe(false);
  });

  it("handles SPA route changes through patched history", async () => {
    installTabSwitchBehavior();
    window.history.replaceState({}, "", "/explore");

    const controller = new NoForYouController(window);
    controllers.push(controller);
    controller.start();

    window.history.pushState({}, "", "/home");
    await vi.runAllTimersAsync();

    expect(getTab(1).getAttribute("aria-selected")).toBe("true");
  });

  it("tries the alternate sort option when feed order is mixed and keeps the better result", async () => {
    setSelectedTab(1);
    getTab(1).setAttribute("data-role", "sort-trigger");
    installTabSwitchBehavior();
    setFeedTimes([
      "2026-04-21T10:00:00.000Z",
      "2026-04-21T10:03:00.000Z",
      "2026-04-21T09:59:00.000Z"
    ]);

    const controller = new NoForYouController(window);
    controllers.push(controller);
    const resultPromise = controller.trigger();

    await vi.runAllTimersAsync();

    const result = await resultPromise;
    const currentTimestamps = Array.from(
      document.querySelectorAll<HTMLTimeElement>("article time")
    ).map((element) => element.dateTime);

    expect(result.attemptedSort).toBe(true);
    expect(result.reason).toBe("sort-kept-alternate");
    expect(currentTimestamps).toEqual([
      "2026-04-21T10:03:00.000Z",
      "2026-04-21T10:01:00.000Z",
      "2026-04-21T09:59:00.000Z"
    ]);
  });

  it("closes an open pulldown after the first switch to Folge ich", async () => {
    installMenuDismissBehavior();

    const forYouTab = getTab(0);
    const followingTab = getTab(1);

    forYouTab.addEventListener("click", () => {
      setSelectedTab(0);
    });

    followingTab.addEventListener("click", () => {
      setSelectedTab(1);
      renderSortMenu();
    });

    const controller = new NoForYouController(window);
    controllers.push(controller);
    const resultPromise = controller.trigger();

    await vi.runAllTimersAsync();

    const result = await resultPromise;

    expect(result.didSwitchTab).toBe(true);
    expect(getTab(1).getAttribute("aria-selected")).toBe("true");
    expect(document.querySelector('[role="menu"]')).toBeNull();
  });

  it("fails safely when posts are missing", async () => {
    setSelectedTab(1);
    const feed = document.querySelector("#feed");

    if (!feed) {
      throw new Error("Expected #feed");
    }

    feed.innerHTML = "";

    const controller = new NoForYouController(window);
    controllers.push(controller);
    const resultPromise = controller.trigger();

    await vi.runAllTimersAsync();

    const result = await resultPromise;

    expect(result.reason).toBe("already-following");
    expect(result.attemptedSort).toBe(false);
  });
});
