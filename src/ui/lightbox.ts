import { icon } from "./icons";

let overlay: HTMLElement | null = null;
let stage: HTMLElement | null = null;
let closeButton: HTMLButtonElement | null = null;
let playingVideo: HTMLVideoElement | null = null;
let lastFocus: HTMLElement | null = null;

function createOverlay(): void {
  if (overlay) return;
  overlay = document.createElement("div");
  overlay.className = "lightbox";
  overlay.dataset.testid = "lightbox";
  overlay.hidden = true;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "媒体预览");

  closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "lightbox-close";
  closeButton.dataset.testid = "lightbox-close";
  closeButton.setAttribute("aria-label", "关闭预览");
  closeButton.innerHTML = icon("close");
  closeButton.addEventListener("click", () => closeLightbox());

  stage = document.createElement("div");
  stage.className = "lightbox-stage";
  stage.dataset.testid = "lightbox-stage";

  overlay.append(closeButton, stage);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeLightbox();
  });
  stage.addEventListener("click", (event) => {
    if (event.target === stage) closeLightbox();
  });
  document.body.append(overlay);
}

function mediaSource(element: HTMLImageElement | HTMLVideoElement): string {
  return (
    element.currentSrc ||
    element.getAttribute("src") ||
    element.getAttribute("data-src") ||
    ""
  );
}

function toggleImageZoom(image: HTMLImageElement): void {
  const actual = image.classList.toggle("is-actual");
  stage?.classList.toggle("is-actual", actual);
  image.setAttribute("aria-label", actual ? "缩小图片" : "放大图片");
}

function onKeyDown(event: KeyboardEvent): void {
  if (!overlay || overlay.hidden) return;
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    closeLightbox();
    return;
  }
  if (event.key !== "Tab" || !overlay) return;
  const focusable = Array.from(
    overlay.querySelectorAll<HTMLElement>('button, [tabindex="0"]'),
  ).filter((element) => !element.hasAttribute("disabled"));
  if (focusable.length === 0) return;
  const first = focusable[0]!;
  const last = focusable[focusable.length - 1]!;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export function openLightbox(
  source: HTMLImageElement | HTMLVideoElement,
  trigger?: HTMLElement,
): void {
  createOverlay();
  if (!overlay || !stage || !closeButton) return;
  closeLightbox(false);
  lastFocus =
    trigger ??
    (document.activeElement instanceof HTMLElement ? document.activeElement : null);

  const url = mediaSource(source);
  if (source instanceof HTMLVideoElement) {
    const video = document.createElement("video");
    video.className = "lightbox-media";
    video.src = url;
    video.controls = true;
    video.autoplay = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.tabIndex = 0;
    if (source.getAttribute("poster")) {
      video.setAttribute("poster", source.getAttribute("poster") ?? "");
    }
    stage.append(video);
    playingVideo = video;
  } else {
    const image = document.createElement("img");
    image.className = "lightbox-media";
    image.src = url;
    image.alt = source.alt;
    image.draggable = false;
    image.tabIndex = 0;
    image.setAttribute("role", "button");
    image.setAttribute("aria-label", "放大图片");
    image.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleImageZoom(image);
    });
    image.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      toggleImageZoom(image);
    });
    stage.append(image);
  }

  overlay.hidden = false;
  document.body.classList.add("lightbox-open");
  document.addEventListener("keydown", onKeyDown, true);
  requestAnimationFrame(() => {
    overlay?.classList.add("is-open");
    closeButton?.focus({ preventScroll: true });
    if (playingVideo) void playingVideo.play().catch(() => {});
  });
}

export function closeLightbox(restoreFocus = true): void {
  if (!overlay || overlay.hidden) return;
  overlay.classList.remove("is-open");
  overlay.hidden = true;
  stage?.replaceChildren();
  stage?.classList.remove("is-actual");
  playingVideo?.pause();
  playingVideo = null;
  document.body.classList.remove("lightbox-open");
  document.removeEventListener("keydown", onKeyDown, true);
  if (restoreFocus && lastFocus?.isConnected) {
    lastFocus.focus({ preventScroll: true });
  }
  lastFocus = null;
}
