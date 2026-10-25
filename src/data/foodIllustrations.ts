/** Native Canvas food illustrations. All curves are baked once at boot, never in combat. */
type Ink = CanvasRenderingContext2D;
const OUT = '#754329';

function shape(c: Ink, d: string, fill: string, stroke = OUT, width = 1.6): void {
  const p = new Path2D(d);
  c.fillStyle = fill; c.fill(p);
  if (width) { c.strokeStyle = stroke; c.lineWidth = width; c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke(p); }
}
function line(c: Ink, d: string, color: string, width = 1.4): void {
  c.strokeStyle = color; c.lineWidth = width; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke(new Path2D(d));
}
function oval(c: Ink, x: number, y: number, rx: number, ry: number, fill: string, stroke = '', width = 1.5): void {
  c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fillStyle = fill; c.fill();
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
}
function rect(c: Ink, x: number, y: number, w: number, h: number, r: number, fill: string, stroke = ''): void {
  c.beginPath(); c.roundRect(x, y, w, h, r); c.fillStyle = fill; c.fill();
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1.6; c.stroke(); }
}
function shade(c: Ink, top: string, bottom: string, y1: number, y2: number): CanvasGradient {
  const fill = c.createLinearGradient(0, y1, 0, y2); fill.addColorStop(0, top); fill.addColorStop(1, bottom); return fill;
}
function gradientShape(c: Ink, d: string, top: string, bottom: string, y1: number, y2: number): void {
  const p = new Path2D(d); c.fillStyle = shade(c, top, bottom, y1, y2); c.fill(p);
  c.strokeStyle = OUT; c.lineWidth = 1.6; c.lineJoin = 'round'; c.stroke(p);
}
function arches(c: Ink, x: number, y: number, s = 1): void {
  c.save(); c.translate(x, y); c.scale(s, s);
  line(c, 'M-7 5 C-7-12-1-12 0 4 C1-12 7-12 7 5', '#ffda60', 2.8);
  c.restore();
}
function seeds(c: Ink, y: number): void {
  c.save(); c.translate(28, y);
  for (const [x, yy, a] of [[-13, 1, -.5], [-5, -3, .4], [5, -4, -.3], [14, 0, .6], [0, 3, -.5]]) {
    c.save(); c.translate(x, yy); c.rotate(a); oval(c, 0, 0, 1.7, .8, '#fff0bb'); c.restore();
  }
  c.restore();
}

