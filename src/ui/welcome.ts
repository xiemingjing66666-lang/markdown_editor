import { icon } from "./icons";

export interface WelcomeDeps {
  onNew: () => void;
  onOpen: () => void;
}

export class Welcome {
  readonly element: HTMLElement;

  constructor(deps: WelcomeDeps) {
    this.element = document.createElement("div");
    this.element.className = "welcome";
    this.element.dataset.testid = "welcome";
    this.element.hidden = true;

    const seal = document.createElement("span");
    seal.className = "welcome-seal";
    seal.textContent = "纸";
    seal.setAttribute("aria-hidden", "true");

    const actions = document.createElement("div");
    actions.className = "welcome-actions";

    const create = document.createElement("button");
    create.type = "button";
    create.className = "button button-primary welcome-action";
    create.innerHTML = `${icon("plus")}<span>新建文档</span>`;
    create.dataset.testid = "welcome-new";
    create.addEventListener("click", () => deps.onNew());

    const open = document.createElement("button");
    open.type = "button";
    open.className = "button button-quiet welcome-action";
    open.innerHTML = `${icon("folder")}<span>打开文件</span>`;
    open.dataset.testid = "welcome-open";
    open.addEventListener("click", () => deps.onOpen());

    actions.append(create, open);
    this.element.append(seal, actions);
  }

  setVisible(visible: boolean): void {
    this.element.hidden = !visible;
  }
}
