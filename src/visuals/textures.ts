import * as THREE from 'three';
import { PALETTE } from '../game/config';

// All textures are small procedural canvases — no image files, no network.

const cache = new Map<string, THREE.Texture>();

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function finish(key: string, c: HTMLCanvasElement, repeat = true, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 4;
  cache.set(key, t);
  return t;
}

/** Soft diagonal stripes on black, used as an emissive map for candy highlights. */
export function stripeTexture(): THREE.Texture {
  const key = 'stripe';
  if (cache.has(key)) return cache.get(key)!;
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#000';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#fff';
  g.lineCap = 'round';
  for (let i = -2; i < 4; i++) {
    const off = i * 64;
    g.globalAlpha = 0.9;
    g.lineWidth = 9;
    g.beginPath();
    g.moveTo(off, 128);
    g.lineTo(off + 128, 0);
    g.stroke();
    g.globalAlpha = 0.35;
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(off + 22, 128);
    g.lineTo(off + 150, 0);
    g.stroke();
  }
  return finish(key, c);
}

export function floorTexture(): THREE.Texture {
  const key = 'floor';
  if (cache.has(key)) return cache.get(key)!;
  const [c, g] = canvas(256, 256);
  const s = 128;
  for (let y = 0; y < 2; y++)
    for (let x = 0; x < 2; x++) {
      g.fillStyle = (x + y) % 2 === 0 ? PALETTE.floorA : PALETTE.floorB;
      g.fillRect(x * s, y * s, s, s);
    }
  // Soft grout + tiny sparkle dots.
  g.strokeStyle = 'rgba(160,110,80,0.10)';
  g.lineWidth = 3;
  for (let i = 0; i <= 2; i++) {
    g.beginPath();
    g.moveTo(i * s, 0);
    g.lineTo(i * s, 256);
    g.stroke();
    g.beginPath();
    g.moveTo(0, i * s);
    g.lineTo(256, i * s);
    g.stroke();
  }
  g.fillStyle = 'rgba(255,255,255,0.35)';
  for (let i = 0; i < 10; i++) {
    g.beginPath();
    g.arc((i * 83) % 256, (i * 47 + 20) % 256, 2.2, 0, Math.PI * 2);
    g.fill();
  }
  return finish(key, c);
}

export function candyStripeTexture(a: string, b: string, stripes = 6, key = `cs-${a}-${b}-${stripes}`): THREE.Texture {
  if (cache.has(key)) return cache.get(key)!;
  const [c, g] = canvas(128, 32);
  g.fillStyle = a;
  g.fillRect(0, 0, 128, 32);
  g.fillStyle = b;
  const w = 128 / stripes;
  for (let i = -1; i < stripes + 1; i++) {
    g.beginPath();
    g.moveTo(i * w, 32);
    g.lineTo(i * w + w * 0.5, 32);
    g.lineTo(i * w + w * 0.5 + 16, 0);
    g.lineTo(i * w + 16, 0);
    g.closePath();
    g.fill();
  }
  return finish(key, c);
}

export function awningTexture(): THREE.Texture {
  const key = 'awning';
  if (cache.has(key)) return cache.get(key)!;
  const [c, g] = canvas(128, 16);
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 === 0 ? PALETTE.strawberry : PALETTE.cream;
    g.fillRect(i * 16, 0, 16, 16);
  }
  return finish(key, c);
}

export function beltTexture(): THREE.Texture {
  const key = 'belt';
  if (cache.has(key)) return cache.get(key)!;
  const [c, g] = canvas(64, 64);
  g.fillStyle = '#5B4A63';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#6E5C78';
  for (let i = 0; i < 4; i++) g.fillRect(i * 16, 0, 7, 64);
  g.fillStyle = 'rgba(255,255,255,0.08)';
  g.fillRect(0, 0, 2, 64);
  return finish(key, c);
}

