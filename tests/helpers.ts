import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export function loadFixture(name: string): void {
  const fixturePath = resolve(import.meta.dirname, "fixtures", name);
  document.body.innerHTML = readFileSync(fixturePath, "utf8");
}

export function getTab(index: number): HTMLElement {
  const tabs = Array.from(
    document.querySelectorAll<HTMLElement>(
      'div[role="tablist"][data-testid="ScrollSnap-List"] [role="tab"]'
    )
  );
  const tab = tabs[index];

  if (!tab) {
    throw new Error(`Expected tab at index ${index}`);
  }

  return tab;
}

export function setSelectedTab(index: number): void {
  for (const [tabIndex, tab] of Array.from(
    document.querySelectorAll<HTMLElement>(
      'div[role="tablist"][data-testid="ScrollSnap-List"] [role="tab"]'
    )
  ).entries()) {
    const isSelected = tabIndex === index;
    tab.setAttribute("aria-selected", isSelected ? "true" : "false");
    tab.setAttribute("tabindex", isSelected ? "0" : "-1");

    if (tabIndex === 1) {
      tab.setAttribute("aria-expanded", "false");
      tab.setAttribute("aria-haspopup", "menu");
    }
  }
}

export function setFeedTimes(isoDates: readonly string[]): void {
  const feed = document.querySelector<HTMLElement>("#feed");

  if (!feed) {
    throw new Error("Expected #feed fixture element");
  }

  feed.innerHTML = isoDates
    .map(
      (isoDate, index) => `
        <article data-post="${index + 1}">
          <time datetime="${isoDate}"></time>
        </article>
      `
    )
    .join("");
}

