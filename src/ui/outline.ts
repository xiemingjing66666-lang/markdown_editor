import type { OutlineHeading } from "../core/markdown";

export class OutlinePanel {
  readonly element: HTMLElement;
  private readonly list: HTMLElement;
  private headings: OutlineHeading[] = [];
  private activeId: string | null = null;

  constructor(private readonly onSelect: (heading: OutlineHeading) => void) {
    this.element = document.createElement("aside");
    this.element.className = "outline-panel";
    this.element.dataset.testid = "outline";
    this.element.setAttribute("aria-label", "目录大纲");
    this.element.hidden = true;

    const title = document.createElement("div");
    title.className = "outline-title";
    title.textContent = "大纲";

    this.list = document.createElement("div");
    this.list.className = "outline-list";
    this.list.dataset.testid = "outline-list";
    this.element.append(title, this.list);
  }

  setVisible(visible: boolean): void {
    this.element.hidden = !visible;
  }

  setHeadings(headings: OutlineHeading[]): void {
    this.headings = headings;
    if (this.activeId && !headings.some((heading) => heading.id === this.activeId)) {
      this.activeId = null;
    }
    this.render();
  }

  setActive(id: string | null): void {
    this.activeId = id;
    for (const item of this.list.querySelectorAll<HTMLElement>(".outline-item")) {
      item.classList.toggle("is-active", item.dataset.id === id);
      if (item.dataset.id === id) {
        item.setAttribute("aria-current", "location");
        item.scrollIntoView({ block: "nearest" });
      } else {
        item.removeAttribute("aria-current");
      }
    }
  }

  private render(): void {
    this.list.replaceChildren();
    for (const heading of this.headings) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "outline-item";
      item.dataset.id = heading.id;
      item.dataset.level = String(heading.level);
      item.style.setProperty("--indent", `${(heading.level - 1) * 12}px`);
      item.textContent = heading.text;
      item.title = heading.text;
      item.classList.toggle("is-active", heading.id === this.activeId);
      if (heading.id === this.activeId) {
        item.setAttribute("aria-current", "location");
      }
      item.addEventListener("click", () => {
        this.setActive(heading.id);
        this.onSelect(heading);
      });
      this.list.append(item);
    }
  }
}
