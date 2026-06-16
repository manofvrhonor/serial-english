const SCROLL_TOP_ICON = `<svg class="scroll-top-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m18 15-6-6-6 6"/></svg>`;

let detachFn = null;

export function unbindScrollTop() {
  if (detachFn) {
    detachFn();
    detachFn = null;
  }
}

export function bindScrollTop(options = {}) {
  unbindScrollTop();

  const scrollRoot = resolveScrollRoot();
  if (!scrollRoot) return;

  let btn = document.getElementById("scroll-top-btn");
  if (!btn) {
    btn = document.createElement("button");
    btn.id = "scroll-top-btn";
    btn.type = "button";
    btn.className = "scroll-top-btn";
    btn.hidden = true;
    btn.setAttribute("aria-label", "К началу");
    btn.innerHTML = SCROLL_TOP_ICON;
    document.getElementById("app")?.appendChild(btn);
  }

  const resolveAnchor = () => {
    const { anchor } = options;
    if (!anchor) return null;
    if (typeof anchor === "string") return document.querySelector(anchor);
    return anchor;
  };

  const threshold = () => scrollRoot.clientHeight * 1.5;

  const update = () => {
    btn.hidden = readScrollTop(scrollRoot) < threshold();
  };

  const onClick = () => {
    const anchorEl = resolveAnchor();
    if (!anchorEl) {
      scrollRootTo(scrollRoot, 0);
      return;
    }
    const top = readScrollTop(scrollRoot)
      + anchorEl.getBoundingClientRect().top
      - scrollRoot.getBoundingClientRect().top;
    scrollRootTo(scrollRoot, Math.max(0, top));
  };

  const onScroll = () => update();

  scrollRoot.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("scroll", onScroll, { passive: true });
  btn.addEventListener("click", onClick);
  requestAnimationFrame(update);

  detachFn = () => {
    scrollRoot.removeEventListener("scroll", onScroll);
    window.removeEventListener("scroll", onScroll);
    btn.removeEventListener("click", onClick);
    btn.hidden = true;
  };
}

function resolveScrollRoot() {
  return document.querySelector(".content")
    || document.scrollingElement
    || document.documentElement;
}

function readScrollTop(el) {
  if (el === document.documentElement || el === document.body) {
    return window.scrollY || document.documentElement.scrollTop || 0;
  }
  return el.scrollTop || 0;
}

function scrollRootTo(el, top) {
  if (el === document.documentElement || el === document.body) {
    window.scrollTo({ top, behavior: "smooth" });
    return;
  }
  el.scrollTo({ top, behavior: "smooth" });
}

export function refreshPageScrollTop(route) {
  if (route === "import") {
    const result = document.getElementById("import-result");
    if (result && !result.hidden) {
      bindScrollTop({ anchor: result });
      return;
    }
  }
  bindScrollTop();
}