/** Compact, touching layers: the crown is a bun silhouette rather than a floating ellipse. */
function burger(c: Ink, kind: string): void {
  const double = kind === 'double'; const fish = kind === 'fish';
  const spicy = kind === 'spicy' || kind === 'chicken'; const grill = kind === 'grill';
  const base = double ? 57 : 45;
  // Lower bun, then toppings from back to front.
  gradientShape(c, `M6 ${base - 3} Q28 ${base - 8} 50 ${base - 3} L49 ${base + 1} Q47 ${base + 6} 28 ${base + 6} Q9 ${base + 6} 7 ${base + 1}Z`, '#f6c46c', '#d48a37', base - 4, base + 6);
  line(c, `M12 ${base + 1} Q25 ${base + 4} 42 ${base + 1}`, '#ffe2a0', 1.5);
  gradientShape(c, `M7 ${base - 12} Q11 ${base - 15} 17 ${base - 13} Q31 ${base - 15} 47 ${base - 13} Q53 ${base - 9} 47 ${base - 4} Q28 ${base - 1} 9 ${base - 5} Q4 ${base - 7} 7 ${base - 12}Z`, fish ? '#efc064' : spicy ? '#da8d37' : '#92502e', fish ? '#ce8b36' : '#673b28', base - 14, base - 3);
  for (let i = 0; i < 7; i++) oval(c, 12 + i * 5, base - 9 + i % 2 * 2, 1.1, .7, fish || spicy ? '#ffdc88' : '#bd8550');
  shape(c, `M7 ${base - 16} L49 ${base - 16} L46 ${base - 10} L36 ${base - 11} L31 ${base - 6} L22 ${base - 11} L10 ${base - 10}Z`, '#ffcf52', '#b98030', 1);
  if (double) {
    gradientShape(c, 'M7 33 Q28 29 49 33 L49 38 Q28 42 7 38Z', '#f4c375', '#dc9b48', 32, 40);
    gradientShape(c, 'M8 27 Q28 23 48 27 Q52 31 47 34 Q27 37 9 33 Q4 31 8 27Z', '#95522f', '#693c29', 26, 35);
    shape(c, 'M8 25 L48 25 L44 30 L34 29 L28 33 L18 29 L10 30Z', '#ffcf52', '#b98030', 1);
  }
  const ly = double ? 23 : 27;
  if (!fish) {
    shape(c, `M5 ${ly} Q9 ${ly - 5} 14 ${ly - 2} Q19 ${ly - 6} 25 ${ly - 2} Q31 ${ly - 5} 36 ${ly - 2} Q43 ${ly - 5} 51 ${ly} L48 ${ly + 5} Q43 ${ly + 3} 39 ${ly + 6} Q32 ${ly + 3} 27 ${ly + 5} Q21 ${ly + 2} 16 ${ly + 5} Q9 ${ly + 3} 5 ${ly + 4}Z`, '#8bb952', '#658541', 1.2);
    line(c, `M10 ${ly} Q17 ${ly - 2} 22 ${ly + 1} M32 ${ly} Q41 ${ly - 2} 46 ${ly + 1}`, '#c7dd7f', 1.3);
    if (!grill) shape(c, `M8 ${ly - 3} Q28 ${ly - 6} 48 ${ly - 3} L47 ${ly} Q28 ${ly + 2} 9 ${ly}Z`, spicy ? '#c74c2f' : '#e96b46', '#9f5130', 1);
  } else {
    shape(c, 'M8 25 Q15 21 23 24 Q33 21 48 25 L47 30 Q41 28 36 31 Q26 28 20 30 Q13 28 8 30Z', '#fff2cc', '#d2b47b', 1);
    oval(c, 16, 26, .8, .6, '#80a063'); oval(c, 35, 26, .8, .6, '#80a063');
  }
  const bottom = double ? 23 : 25;
  gradientShape(c, `M5 ${bottom - 3} C5 5 16 3 28 3 C41 3 50 9 51 ${bottom - 3} Q50 ${bottom + 2} 28 ${bottom + 2} Q6 ${bottom + 2} 5 ${bottom - 3}Z`, fish ? '#f6d994' : '#f9ca70', '#df963e', 4, bottom + 2);
  line(c, 'M11 15 Q14 8 24 8', '#ffe7a7', 2.4);
  line(c, `M10 ${bottom - 1} Q28 ${bottom + 2} 46 ${bottom - 1}`, '#c98135', 1.1);
  if (grill) {
    line(c, 'M19 10 L23 17 M29 9 L33 17 M39 12 L42 18', '#af7338', 1.8);
  } else if (!fish) seeds(c, 13);
}

