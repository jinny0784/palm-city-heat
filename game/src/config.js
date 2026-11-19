// Palm City Heat — the numbers that shape the game: the city's layout,
// the car types, the places the story visits, and the tuning of the
// wanted system. Everything else reads from here.

export const WORLD_W = 4000;
export const WORLD_H = 3000;

// The road grid. Roads are named by the coordinate of their centre line;
// each road is ROAD_W wide, sidewalks included.
export const ROAD_W = 170;
export const V_ROADS = [420, 1120, 1820, 2520, 3220];
export const H_ROADS = [420, 1120, 1820, 2520];

// The coast: sand starts at BEACH_X, open water at WATER_X. Both run the
// full height of the east edge.
export const BEACH_X = 3560;
export const WATER_X = 3800;

// The places the story visits.
export const PLACES = {
  spawn: { x: 1218, y: 1218 },
  docks: { x: 3660, y: 2520 },
  cafe: { x: 640, y: 1890 },
  garage: { x: 1290, y: 960 },
  depot: { x: 770, y: 770 },
  safehouse: { x: 2180, y: 2180 },
  airstrip: { x: 770, y: 2790 },
  marina: { x: 3700, y: 700 },
  boat: { x: 3752, y: 700 },
  goldCar: { x: 2552, y: 620 },
  bags: [
    { x: 700, y: 2470 },
    { x: 1890, y: 640 },
    { x: 2980, y: 1960 },
  ],
};

// Car types. Speeds are px/s, acceleration px/s^2, radius the collision
// circle. The police interceptor is deliberately quicker than a sedan.
export const CAR_TYPES = {
  sedan: { maxSpeed: 300, accel: 235, radius: 25, hp: 100 },
  taxi: { maxSpeed: 295, accel: 230, radius: 25, hp: 100 },
  sports: { maxSpeed: 392, accel: 330, radius: 24, hp: 90 },
  van: { maxSpeed: 262, accel: 200, radius: 28, hp: 140 },
  police: { maxSpeed: 415, accel: 345, radius: 25, hp: 130 },
};

export const CAR_COLOURS = ['#e74c3c', '#ecf0f1', '#3498db', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#95a5a6', '#fd79a8', '#74b9ff'];
export const ROOF_COLOURS = ['#f6e8d8', '#f3c6a5', '#e8b4b8', '#a8d8ea', '#f9e79f', '#d5e8d4', '#f5cba7', '#d2b4de', '#aed6f1', '#fad7a0', '#f0e0c8', '#c8e6c9'];
export const PED_COLOURS = ['#ff7675', '#74b9ff', '#55efc4', '#ffeaa7', '#fd79a8', '#a29bfe', '#fdcb6e', '#81ecec', '#fab1a0', '#dfe6e9'];

// Player and wanted tuning.
export const PLAYER = {
  radius: 15,
  walkSpeed: 172,
  sprintSpeed: 262,
  hp: 100,
  pistolCooldown: 0.24,
  pistolRange: 460,
  interactRange: 88,
};

export const WANTED = {
  max: 5,
  decayAfter: 9, // seconds unseen before a star fades
  heatCooldown: 3.5, // seconds between witnessed-crime star gains
  bustedTime: 2.4, // seconds a cop must stay close to bust you
  resprayCost: 200,
};
