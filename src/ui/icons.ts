import { CONTRACTS, PALETTE, type UpgradeId } from '../game/config';

// Inline SVG icons (no icon fonts, no network).

export const ICON = {
  coin: `<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="13" fill="#FFD260" stroke="#E0A93A" stroke-width="3"/><circle cx="16" cy="16" r="7.5" fill="none" stroke="#FFF1B8" stroke-width="2.5"/><path d="M12.5 11.5c2-2 5-2 7 0" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`,
  blade: `<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="5" y="15" width="22" height="9" rx="3.5" fill="#FF7F7A"/><rect x="5" y="15" width="22" height="3" rx="1.5" fill="#FFE9EC"/><rect x="14.5" y="4" width="3" height="12" rx="1.5" fill="#47364F"/></svg>`,
  chest: `<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="4" y="13" width="24" height="14" rx="3" fill="#E0A93A"/><path d="M4 16c0-6 5-10 12-10s12 4 12 10Z" fill="#FFD260"/><rect x="14" y="14" width="4" height="6" rx="1" fill="#47364F"/><path d="M4 18h24" stroke="#B9822A" stroke-width="2"/></svg>`,
  gear: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8Zm8.2 4.6.02-1.2-.02-1.2 2.05-1.6a.6.6 0 0 0 .14-.77l-1.94-3.36a.6.6 0 0 0-.73-.26l-2.42.97a7.8 7.8 0 0 0-2.07-1.2L14.9 2.1a.6.6 0 0 0-.6-.5h-3.88a.6.6 0 0 0-.6.5l-.36 2.57c-.75.3-1.44.7-2.07 1.2l-2.42-.97a.6.6 0 0 0-.73.26L2.3 8.52a.6.6 0 0 0 .14.77L4.5 10.9l-.03 1.2.03 1.2-2.06 1.6a.6.6 0 0 0-.14.77l1.94 3.36c.15.26.46.37.73.26l2.42-.97c.63.5 1.32.9 2.07 1.2l.36 2.57c.05.29.3.5.6.5h3.88c.3 0 .55-.21.6-.5l.36-2.57c.75-.3 1.44-.7 2.07-1.2l2.42.97c.27.11.58 0 .73-.26l1.94-3.36a.6.6 0 0 0-.14-.77l-2.06-1.6Z"/></svg>`,
  up: `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 5 6 16h6v10h8V16h6L16 5Z" fill="currentColor"/><path d="M25 4l1 2.2 2.2 1-2.2 1L25 10.5l-1-2.3-2.2-1 2.2-1L25 4Z" fill="#FFD260"/></svg>`,
  cart: `<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="5" y="11" width="18" height="10" rx="4" fill="currentColor"/><rect x="16" y="6" width="9" height="7" rx="2" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="10" cy="23.5" r="3.5" fill="currentColor"/><circle cx="21" cy="23.5" r="3.5" fill="currentColor"/><rect x="24" y="15" width="4" height="6" rx="2" fill="currentColor"/></svg>`,
  close: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`,
  robot: `<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="7" y="10" width="18" height="14" rx="5" fill="currentColor"/><circle cx="12.5" cy="17" r="2" fill="#fff"/><circle cx="19.5" cy="17" r="2" fill="#fff"/><path d="M16 10V6" stroke="currentColor" stroke-width="2.4"/><circle cx="16" cy="5" r="2.4" fill="#FFD260"/></svg>`,
  pause: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1.5" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1.5" fill="currentColor"/></svg>`,
  lock: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="3" fill="currentColor"/><path d="M8 10V8a4 4 0 0 1 8 0v2" fill="none" stroke="currentColor" stroke-width="2.4"/></svg>`,
  scraper: `<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="6" y="18" width="20" height="7" rx="3" fill="#FF7F7A"/><rect x="14.5" y="5" width="3" height="14" rx="1.5" fill="#47364F"/></svg>`,
  bin: `<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="6" y="9" width="20" height="16" rx="3" fill="#BDE8F2" stroke="#3CA5AD" stroke-width="2.5"/><circle cx="12" cy="18" r="3.4" fill="#F46F8F"/><circle cx="20" cy="18" r="3.4" fill="#FFD260"/><circle cx="16" cy="13" r="3" fill="#73D4B2"/></svg>`,
  machine: `<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="5" y="12" width="22" height="14" rx="5" fill="#3CA5AD"/><path d="M9 12 7 5h10l-2 7" fill="#F46F8F"/><circle cx="22" cy="7" r="4" fill="#FFD260"/><rect x="21.2" y="10" width="1.6" height="3" fill="#47364F"/></svg>`,
  intake: `<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="5" y="12" width="22" height="9" rx="4.5" fill="#F46F8F"/><path d="M9 12l3 9M15 12l3 9M21 12l3 9" stroke="#FFF4E0" stroke-width="2.4"/><path d="M4 26h24" stroke="#3CA5AD" stroke-width="3" stroke-linecap="round"/></svg>`,
  speed: `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 22a11 11 0 0 1 22 0" fill="none" stroke="#3CA5AD" stroke-width="4" stroke-linecap="round"/><path d="M16 22l6-8" stroke="#FF7F7A" stroke-width="3" stroke-linecap="round"/><circle cx="16" cy="22" r="2.6" fill="#47364F"/></svg>`,
  helper: `<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="8" y="9" width="16" height="12" rx="5" fill="#FFB3C4"/><rect x="11" y="12" width="10" height="6" rx="2" fill="#3B2F45"/><circle cx="14" cy="15" r="1.3" fill="#7FF0D0"/><circle cx="18" cy="15" r="1.3" fill="#7FF0D0"/><rect x="11" y="21" width="10" height="6" rx="3" fill="#FFFBF1"/><circle cx="16" cy="6" r="2.4" fill="#FFD260"/></svg>`,
  autopilot: `<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="4" y="13" width="18" height="9" rx="4" fill="#3CA5AD"/><circle cx="9" cy="23" r="3" fill="#47364F"/><circle cx="18" cy="23" r="3" fill="#47364F"/><path d="M22 10a6 6 0 0 1 6 6" fill="none" stroke="#73D4B2" stroke-width="2.4" stroke-linecap="round"/><circle cx="21" cy="10" r="2.4" fill="#73D4B2"/></svg>`,
};