function carton(c: Ink): void {
  shape(c, 'M5 29 Q26 24 47 29 L43 53 Q26 59 9 53Z', '#ac392e');
  gradientShape(c, 'M5 28 Q26 38 47 28 L43 53 Q26 59 9 53Z', '#f26b45', '#d94732', 30, 55);
  shape(c, 'M40 32 L47 28 L43 53 L37 55Z', '#bb392c', OUT, 0);
  line(c, 'M10 35 L13 50', '#ffab73', 2);
  line(c, 'M15 52 Q26 55 34 53', '#f88651', 1.2);
  arches(c, 26, 46, .92);
}
function fries(c: Ink, kind: string): void {
  if (kind === 'hash') {
    c.save(); c.translate(26, 26); c.rotate(-.18);
    gradientShape(c, 'M-21-5 Q-22-13-12-13 L12-13 Q22-13 21-4 L20 8 Q18 15 10 15 L-11 15 Q-21 15-21 6Z', '#ffd57b', '#d29436', -13, 15);
    line(c, 'M-16-5 Q-16-9-10-9 L11-9', '#ffe9a7', 2);
    for (let i = 0; i < 20; i++) oval(c, -16 + (i * 11 % 33), -6 + (i * 7 % 16), 1.1, .8, i % 3 ? '#b97a2c' : '#ffe7a0');
    c.restore(); return;
  }
  if (kind === 'curly') {
    for (const [x, y, a] of [[14, 4, -.2], [28, 3, .12], [40, 8, .3]]) {
      c.save(); c.translate(x, y); c.rotate(a);
      const curl = 'M0 29 C-9 23 9 23 3 17 C-5 12-5 7 2 4 C9 1 9 9 3 12 C-5 15-5 20 2 23';
      line(c, curl, OUT, 6.4); line(c, curl, '#f3b644', 4.1); line(c, 'M2 5 Q7 3 6 7 M-1 17 Q-4 20 0 22', '#ffe28a', 1.3);
      c.restore();
    }
  } else {
    for (const [x, y, a, h] of [[10, 10, -.18, 28], [18, 4, -.08, 32], [26, 7, .04, 31], [34, 3, .12, 32], [42, 9, .23, 28]]) {
      c.save(); c.translate(x, y); c.rotate(a);
      rect(c, -3, 0, 6.4, h, 1.1, '#efb443', OUT);
      rect(c, -1.9, 1.3, 2.2, h - 4, .6, '#ffe497');
      line(c, 'M-1 2 L1.5 2', '#fff0b5', 1); c.restore();
    }
  }
  carton(c);
}

function steam(c: Ink, x: number, y: number): void {
  line(c, `M${x} ${y} C${x - 4} ${y - 3} ${x + 4} ${y - 5} ${x} ${y - 9} M${x + 9} ${y} C${x + 5} ${y - 3} ${x + 13} ${y - 5} ${x + 9} ${y - 9}`, '#ba9d76', 1.5);
}
function drink(c: Ink, kind: string): void {
  const band = kind === 'sprite' ? '#75ad60' : kind === 'fanta' || kind === 'juice' ? '#ee9b43' : kind === 'tea' ? '#c88e3d' : '#e55c40';
  const hot = kind === 'hot'; const iced = kind === 'iced';
  if (hot) steam(c, 17, 10);
  else {
    line(c, 'M27 20 L30 5 L37 4', OUT, 4.6);
    line(c, 'M27 20 L30 5 L37 4', iced ? '#668c7a' : '#e86e52', 2.3);
  }
  const body = 'M8 18 L36 18 L32 55 Q22 59 12 55Z';
  gradientShape(c, body, iced ? '#efdbb5' : '#fff9e8', iced ? '#bd8b5d' : '#e9dbb8', 18, 57);
  if (iced) {
    shape(c, 'M10 35 Q22 40 34 35 L32 55 Q22 58 12 55Z', '#925d3a', OUT, 0);
    line(c, 'M11 36 Q24 41 33 36', '#d8ad7a', 1.7);
    for (const [x, y] of [[14, 24], [24, 27]]) { rect(c, x, y, 7, 7, 1.7, '#f6efda', '#d5c8ad'); line(c, `M${x + 2} ${y + 2}h3`, '#fff9ed', 1); }
  } else {
    shape(c, 'M9.5 29 Q22 32 34.5 29 L33 45 Q22 49 11 45Z', hot ? '#a65939' : band, OUT, 0);
    if (kind === 'sprite' || kind === 'fanta' || kind === 'juice' || kind === 'tea') {
      oval(c, 22, 38, 5.6, 5.6, kind === 'sprite' ? '#eff1ad' : '#ffe6a0');
      line(c, 'M22 33.5V42.5 M18 38H26 M19 35L25 41', kind === 'sprite' ? '#85ad55' : '#e7a24a', 1);
    } else arches(c, 22, 39, .67);
  }
  line(c, 'M13 22 L15 43', '#ffffffb3', 2.2);
  gradientShape(c, 'M6 14 Q22 10 38 14 L39 19 Q22 23 5 19Z', hot ? '#b77c4a' : '#f7efd4', hot ? '#8d5533' : '#d7c9a6', 12, 21);
  line(c, 'M9 15 Q23 12 34 15', hot ? '#e5b97b' : '#ffffff', 1.3);
  if (hot) line(c, 'M25 16H31', '#70432c', 1.8);
  if (kind === 'tea') {
    oval(c, 12, 12, 6.4, 6.4, '#f8cf5c', OUT); oval(c, 12, 12, 4.5, 4.5, '#fff0b2');
    line(c, 'M12 8V16 M8 12H16 M9 9L15 15', '#dba84a', 1);
  }
}