/** Top-down lollipop swirl for product heads, per contract. */
export function swirlTexture(a: string, b: string, cAccent: string): THREE.Texture {
  const key = `swirl-${a}-${b}-${cAccent}`;
  if (cache.has(key)) return cache.get(key)!;
  const [c, g] = canvas(128, 128);
  g.fillStyle = a;
  g.fillRect(0, 0, 128, 128);
  g.translate(64, 64);
  for (let arm = 0; arm < 3; arm++) {
    g.strokeStyle = arm === 1 ? cAccent : b;
    g.lineWidth = 9;
    g.lineCap = 'round';
    g.beginPath();
    for (let t = 0; t < 1; t += 0.01) {
      const ang = t * Math.PI * 3.2 + (arm * Math.PI * 2) / 3;
      const r = t * 60;
      const x = Math.cos(ang) * r;
      const y = Math.sin(ang) * r;
      if (t === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
  return finish(key, c, false);
}

export function signTexture(text: string, bg: string, fg: string, w = 256, h = 64): THREE.Texture {
  const key = `sign-${text}-${bg}-${fg}-${w}x${h}`;
  if (cache.has(key)) return cache.get(key)!;
  const [c, g] = canvas(w, h);
  g.fillStyle = bg;
  const r = h * 0.35;
  g.beginPath();
  g.roundRect(0, 0, w, h, r);
  g.fill();
  g.fillStyle = fg;
  g.font = `700 ${Math.floor(h * 0.52)}px Fredoka, "Trebuchet MS", system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 2);
  return finish(key, c, false);
}

export function parkingTexture(): THREE.Texture {
  const key = 'parking';
  if (cache.has(key)) return cache.get(key)!;
  const [c, g] = canvas(128, 160);
  g.clearRect(0, 0, 128, 160);
  g.strokeStyle = 'rgba(60,165,173,0.85)';
  g.lineWidth = 8;
  g.setLineDash([18, 12]);
  g.beginPath();
  g.roundRect(8, 8, 112, 144, 22);
  g.stroke();
  g.setLineDash([]);
  g.fillStyle = 'rgba(60,165,173,0.9)';
  g.font = '700 64px Fredoka, system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('P', 64, 84);
  return finish(key, c, false);
}

export function unloadPadTexture(): THREE.Texture {
  const key = 'unloadPad';
  if (cache.has(key)) return cache.get(key)!;
  const [c, g] = canvas(160, 192);
  g.fillStyle = '#FFF4E0';
  g.beginPath();
  g.roundRect(0, 0, 160, 192, 34);
  g.fill();
  // Candy-stripe border.
  g.save();
  g.beginPath();
  g.roundRect(0, 0, 160, 192, 34);
  g.clip();
  g.lineWidth = 16;
  for (let i = -12; i < 30; i++) {
    g.strokeStyle = i % 2 === 0 ? PALETTE.strawberry : '#FFFFFF';
    g.beginPath();
    g.moveTo(i * 16, 0);
    g.lineTo(i * 16 + 192, 192);
    g.stroke();
  }
  g.restore();
  g.fillStyle = '#FFF4E0';
  g.beginPath();
  g.roundRect(16, 16, 128, 160, 22);
  g.fill();
  // Arrows toward the machine (+x → canvas right).
  g.fillStyle = PALETTE.teal;
  for (let i = 0; i < 2; i++) {
    const x = 36 + i * 44;
    g.beginPath();
    g.moveTo(x, 66);
    g.lineTo(x, 126);
    g.lineTo(x + 32, 96);
    g.closePath();
    g.fill();
  }
  return finish(key, c, false);
}

export function faceTexture(): THREE.Texture {
  const key = 'robotFace';
  if (cache.has(key)) return cache.get(key)!;
  const [c, g] = canvas(64, 64);
  g.fillStyle = '#3B2F45';
  g.beginPath();
  g.roundRect(0, 0, 64, 64, 16);
  g.fill();
  g.fillStyle = '#7FF0D0';
  g.beginPath();
  g.ellipse(21, 28, 6, 8, 0, 0, Math.PI * 2);
  g.ellipse(43, 28, 6, 8, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#7FF0D0';
  g.lineWidth = 4;
  g.lineCap = 'round';
  g.beginPath();
  g.arc(32, 40, 9, 0.2 * Math.PI, 0.8 * Math.PI);
  g.stroke();
  return finish(key, c, false);
}

/** Top-down icon for a walk-on upgrade pad: big up-arrow + small category glyph. */
export function padIconTexture(kind: string): THREE.Texture {
  const key = `pad-${kind}`;
  if (cache.has(key)) return cache.get(key)!;
  const [c, g] = canvas(128, 128);
  g.clearRect(0, 0, 128, 128);
  // Up arrow.
  g.fillStyle = '#FFFFFF';
  g.beginPath();
  g.moveTo(52, 20);
  g.lineTo(84, 56);
  g.lineTo(64, 56);
  g.lineTo(64, 90);
  g.lineTo(40, 90);
  g.lineTo(40, 56);
  g.lineTo(20, 56);
  g.closePath();
  g.fill();
  // Category glyph in the lower-right.
  g.save();
  g.translate(88, 90);
  if (kind === 'blade') {
    g.fillStyle = PALETTE.coral;
    g.beginPath();
    g.roundRect(-22, -2, 44, 16, 6);
    g.fill();
    g.fillStyle = '#FFE9EC';
    g.fillRect(-20, -2, 40, 5);
    g.fillStyle = PALETTE.plum;
    g.beginPath();
    g.roundRect(-4, -24, 8, 24, 4);
    g.fill();
  } else if (kind === 'cart') {
    g.fillStyle = PALETTE.teal;
    g.beginPath();
    g.roundRect(-24, -14, 42, 20, 7);
    g.fill();
    g.fillStyle = PALETTE.plum;
    g.beginPath();
    g.arc(-12, 10, 7, 0, Math.PI * 2);
    g.arc(10, 10, 7, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = PALETTE.strawberry;
    g.fillRect(18, -8, 8, 10);
  } else {
    g.fillStyle = PALETTE.teal;
    g.beginPath();
    g.roundRect(-24, -8, 48, 26, 8);
    g.fill();
    g.fillStyle = PALETTE.strawberry;
    g.beginPath();
    g.moveTo(-20, -8);
    g.lineTo(-24, -26);
    g.lineTo(-2, -26);
    g.lineTo(-6, -8);
    g.closePath();
    g.fill();
    g.fillStyle = PALETTE.lemon;
    g.beginPath();
    g.arc(14, -18, 8, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
  return finish(key, c, false);
}

export function badgeTexture(): THREE.Texture {
  const key = 'badge';
  if (cache.has(key)) return cache.get(key)!;
  const [c, g] = canvas(64, 64);
  g.fillStyle = '#E8384F';
  g.beginPath();
  g.arc(32, 32, 28, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#FFFFFF';
  g.lineWidth = 5;
  g.stroke();
  g.fillStyle = '#FFFFFF';
  g.font = '800 40px Fredoka, system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('!', 32, 35);
  return finish(key, c, false);
}
