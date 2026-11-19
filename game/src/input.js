// Keyboard and mouse for Palm City Heat. createInput wires the listeners;
// the shell calls frame() once per tick to get the input object the world
// understands, with the mouse already converted to world coordinates.

export function createInput(canvas, callbacks = {}) {
  const keys = new Set();
  const mouse = { x: 0, y: 0, down: false };
  let enterQueued = false;
  let reloadQueued = false;
  let clickQueued = false;

  function toCanvas(e) {
    const r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (canvas.width / r.width),
      y: (e.clientY - r.top) * (canvas.height / r.height),
    };
  }

  window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (callbacks.onAnyKey) callbacks.onAnyKey();
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === 'KeyE') enterQueued = true;
    if (e.code === 'KeyR') reloadQueued = true;
    if ((e.code === 'Escape' || e.code === 'KeyP') && callbacks.onPause) callbacks.onPause();
    if (e.code === 'KeyM' && callbacks.onMute) callbacks.onMute();
    if (e.code === 'Enter' && callbacks.onEnter) callbacks.onEnter();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('mousemove', (e) => {
    const p = toCanvas(e);
    mouse.x = p.x;
    mouse.y = p.y;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (callbacks.onAnyKey) callbacks.onAnyKey();
    mouse.down = true;
    clickQueued = true;
    const p = toCanvas(e);
    mouse.x = p.x;
    mouse.y = p.y;
    if (callbacks.onClick) callbacks.onClick(p.x, p.y);
  });
  window.addEventListener('mouseup', () => { mouse.down = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  return {
    mouse,
    /** The world's input object for this tick. camera = world coords of the view's top-left. */
    frame(camera, inCar) {
      const mx = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      const my = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
      const space = keys.has('Space');
      const input = {
        mx,
        my,
        sprint: keys.has('ShiftLeft') || keys.has('ShiftRight'),
        handbrake: inCar && space,
        enterPressed: enterQueued,
        reloadPressed: reloadQueued,
        fire: mouse.down || (!inCar && space),
        aimX: camera.x + mouse.x,
        aimY: camera.y + mouse.y,
      };
      enterQueued = false;
      reloadQueued = false;
      return input;
    },
    /** True once per mouse click, for menus. */
    consumeClick() {
      const c = clickQueued;
      clickQueued = false;
      return c;
    },
  };
}