function softServe(c: Ink, x: number, y: number, choco = false, berry = false): void {
  c.save(); c.translate(x, y);
  gradientShape(c, 'M-13 10 Q-17 6-9 1 Q-14-3-4-7 Q-7-11 2-15 Q2-8 7-6 Q14-3 9 1 Q17 5 13 10 Q0 15-13 10Z', choco ? '#c18b64' : berry ? '#ffdbc9' : '#fffbed', choco ? '#885539' : berry ? '#ed9c88' : '#ead4ad', -12, 14);
  line(c, 'M-8 1 Q0 4 9 1 M-11 7 Q-1 10 11 6', choco ? '#8a543a' : berry ? '#c96658' : '#d1ad7f', 1.2);
  line(c, 'M-4-5 Q0-8 2-9 M-9 5 Q-6 3-4 4', choco ? '#edbf91' : '#ffffff', 1.5);
  c.restore();
}
function cone(c: Ink, choco: boolean): void {
  gradientShape(c, 'M9 28 L35 28 L24 56 Q22 60 20 56Z', '#efc779', '#c18a41', 28, 58);
  c.save(); c.clip(new Path2D('M10 29 L34 29 L22 57Z'));
  line(c, 'M7 30L29 52 M7 39L24 56 M16 28L33 45 M34 30L15 50 M35 39L21 54 M25 29L11 43', '#ae793a', .9); c.restore();
  softServe(c, 22, 17, choco);
  line(c, 'M12 31 Q22 34 32 31', '#ffe3a0', 1.6);
}
function nugget(c: Ink, x: number, y: number, s = 1): void {
  c.save(); c.translate(x, y); c.scale(s, s);
  gradientShape(c, 'M-9-4 Q-10-9-3-9 Q2-12 8-7 Q12-3 8 5 Q4 11-3 8 Q-11 8-9-4Z', '#f4c66e', '#ce8a35', -9, 9);
  line(c, 'M-5-5 Q0-9 5-5', '#ffe39a', 1.5);
  for (const [a, b] of [[-5, 1], [2, -3], [5, 4], [-1, 5]]) oval(c, a, b, .8, .7, '#b57a31'); c.restore();
}

