// Edificis en 3D per a la vista isomètrica. Cada casella d'edifici és un bloc: la teulada a dalt
// (amb la textura de roofs.js) i, als costats que es veuen, les façanes de tiles.js repetides per
// planta. Els blocs es dibuixen com a sprites, ordenats en profunditat amb els personatges, així
// un edifici tapa qui camina pel carrer del darrere. Les imatges es guarden a la memòria cau
// segons l'aspecte (tipus d'edifici, zona, variant, plantes i façanes visibles).
"use strict";

const FLOOR_H = 12;            // píxels de pantalla per planta
const cubeCache = new Map();
const roofPatchCache = new Map();

// Plantes d'un edifici: les mateixes per a totes les caselles del mateix edifici (v)
const buildingFloors = (v) => 2 + (hash2(v, 3) % 3);

// Textura plana de teulada de 16×16 (els shaders de roofs.js, sense els vessants)
function roofPatch(v, th, variant) {
  const key = v + ":" + th + ":" + variant;
  let cv = roofPatchCache.get(key);
  if (cv) return cv;
  const shader = ROOF_SHADERS[th], b = v - BUILDING_BASE, type = (b / 4) | 0, s = b % 4;
  const base = roofBase(th, type, s), info = { s, type, t: 0.6 };
  cv = document.createElement("canvas");
  cv.width = cv.height = TS;
  const c = cv.getContext("2d"), img = c.createImageData(TS, TS);
  for (let ly = 0; ly < TS; ly++) for (let lx = 0; lx < TS; lx++) {
    const col = shader.pixel(variant * TS + lx + 4096, ly + 4096, base, info), i = (ly * TS + lx) * 4;
    img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  roofPatchCache.set(key, cv);
  return cv;
}

// Bloc d'una casella: 2·TS d'ample i TS + alçada d'alt. left/right: façanes visibles
function cubeFor(v, th, variant, left, right) {
  const key = v + ":" + th + ":" + variant + ":" + (left ? 1 : 0) + (right ? 1 : 0);
  let cv = cubeCache.get(key);
  if (cv) return cv;
  const floors = buildingFloors(v), H = floors * FLOOR_H, theme = THEMES[th];
  cv = document.createElement("canvas");
  cv.width = 2 * TS; cv.height = TS + H;
  const c = cv.getContext("2d");
  c.imageSmoothingEnabled = false;
  const facade = getTile("f", v, variant, th), k = FLOOR_H / TS;
  for (let f = 0; f < floors; f++) {
    if (left) { // façana sud (avall a l'esquerra), il·luminada
      c.setTransform(1, 0.5, 0, k, 0, TS / 2 + f * FLOOR_H);
      c.drawImage(facade, 0, 0);
    }
    if (right) { // façana est (avall a la dreta), a l'ombra
      c.setTransform(1, -0.5, 0, k, TS, TS + f * FLOOR_H);
      c.drawImage(facade, 0, 0);
      c.fillStyle = "rgba(20,14,40,.32)";
      c.fillRect(0, 0, TS, TS);
    }
  }
  // teulada plana (rombe)
  c.setTransform(1, 0.5, -1, 0.5, TS, 0);
  c.drawImage(roofPatch(v, th, variant), 0, 0);
  // arestes fosques
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.strokeStyle = theme.outline; c.lineWidth = 1;
  c.beginPath();
  if (left) { c.moveTo(0, TS / 2 + 0.5); c.lineTo(TS, TS + 0.5); c.moveTo(0.5, TS / 2); c.lineTo(0.5, TS / 2 + H); }
  if (right) { c.moveTo(TS, TS + 0.5); c.lineTo(2 * TS, TS / 2 + 0.5); c.moveTo(2 * TS - 0.5, TS / 2); c.lineTo(2 * TS - 0.5, TS / 2 + H); }
  if (left || right) { c.moveTo(TS + 0.5, TS); c.lineTo(TS + 0.5, TS + H); }
  c.stroke();
  cubeCache.set(key, cv);
  if (cubeCache.size > 6000) cubeCache.delete(cubeCache.keys().next().value);
  return cv;
}

// Afegeix a la llista de sprites els blocs dels edificis visibles
function pushBuildingSprites(list, tx0, tx1, ty0, ty1, camX, camY, vw, vh) {
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const raw = state.ground[ty * state.W + tx], v = raw & 127;
    if (v < BUILDING_BASE) continue;
    const X = (tx - ty) * TS, Y = (tx + ty) * TS / 2;
    if (X + TS < camX || X - TS > camX + vw || Y - ISO_MAX_H > camY + vh || Y + TS < camY) continue;
    const left = (g(tx, ty + 1) & 127) !== v, right = (g(tx + 1, ty) & 127) !== v;
    const img = cubeFor(v, sectorAt(tx, ty), hash2(tx, ty) % 4, left, right);
    // profunditat: el centre de la casella (com els peus d'un personatge)
    list.push([(tx + ty + 1) * TS / 2, img, X - TS, Y + TS - img.height, false, 0, { iso: true, outside: raw & OUTSIDE }]);
  }
}

// Passa els sprites de coordenades del mapa (vist de dalt) a la vista isomètrica: el punt de
// recolzament (a baix al mig de la imatge) es projecta i la imatge es dibuixa dreta a sobre.
function projectSprites(list) {
  for (const e of list) {
    const fx = e[6];
    if (fx?.iso) continue;
    const img = e[1], s = e[5] || 1;
    const ay = e[0], ax = e[2] + (img.width * s) / 2;
    const X = isoX(ax, ay), Y = isoY(ax, ay);
    e[2] = X - (img.width * s) / 2;
    e[3] = Y + (e[3] - ay);
    e[0] = isoY(ax, fx?.depth ?? ay);
  }
}
