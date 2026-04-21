import {
  collectTimelineTimestamps,
  getAlternateSortOption,
  getBinarySortMenuOptions,
  getFollowingTab,
  getForYouTab,
  getHomeTablist,
  getRouteState,
  scoreTimelineTimestamps
} from "../src/content/dom";
import { loadFixture, setFeedTimes, setSelectedTab } from "./helpers";

describe("dom helpers", () => {
  beforeEach(() => {
    loadFixture("home-de.html");
  });

  it("finds the first two home tabs and ignores extra custom tabs", () => {
    const tablist = getHomeTablist(document);

    expect(tablist).not.toBeNull();
    expect(getForYouTab(tablist as HTMLElement)?.textContent).toContain("Für dich");
    expect(getFollowingTab(tablist as HTMLElement)?.textContent).toContain("Folge ich");
  });

  it("collects timestamps in feed order", () => {
    const timestamps = collectTimelineTimestamps(document);

    expect(timestamps).toHaveLength(3);
    expect(timestamps[0]).toBeGreaterThan(timestamps[1]);
    expect(timestamps[1]).toBeGreaterThan(timestamps[2]);
  });

  it("scores ordered feeds higher than mixed feeds", () => {
    const orderedScore = scoreTimelineTimestamps([
      Date.parse("2026-04-21T10:03:00.000Z"),
      Date.parse("2026-04-21T10:01:00.000Z"),
      Date.parse("2026-04-21T09:59:00.000Z")
    ]);

    const mixedScore = scoreTimelineTimestamps([
      Date.parse("2026-04-21T10:00:00.000Z"),
      Date.parse("2026-04-21T10:03:00.000Z"),
      Date.parse("2026-04-21T09:59:00.000Z")
    ]);

    expect(orderedScore.score).toBe(1);
    expect(mixedScore.score).toBeLessThan(1);
  });

  it("reads /home route state", () => {
    expect(getRouteState("/home")).toEqual({
      isHome: true,
      pathname: "/home"
    });
    expect(getRouteState("/explore")).toEqual({
      isHome: false,
      pathname: "/explore"
    });
  });

  it("finds the alternate option in a binary sort menu", () => {
    const menu = document.createElement("div");
    menu.setAttribute("role", "menu");
    menu.innerHTML = `
      <button aria-checked="true" role="menuitemradio">Relevant</button>
      <button aria-checked="false" role="menuitemradio">Neueste</button>
    `;

    document.body.appendChild(menu);

    const options = getBinarySortMenuOptions(menu);
    const alternateOption = getAlternateSortOption(options);

    expect(options).toHaveLength(2);
    expect(alternateOption?.textContent).toContain("Neueste");
  });

  it("keeps fixture utilities predictable", () => {
    setSelectedTab(1);
    setFeedTimes([
      "2026-04-21T08:00:00.000Z",
      "2026-04-21T07:00:00.000Z",
      "2026-04-21T06:00:00.000Z"
    ]);

    const timestamps = collectTimelineTimestamps(document);

    expect(timestamps).toHaveLength(3);
    expect(timestamps[0]).toBeGreaterThan(timestamps[2]);
  });
});