export const UPGRADE_ICON: Record<UpgradeId, string> = {
  scraper: ICON.scraper,
  precision: `<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="11" fill="none" stroke="#3CA5AD" stroke-width="3"/><circle cx="16" cy="16" r="4" fill="#FF7F7A"/><path d="M16 2v7M16 23v7M2 16h7M23 16h7" stroke="#47364F" stroke-width="2.6" stroke-linecap="round"/></svg>`,
  durability: `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3 27 7v8c0 7-5 12-11 14C10 27 5 22 5 15V7l11-4Z" fill="#73D4B2" stroke="#2A7F87" stroke-width="2"/><rect x="10" y="14" width="12" height="5" rx="2" fill="#FF7F7A"/></svg>`,
  bladeCap: `<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="4" y="16" width="16" height="6" rx="2.5" fill="#FF7F7A"/><rect x="9" y="10" width="16" height="6" rx="2.5" fill="#FFB3A8"/><rect x="14" y="4" width="14" height="6" rx="2.5" fill="#FFD9D4"/><path d="M12 22v6M17 16v6M22 10v6" stroke="#47364F" stroke-width="2.4" stroke-linecap="round"/></svg>`,
  capacity: ICON.bin,
  machine: ICON.machine,
  intake: ICON.intake,
  cartSpeed: ICON.speed,
  autopilot: ICON.autopilot,
  helper: ICON.helper,
};

/** Product icon for a contract, drawn to match its 3D shape. */
export function productIcon(defId: number, size = 40): string {
  const d = CONTRACTS[defId];
  if (d.productShape === 'swirl') {
    return `<svg viewBox="0 0 40 40" width="${size}" height="${size}" aria-hidden="true"><rect x="18.5" y="22" width="3" height="16" rx="1.5" fill="#FFFDF6" stroke="${PALETTE.plum}" stroke-opacity=".25"/><circle cx="20" cy="16" r="13" fill="${d.primary}"/><path d="M20 16m0 0a3 3 0 0 1 5 1 6 6 0 0 1-8 5 9 9 0 0 1-5-10 11 11 0 0 1 14-7" fill="none" stroke="${d.secondary}" stroke-width="3.2" stroke-linecap="round"/><circle cx="14" cy="10" r="2.4" fill="#fff" opacity=".6"/></svg>`;
  }
  if (d.productShape === 'twist') {
    return `<svg viewBox="0 0 40 40" width="${size}" height="${size}" aria-hidden="true"><path d="M3 12l9 8-9 8Z" fill="${d.accent}"/><path d="M37 12l-9 8 9 8Z" fill="${d.accent}"/><ellipse cx="20" cy="20" rx="11" ry="9" fill="${d.primary}"/><path d="M12 14l6 12M18 12l6 14M24 12l4 9" stroke="${d.secondary}" stroke-width="3" stroke-linecap="round"/><circle cx="15" cy="15" r="2" fill="#fff" opacity=".6"/></svg>`;
  }
  return `<svg viewBox="0 0 40 40" width="${size}" height="${size}" aria-hidden="true"><rect x="18.5" y="24" width="3" height="14" rx="1.5" fill="#FFFDF6" stroke="${PALETTE.plum}" stroke-opacity=".25"/><path d="M20 30C8 22 5 16 8 10.5 11 5.5 17 6.5 20 11c3-4.5 9-5.5 12-.5 3 5.5 0 11.5-12 19.5Z" fill="${d.primary}"/><circle cx="16" cy="14" r="3" fill="${d.secondary}"/><circle cx="24.5" cy="17" r="2" fill="${d.accent}"/><circle cx="13" cy="11" r="1.8" fill="#fff" opacity=".6"/></svg>`;
}
