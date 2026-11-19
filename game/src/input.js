// input.js — keyboard and mouse state for the game loop. The world wants a
// simple per-frame snapshot: movement axes, an aim angle (computed by
// main.js from the mouse position and camera), whether the trigger is held,
// and edge-triggered presses for interact / pause / mute / confirm.

export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set(); // keys that went down since the last frame read
  const mouse = { x: 0, y: 0, down: false };

  function onKeyDown(e) {
    const k = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    if (!keys.has(k)) pressed.add(k);
    keys.add(k);
  }
  function onKeyUp(e) {
    keys.delete(e.key.toLowerCase());
  }
  function onMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - rect.left) * (canvas.width / rect.width);
    mouse.y = (e.clientY - rect.top) * (canvas.height / rect.height);
  }
  function onMouseDown(e) {
    if (e.button === 0) mouse.down = true;
  }
  function onMouseUp(e) {
    if (e.button === 0) mouse.down = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);

  // Read one frame of input. aimAngle is supplied by the caller, which knows
  // where the camera is. Consumes the edge-triggered press set.
  function read(aimAngle) {
    const x = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
    const y = (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0);
    const frame = {
      x,
      y,
      aim: aimAngle,
      fire: mouse.down || keys.has(' '),
      sprint: keys.has('shift'),
      interact: pressed.has('e'),
      pause: pressed.has('escape') || pressed.has('p'),
      mute: pressed.has('m'),
      confirm: pressed.has('enter') || pressed.has(' '),
    };
    pressed.clear();
    return frame;
  }

  return { read, mouse };
}
