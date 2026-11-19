// Keyboard and mouse, gathered in one place. main.js calls applyTo once
// per frame to pour the current state into world.input (turning the mouse
// from screen space into world space with the camera), and reads the
// one-shot flags (interact, pause, mute, confirm), which this module sets
// on key presses and main clears after use.

export function createInput(canvas) {
  const keys = new Set();
  const flags = { interact: false, pause: false, mute: false, confirm: false };
  const mouse = { x: 0, y: 0, down: false };

  const down = (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === 'KeyE') flags.interact = true;
    if (e.code === 'Escape' || e.code === 'KeyP') flags.pause = true;
    if (e.code === 'KeyM') flags.mute = true;
    if (e.code === 'Enter') flags.confirm = true;
  };
  const up = (e) => keys.delete(e.code);
  const move = (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - rect.left) * (canvas.width / rect.width);
    mouse.y = (e.clientY - rect.top) * (canvas.height / rect.height);
  };
  const mDown = (e) => { move(e); mouse.down = true; flags.confirm = true; };
  const mUp = () => { mouse.down = false; };

  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  canvas.addEventListener('mousemove', move);
  canvas.addEventListener('mousedown', mDown);
  window.addEventListener('mouseup', mUp);

  const has = (...codes) => codes.some((c) => keys.has(c));

  return {
    flags,
    mouse,
    /** Pour the current controls into world.input. cam is the view's top-left in world space. */
    applyTo(world, cam) {
      const input = world.input;
      input.moveX = (has('KeyD', 'ArrowRight') ? 1 : 0) - (has('KeyA', 'ArrowLeft') ? 1 : 0);
      input.moveY = (has('KeyS', 'ArrowDown') ? 1 : 0) - (has('KeyW', 'ArrowUp') ? 1 : 0);
      input.sprint = has('ShiftLeft', 'ShiftRight');
      input.handbrake = has('Space');
      input.fire = mouse.down || has('Space');
      input.aimX = cam.x + mouse.x;
      input.aimY = cam.y + mouse.y;
    },
  };
}
