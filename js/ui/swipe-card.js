const THRESHOLD = 90;

/** Pointer-swipe wrapper (Lovable SwipeCard, vanilla). */
export function attachSwipeCard(el, { onLeft, onRight, onSwipeUp }) {
  let start = null;
  let delta = { x: 0, y: 0 };
  let animating = false;

  const inner = el.querySelector(".swipe-card-inner") || el;
  const hintLeft = el.querySelector(".swipe-hint-left");
  const hintRight = el.querySelector(".swipe-hint-right");
  const hintUp = el.querySelector(".swipe-hint-up");

  const applyTransform = () => {
    const rot = delta.x / 20;
    inner.style.transform = `translate(${delta.x}px, ${delta.y}px) rotate(${rot}deg)`;
    inner.style.transition = animating
      ? "transform 180ms ease-out"
      : start ? "none" : "transform 180ms ease-out";
    if (hintLeft) hintLeft.hidden = delta.x >= -30;
    if (hintRight) hintRight.hidden = delta.x <= 30;
    if (hintUp) hintUp.hidden = !(onSwipeUp && delta.y < -30 && Math.abs(delta.y) > Math.abs(delta.x));
  };

  const finish = (dir) => {
    if (!dir) {
      delta = { x: 0, y: 0 };
      applyTransform();
      return;
    }
    animating = true;
    delta = {
      x: dir === "left" ? -600 : dir === "right" ? 600 : 0,
      y: dir === "up" ? -600 : 0,
    };
    applyTransform();
    setTimeout(() => {
      if (dir === "left") onLeft?.();
      else if (dir === "right") onRight?.();
      else if (dir === "up") onSwipeUp?.();
      delta = { x: 0, y: 0 };
      animating = false;
      applyTransform();
    }, 180);
  };

  const onDown = (e) => {
    if (animating) return;
    start = { x: e.clientX, y: e.clientY };
    el.setPointerCapture?.(e.pointerId);
  };

  const onMove = (e) => {
    if (!start) return;
    delta = { x: e.clientX - start.x, y: e.clientY - start.y };
    applyTransform();
  };

  const onPointerUp = (e) => {
    if (!start) return;
    const { x, y } = delta;
    start = null;
    el.releasePointerCapture?.(e.pointerId);
    if (onSwipeUp && y < -THRESHOLD && Math.abs(y) > Math.abs(x)) finish("up");
    else if (x > THRESHOLD) finish("right");
    else if (x < -THRESHOLD) finish("left");
    else finish(null);
  };

  el.addEventListener("pointerdown", onDown);
  el.addEventListener("pointermove", onMove);
  el.addEventListener("pointerup", onPointerUp);
  el.addEventListener("pointercancel", onPointerUp);

  return () => {
    el.removeEventListener("pointerdown", onDown);
    el.removeEventListener("pointermove", onMove);
    el.removeEventListener("pointerup", onPointerUp);
    el.removeEventListener("pointercancel", onPointerUp);
  };
}
