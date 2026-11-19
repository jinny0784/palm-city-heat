// config.js — world layout and tuning constants for Palm City Heat.

export const VIEW_W = 1280;
export const VIEW_H = 800;

export const WORLD_W = 4000;
export const WORLD_H = 3000;

// Road centre lines. Roads are ROAD_W wide; blocks sit between them.
export const ROAD_W = 128;
export const ROADS_X = [320, 940, 1560, 2180, 2800, 3420];
export const ROADS_Y = [300, 900, 1500, 2100, 2640];

// The east edge is a beach, then open water. Piers reach into the water.
export const BEACH_X = 3660;
export const WATER_X = 3840;

export const PLAYER = {
  radius: 13,
  speed: 178,
  sprint: 262,
  hp: 100,
  startCash: 60,
  startAmmo: 48,
};

export const CAR_TYPES = {
  sedan: { w: 46, h: 24, maxSpeed: 330, accel: 250, turn: 3.1, hp: 100 },
  sport: { w: 48, h: 24, maxSpeed: 432, accel: 345, turn: 3.5, hp: 90 },
  police: { w: 47, h: 24, maxSpeed: 398, accel: 318, turn: 3.6, hp: 140 },
};

export const CAR_COLORS = [
  '#d94f3d', '#3d7bd9', '#f2f2f2', '#2b2f36', '#f7b731', '#7bc950',
  '#e67e22', '#9b59b6', '#1abc9c', '#ec87bf', '#95a5a6', '#fd79a8',
];

export const ROOF_COLORS = [
  '#f2e3c9', '#e8b4a0', '#f7f0dc', '#d9e6f2', '#f4c95d', '#e5989b',
  '#b5d99c', '#ffdac1', '#c9e4f6', '#f6d8e0', '#efe6cf', '#d5ecd2',
];

export const PED_COLORS = [
  '#ff6b6b', '#feca57', '#48dbfb', '#1dd1a1', '#f368e0', '#ff9f43',
  '#54a0ff', '#5f27cd', '#c8d6e5', '#fd79a8', '#e77f67', '#3dc1d3',
];

export const SAVE_KEY = 'palm-city-heat-save-v1';
export const SPRAY_COST = 100;
