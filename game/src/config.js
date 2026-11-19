// Palm City Heat — tuning constants, the city plan and the mission script.
// Everything the world, the renderer and the tests need to agree on lives
// here so there is exactly one source of truth.

export const VIEW_W = 1280;
export const VIEW_H = 800;
export const STEP = 1 / 60;

export const WORLD = { width: 4000, height: 3000 };

// The road grid. Vertical roads run the full height of the city, horizontal
// roads the full width; blocks sit between them.
export const ROADS_V = [360, 960, 1560, 2160, 2760, 3360];
export const ROADS_H = [360, 860, 1360, 1860, 2360];
export const ROAD_W = 110;
export const SIDEWALK = 16;
export const LANE = 28; // traffic keeps this far off the road centre line

// The beach: sand from SAND_X to the water line, water past it.
export const BEACH = { sandX: 3540, waterX: 3760 };

export const PALETTE = {
  grass: '#79b657',
  grassDark: '#6da84e',
  sand: '#eed9a0',
  water: '#2e8fb8',
  waterDeep: '#22749c',
  asphalt: '#4a4a52',
  asphaltEdge: '#3c3c44',
  sidewalk: '#cfc8b8',
  laneMark: '#f5eeda',
  roof: ['#e2725b', '#e88ca0', '#f2c14e', '#7fc8bc', '#f7f3e8', '#d96c47', '#8ecae6', '#ffb703'],
  wallShade: 'rgba(60, 40, 20, 0.18)',
  palmTrunk: '#8a6844',
  palmLeaf: '#3e9e4f',
  sky: '#ffe8c9',
};

export const PLAYER = {
  radius: 13,
  walkSpeed: 212,
  sprintSpeed: 326,
  health: 100,
  armourMax: 100,
};

export const PISTOL = {
  damage: 34,
  copDamage: 30,
  range: 560,
  bulletSpeed: 920,
  fireInterval: 0.24,
  magSize: 12,
  reloadTime: 0.9,
  startAmmoReserve: 48,
};

export const CAR = {
  accel: 340,
  brake: 640,
  reverseMax: 175,
  maxSpeed: 520,
  sportMaxSpeed: 645,
  steerRate: 2.7,
  grip: 7,
  hitDamageFrom: 220, // impacts slower than this are free
  hitCooldown: 0.6,
};

export const TRAFFIC = { count: 15, speed: 205, speedJitter: 45 };
export const PARKED = { count: 13 };
export const PEDS = { count: 26, walkSpeed: 74, scareRadius: 320 };

export const POLICE = {
  carSpeed: 562,
  carTurn: 3.05,
  spawnMin: 540,
  spawnMax: 880,
  ramRange: 120,
  copSpeed: 196, // foot cops are a touch slower than a sprinting player
  copShootRange: 300,
  copDamage: 6,
  bustRange: 60,
  bustTime: 1.6,
};

export const SPRAY = { cost: 150, radius: 86 };

export const PICKUPS = {
  spots: [
    { kind: 'health', x: 1180, y: 640 },
    { kind: 'armour', x: 2380, y: 1130 },
    { kind: 'ammo', x: 700, y: 2150 },
    { kind: 'health', x: 3090, y: 640 },
    { kind: 'ammo', x: 1830, y: 2640 },
    { kind: 'bribe', x: 1290, y: 1640 },
    { kind: 'bribe', x: 3030, y: 2140 },
    { kind: 'cash', x: 960, y: 1180 },
    { kind: 'cash', x: 2760, y: 400 },
  ],
  respawn: 45,
};

// Named places the story uses. All original to Palm City.
export const ZONES = {
  spawn: { x: 960, y: 780 },
  docks: { x: 330, y: 2680 },
  lookout: { x: 3300, y: 330 },
  comet: { x: 2790, y: 1290 }, // the gold Comet GT, parked on Coral Row
  garage: { x: 1560, y: 2360 },
  depot: { x: 600, y: 1900 },
  crates: [
    { x: 545, y: 1855 },
    { x: 655, y: 1905 },
    { x: 590, y: 1975 },
  ],
  safehouse: { x: 3360, y: 360 },
  airstrip: { x: 2400, y: 2900 },
  marina: { x: 3660, y: 1500 },
  spray: { x: 2160, y: 1100 },
  bags: [
    { x: 960, y: 330 },
    { x: 2160, y: 1890 },
    { x: 1560, y: 830 },
  ],
};

// Mara Voss's five jobs. Each mission is a list of legs; a leg is done when
// its condition holds. kind: goto | steal | crates | bags | boat.
export const MISSIONS = [
  {
    name: 'First Run',
    reward: 300,
    intro: 'Mara Voss: First job, easy money. Pick up a package at the DOCKS, south-west corner of the city.',
    legs: [
      { kind: 'goto', x: ZONES.docks.x, y: ZONES.docks.y, r: 74, text: 'Pick up the package at the DOCKS' },
      { kind: 'goto', x: ZONES.lookout.x, y: ZONES.lookout.y, r: 74, text: 'Deliver it to the Coral Bay lookout' },
    ],
    outro: 'Mara Voss: Clean work. The city is yours if you want it.',
  },
  {
    name: 'Hot Wheels',
    reward: 500,
    time: 90,
    intro: 'Mara Voss: A gold Comet GT is parked on Coral Row. Steal it and bring it to my garage. Clock is ticking.',
    legs: [
      { kind: 'steal', x: ZONES.comet.x, y: ZONES.comet.y, r: 95, text: 'Steal the gold Comet GT on Coral Row' },
      { kind: 'goto', x: ZONES.garage.x, y: ZONES.garage.y, r: 95, text: "Deliver the Comet to Mara's garage", inTargetCar: true },
    ],
    outro: 'Mara Voss: She purrs. You drive angry, I like it.',
  },
  {
    name: 'Loud Message',
    reward: 600,
    intro: 'Mara Voss: The depot crew shorted me. Shoot their three supply crates, then get to the safehouse.',
    legs: [
      { kind: 'crates', x: ZONES.depot.x, y: ZONES.depot.y, r: 150, text: 'Shoot the 3 crates at the depot' },
      { kind: 'goto', x: ZONES.safehouse.x, y: ZONES.safehouse.y, r: 84, text: 'Get to the safehouse' },
    ],
    outro: 'Mara Voss: Message received, apparently. Loud and clear.',
  },
  {
    name: 'The Pickup',
    reward: 800,
    intro: 'Mara Voss: Pick up my driver at the old airstrip, then take him to the marina. Expect company.',
    legs: [
      { kind: 'goto', x: ZONES.airstrip.x, y: ZONES.airstrip.y, r: 84, text: 'Pick up the driver at the airstrip' },
      { kind: 'goto', x: ZONES.marina.x, y: ZONES.marina.y, r: 95, text: 'Drive him to the marina — the law is watching', forceWanted: 2 },
    ],
    outro: 'Mara Voss: He says you drive like the city owes you money.',
  },
  {
    name: 'Last Job',
    reward: 1500,
    time: 180,
    intro: 'Mara Voss: Last job. Three cash bags are stashed around Palm City. Grab them all, then reach my boat at the marina.',
    legs: [
      { kind: 'bags', x: ZONES.marina.x, y: ZONES.marina.y, r: 95, text: 'Collect the 3 cash bags' },
      { kind: 'boat', x: ZONES.marina.x, y: ZONES.marina.y, r: 95, text: 'Reach the boat at the marina' },
    ],
    outro: 'Mara Voss: That is the whole city, paid in full. We are done — and rich.',
  },
];

export const SAVE_KEY = 'palm-city-heat-save-v1';
