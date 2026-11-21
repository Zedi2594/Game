// Tadpole colour choices. Frogspawn buys them in the frog shop. The index is what the server stores per player.
export const SKINS = [
  { name: 'Pond Green', color: '#7ee081', price: 0 },
  { name: 'Lagoon Teal', color: '#3fd0c9', price: 5 },
  { name: 'Sky Blue', color: '#5aa8ff', price: 10 },
  { name: 'Bubblegum', color: '#ff8fc7', price: 15 },
  { name: 'Sunset Orange', color: '#ffa23d', price: 20 },
  { name: 'Royal Purple', color: '#a57bff', price: 25 },
  { name: 'Golden', color: '#ffd84a', price: 40 },
  { name: 'Midnight', color: '#3b4a8c', price: 50 },
];
export const SKIN_COUNT = SKINS.length;
export function skinColor(i) {
  return SKINS[i]?.color ?? SKINS[0].color;
}
