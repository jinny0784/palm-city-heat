// config.js — the shared numbers and colours of Palm City. One place to tune
// the feel of the game: world size, heat, car performance and the warm
// Miami-flavoured palette the renderer paints with.

export const VIEW_W = 1280;
export const VIEW_H = 800;

export const WORLD_W = 4000;
export const WORLD_H = 3000;

// The sea lives on the east edge. Sand runs from BEACH_X to WATER_X, and
// open water from WATER_X to the world edge.
export const BEACH_X = 3420;
export const WATER_X = 3520;

export const ROAD_W = 96;

// Wanted heat: every HEAT_PER_STAR points of heat is one star, five max.
export const HEAT_PER_STAR = 24;
export const MAX_STARS = 5;

export const PLAYER_RADIUS = 13;
export const WALK_SPEED = 175;
export const SPRINT_SPEED = 265;

// Vehicle performance by kind. Speeds are px/s, accel is px/s^2.
export const CAR_TYPES = {
  sedan: { w: 46, h: 22, maxSpeed: 305, reverse: 110, accel: 205, grip: 3.4, hp: 100 },
  taxi: { w: 46, h: 22, maxSpeed: 300, reverse: 110, accel: 200, grip: 3.4, hp: 100 },
  sports: { w: 48, h: 22, maxSpeed: 395, reverse: 130, accel: 285, grip: 3.9, hp: 90 },
  truck: { w: 56, h: 26, maxSpeed: 250, reverse: 90, accel: 150, grip: 2.8, hp: 160 },
  police: { w: 47, h: 22, maxSpeed: 345, reverse: 120, accel: 245, grip: 3.8, hp: 130 },
};

export const TRAFFIC_PAINTS = [
  '#c94f42', '#3e7cb1', '#e0a458', '#5da05d', '#8d6cc9', '#d8d3c3',
  '#4fb3a9', '#b1507a', '#707a88', '#e3e0d8', '#2f4858', '#d97b29',
];
export const ROOF_PAINTS = [
  '#e8b04b', '#d96f4e', '#4ea5a0', '#7a9e7e', '#c95d7b', '#5b84ae',
  '#e3dcc8', '#b08968', '#88a2b9', '#dd8c5a', '#9db380', '#c2b280',
];
export const PALETTE = {
  grass: '#8fae62',
  grassDark: '#7d9c54',
  pavement: '#cfc8b8',
  sidewalk: '#ddd6c4',
  asphalt: '#4a4a52',
  asphaltEdge: '#3c3c44',
  lane: '#e8e4d2',
  sand: '#eed9a0',
  water: '#2e7fa8',
  waterDeep: '#256b91',
  shadow: 'rgba(40, 35, 20, 0.25)',
  gold: '#f4b942',
  ink: '#22303c',
  paper: '#fdf6e3',
  danger: '#e0483e',
  policeBlue: '#274b9f',
};
