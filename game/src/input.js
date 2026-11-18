// Keyboard and pointer input. Held keys give movement axes and the aim point;
// one-shot presses (start, pause, enter a car, reload, mute) are queued as bit
// flags and taken once by the loop, so a press between two frames is never lost
// and never counted twice.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_RELOAD = 8;
export const ACTION_MUTE = 16;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const SPRINT = new Set(['ShiftLeft', 'ShiftRight']);
const CONFIRM = new Set(['Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const ENTER = new Set(['KeyE']);
const RELOAD = new Set(['KeyR']);
const MUTE = new Set(['KeyM']);
// Space shoots on foot (and is the handbrake while driving); on menus it confirms.
const SPACE = new Set(['Space']);

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let mouseX = 640;
  let mouseY = 400;
  let mouseDown = false;

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code) || DOWN.has(event.code) || LEFT.has(event.code) || RIGHT.has(event.code)
      || SPRINT.has(event.code) || SPACE.has(event.code)) {
      keys.add(event.code);
      event.preventDefault();
    } else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
      event.preventDefault();
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
      event.preventDefault();
    } else if (ENTER.has(event.code)) {
      if (!event.repeat) actions |= ACTION_ENTER;
    } else if (RELOAD.has(event.code)) {
      if (!event.repeat) actions |= ACTION_RELOAD;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    }
  });
  window.addEventListener('keyup', (event) => {
    keys.delete(event.code);
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    keys.clear();
    mouseDown = false;
  });
  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
  });
  canvas.addEventListener('pointerdown', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
    mouseDown = true;
    actions |= ACTION_CONFIRM;
    event.preventDefault();
  });
  window.addEventListener('pointerup', () => {
    mouseDown = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  function has(set) {
    for (const code of set) if (keys.has(code)) return true;
    return false;
  }

  return {
    /** Movement axes, -1..1: mx right, my down (W/Up is -1). */
    move() {
      const mx = (has(RIGHT) ? 1 : 0) - (has(LEFT) ? 1 : 0);
      const my = (has(DOWN) ? 1 : 0) - (has(UP) ? 1 : 0);
      return { mx, my };
    },
    sprint() {
      return has(SPRINT);
    },
    /** Space held: shoot on foot, handbrake while driving. */
    space() {
      return has(SPACE);
    },
    aim() {
      return { x: mouseX, y: mouseY };
    },
    mouseDown() {
      return mouseDown;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
