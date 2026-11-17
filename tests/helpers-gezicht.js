// Een nagebootst gezicht van 68 punten in drie dimensies (x naar rechts, y naar beneden, z naar de camera),
// voor de tests van de controle op een levend gezicht (FaceLiveness). De maten zijn ruwweg die van een echt
// gezicht, met de afstand tussen de ogen als eenheid (1). De nummering volgt de 68 gezichtspunten van
// face-api: 0-16 kaaklijn, 17-26 wenkbrauwen, 27-35 neus, 36-47 ogen, 48-67 mond.

// Eén oog van zes punten rond (cx, cy), met `open` de ooghoogte gedeeld door de breedte (0.3 = open).
const eye = (cx, cy, open) => {
  const w = 0.3;
  const h = open * w;
  return [
    [cx - w / 2, cy, 0], [cx - w / 6, cy - h / 2, 0.02], [cx + w / 6, cy - h / 2, 0.02],
    [cx + w / 2, cy, 0], [cx + w / 6, cy + h / 2, 0.02], [cx - w / 6, cy + h / 2, 0.02]
  ];
};

// De 68 punten van een recht vooruit kijkend gezicht. `eyeOpen` is de ooghoogte (0.3 open, 0.08 dicht).
export const face3d = ({ eyeOpen = 0.3 } = {}) => {
  const points = [];
  for (let i = 0; i <= 16; i += 1) {
    const angle = Math.PI * (i / 16);              // van rechts naar links langs de onderkant
    const x = -Math.cos(angle) * 0.95;
    const y = 0.1 + Math.sin(angle) * 1.0;
    const z = -0.7 + Math.sin(angle) * 0.5;          // de zijkant van het gezicht ligt verder naar achter
    points.push([x, y, z]);
  }
  for (let i = 0; i < 5; i += 1) points.push([-0.8 + i * 0.13, -0.35 - Math.sin((i / 4) * Math.PI) * 0.08, -0.05]);
  for (let i = 0; i < 5; i += 1) points.push([0.28 + i * 0.13, -0.35 - Math.sin((i / 4) * Math.PI) * 0.08, -0.05]);
  for (let i = 0; i < 4; i += 1) points.push([0, -0.2 + i * 0.13, 0.1 + i * 0.12]); // neusrug naar de punt
  for (let i = 0; i < 5; i += 1) points.push([-0.2 + i * 0.1, 0.38, 0.25 - Math.abs(i - 2) * 0.05]);
  points.push(...eye(-0.5, -0.15, eyeOpen), ...eye(0.5, -0.15, eyeOpen));
  for (let i = 0; i < 12; i += 1) {
    const angle = (2 * Math.PI * i) / 12;
    points.push([Math.cos(angle) * 0.4, 0.7 + Math.sin(angle) * 0.12, 0.1 - Math.abs(Math.sin(angle)) * 0.05]);
  }
  for (let i = 0; i < 8; i += 1) {
    const angle = (2 * Math.PI * i) / 8;
    points.push([Math.cos(angle) * 0.3, 0.7 + Math.sin(angle) * 0.05, 0.1]);
  }
  return points;
};

// Draait het hoofd `yaw` graden (links, rechts) en `pitch` graden (op, neer) en projecteert het op het
// camerabeeld: `size` pixels per eenheid, met het midden op (cx, cy). Geeft 68 punten { x, y }.
export const project = (points, { yaw = 0, pitch = 0, size = 60, cx = 160, cy = 120, distance = 8 } = {}) => {
  const a = (yaw * Math.PI) / 180;
  const b = (pitch * Math.PI) / 180;
  return points.map(([x, y, z]) => {
    const x1 = x * Math.cos(a) + z * Math.sin(a);
    const z1 = -x * Math.sin(a) + z * Math.cos(a);
    const y2 = y * Math.cos(b) - z1 * Math.sin(b);
    const z2 = y * Math.sin(b) + z1 * Math.cos(b);
    const scale = distance / (distance - z2);        // perspectief: dichterbij is groter
    return { x: cx + x1 * size * scale, y: cy + y2 * size * scale };
  });
};

// Een foto: de punten van een plat beeld, verschoven, gedraaid, geschaald en gekanteld (affien).
export const photo = (points, { dx = 0, dy = 0, angle = 0, scale = 1, shear = 0 } = {}) => {
  const a = (angle * Math.PI) / 180;
  return points.map(({ x, y }) => {
    const sx = (x - 160) * scale + shear * (y - 120);
    const sy = (y - 120) * scale;
    return { x: 160 + dx + sx * Math.cos(a) - sy * Math.sin(a), y: 120 + dy + sx * Math.sin(a) + sy * Math.cos(a) };
  });
};

// Ruis zoals bij een echte detectie: ieder punt schuift hooguit `amount` pixels, voorspelbaar per `seed`.
export const jitter = (points, amount, seed = 1) => {
  let state = seed;
  const random = () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648 - 0.5;
  };
  return points.map(({ x, y }) => ({ x: x + random() * 2 * amount, y: y + random() * 2 * amount }));
};