/** All 28 registered keys share this material and contour language. */
export function paintFood(c: Ink, key: string): void {
  c.save();
  const kind = key.split('-').slice(2).join('-');
  if (key.startsWith('food-burger-') || key.startsWith('food-flame-')) burger(c, kind);
  else if (key.startsWith('food-fries-')) fries(c, kind);
  else if (key.startsWith('food-cola-') || key.startsWith('food-coffee-') || key === 'food-ice-tea' || key === 'food-ice-juice') drink(c, kind);
  else if (key === 'food-ice-milk') {
    shape(c, 'M9 20 L18 8 L30 8 L35 20 L34 55 L10 55Z', '#fff4d7');
    shape(c, 'M25 20 L30 8 L35 20 L34 55 L25 55Z', '#dfd5b5');
    shape(c, 'M9 20 L18 8 L25 20Z', '#e3e9d4');
    rect(c, 17, 6, 14, 4, 1, '#f6edd1', OUT);
    shape(c, 'M10 30 L25 31 L34 29 L34 44 L25 47 L10 44Z', '#80b7b2', OUT, 0);
    shape(c, 'M18 33 Q11 40 18 42 Q24 40 18 33Z', '#fff9e8', OUT, 0);
    line(c, 'M13 23V28 M13 48V51', '#ffffff', 2);
  } else if (key.startsWith('food-shield-')) cone(c, kind === 'choco');
  else if (key === 'food-mine-box') {
    shape(c, 'M5 16 L9 7 L42 7 L47 16Z', '#efdcae');
    nugget(c, 15, 13, .75); nugget(c, 28, 10, .8); nugget(c, 38, 15, .7);
    gradientShape(c, 'M3 18 Q26 22 49 18 L45 32 Q26 36 7 32Z', '#f5e6c4', '#dbc59a', 18, 34);
    shape(c, 'M18 21 L35 21 L34 34 L19 34Z', '#e66543', OUT, 0); arches(c, 26, 28, .55);
    line(c, 'M8 23L10 29', '#fff8df', 1.8);
  } else if (key === 'food-mine-wing') {
    shape(c, 'M29 14 L44 12 Q47 7 50 10 Q54 14 49 17 Q53 23 48 25 Q44 26 43 21 L29 22Z', '#fff0ce');
    gradientShape(c, 'M4 12 Q10 4 18 7 Q25 3 31 11 L37 17 Q38 24 27 27 Q18 32 9 26 Q1 23 4 12Z', '#f2b65d', '#bb6832', 7, 29);
    line(c, 'M8 15 Q14 8 21 11 M26 12L31 18', '#ffd78a', 2);
    line(c, 'M12 22 Q19 25 27 20', '#c04c2d', 2.5);
    for (const [x, y] of [[10, 19], [17, 15], [24, 17], [21, 25]]) oval(c, x, y, .9, .7, '#954e2c');
  } else if (key === 'food-heal-pie') {
    c.save(); c.translate(26, 26); c.rotate(-.35);
    gradientShape(c, 'M-19-10 Q-20-15-13-15 L14-15 Q20-15 20-9 L20 11 Q19 16 13 16 L-13 16 Q-20 15-19 10Z', '#f4c573', '#d28b3e', -15, 16);
    rect(c, -16, -12, 33, 25, 4, '#e8ac52', '#bb7c35');
    for (let x = -10; x < 14; x += 8) { line(c, `M${x} -6l-3 11`, '#a56730', 2.4); line(c, `M${x + 2} -6l-3 11`, '#ffdb87', 1.4); }
    for (let x = -12; x < 16; x += 5) { line(c, `M${x} -14v2 M${x} 13v2`, '#b57a34', .8); }
    c.restore();
  } else if (key === 'food-heal-mcflurry') {
    line(c, 'M33 27L37 5', OUT, 5); line(c, 'M33 27L37 5', '#80b7b2', 2.8);
    softServe(c, 23, 21);
    gradientShape(c, 'M9 29 Q24 33 39 29 L35 56 Q24 61 13 56Z', '#d5e8df', '#91bab4', 30, 59);
    shape(c, 'M10 34 Q22 38 38 34 L37 46 Q24 50 12 46Z', '#fff1cf', OUT, 0);
    arches(c, 24, 43, .7); line(c, 'M14 35L16 53', '#ffffffa0', 2);
    for (const [x, y] of [[15, 23], [23, 16], [31, 24], [22, 26]]) rect(c, x, y, 3, 2.5, .5, '#70492e');
  } else if (key === 'food-heal-sundae') {
    gradientShape(c, 'M10 28 L38 28 L30 47 L25 49 L25 53 L33 55 Q24 59 15 55 L22 53 L22 49 L17 47Z', '#e3eee0', '#b7c9b9', 28, 57);
    shape(c, 'M12 30 L36 30 L30 44 Q24 48 18 44Z', '#e7977c', OUT, 0);
    softServe(c, 24, 18, false, true);
    line(c, 'M17 25 Q24 21 33 25', '#be5540', 2.8);
    line(c, 'M25 6Q26 2 30 2', '#69854f', 1.3); oval(c, 24, 8, 3.3, 3.3, '#d4583d', OUT, 1); oval(c, 23, 7, 1, .7, '#ffb595');
  } else if (key === 'food-desperate-espresso') {
    steam(c, 12, 14); oval(c, 18, 36, 14, 3.5, '#ead4ad', OUT);
    oval(c, 28, 25, 5, 5, '#f5e7ca', OUT); oval(c, 28, 25, 2.5, 2.5, '#fcf3d9');
    gradientShape(c, 'M6 19 L28 19 L26 31 Q18 37 9 31Z', '#bd8351', '#7e4c30', 19, 34);
    oval(c, 17, 19, 11, 3.3, '#e9bf7e', OUT); oval(c, 17, 19, 8, 1.7, '#71472e'); line(c, 'M10 23L11 28', '#f3cfa0', 1.6);
  } else if (key === 'food-wingman-kart') {
    for (const x of [14, 43]) { oval(c, x, 40, 6, 7, '#3d493c', OUT); oval(c, x, 40, 2.5, 3, '#e5d6b5'); }
    gradientShape(c, 'M7 17 L48 17 L47 36 Q28 42 8 36Z', '#f27a4d', '#d84a32', 17, 39);
    shape(c, 'M7 17 L17 10 L39 10 L48 17Z', '#ffb260');
    line(c, 'M19 13 Q19 2 28 3 Q37 2 37 13', OUT, 4.7); line(c, 'M19 13 Q19 2 28 3 Q37 2 37 13', '#ffda60', 2.3);
    arches(c, 28, 29, 1); rect(c, 8, 32, 5, 3, 1, '#ffdc75'); rect(c, 42, 32, 5, 3, 1, '#ffdc75');
    line(c, 'M11 21V29', '#ffb48a', 1.8);
  } else if (key === 'food-missile-burger') {
    shape(c, 'M12 42 Q13 53 20 58 Q28 51 28 42Z', '#f4a647', '#b96a35', 1);
    shape(c, 'M16 42 Q16 50 20 53 Q24 48 24 42Z', '#ffe293', OUT, 0);
    shape(c, 'M9 30 L2 45 L12 42 M31 30 L38 45 L28 42', '#c85a38');
    gradientShape(c, 'M8 18 Q20 14 32 18 L30 41 Q20 47 10 41Z', '#f08048', '#c55330', 18, 43);
    shape(c, 'M9 28 L31 28 L30 34 L23 33 L20 37 L15 33 L10 34Z', '#ffcf52', '#b98335', 1);
    gradientShape(c, 'M8 20 Q8 4 20 3 Q32 4 32 20 Q20 25 8 20Z', '#f9ce7a', '#e0a04a', 3, 23);
    line(c, 'M13 14 Q14 8 20 8', '#ffe6ae', 2); oval(c, 23, 12, 1.5, .8, '#fff1c7'); oval(c, 17, 16, 1.5, .8, '#fff1c7');
  } else if (key === 'food-starter') {
    shape(c, 'M5 28 L2 40 L8 37 M17 28 L20 40 L14 37', '#a55d36');
    gradientShape(c, 'M5 14 L17 14 L17 35 Q11 40 5 35Z', '#f9c46f', '#de873b', 14, 37);
    gradientShape(c, 'M5 14 Q5 7 11 3 Q17 7 17 14Z', '#fff3ce', '#e7c48a', 3, 14);
    rect(c, 5, 33, 12, 6, 2, '#8e5634', OUT); line(c, 'M8 18V29', '#ffe8aa', 2);
    line(c, 'M8 43V46 M14 42V45', '#e7aa58', 1.7);
  } else {
    throw new Error(`Missing food illustration: ${key}`);
  }
  c.restore();
}
