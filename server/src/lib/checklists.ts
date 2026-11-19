/**
 * Standard checklist items per room type. A room is matched by keywords in
 * its name ("Master Bedroom" -> bedroom). Anything unmatched gets GENERIC.
 */
const GENERIC = ['Walls & paint', 'Floor', 'Ceiling', 'Doors & locks', 'Windows', 'Lights & switches', 'Fans'];

const BY_TYPE: { match: RegExp; items: string[] }[] = [
  {
    match: /kitchen/i,
    items: ['Walls & tiles', 'Floor', 'Sink & taps', 'Countertop', 'Cabinets', 'Chimney / exhaust', 'Gas pipeline', 'Lights & switches', 'Windows'],
  },
  {
    match: /bath|toilet|washroom/i,
    items: ['Walls & tiles', 'Floor', 'Taps & shower', 'Wash basin', 'Toilet / commode', 'Geyser', 'Mirror & fittings', 'Exhaust fan', 'Door & lock'],
  },
  {
    match: /bed/i,
    items: ['Walls & paint', 'Floor', 'Wardrobe', 'Doors & locks', 'Windows & grills', 'Lights & switches', 'Fan', 'AC (if any)'],
  },
  {
    match: /living|hall|drawing|dining/i,
    items: ['Walls & paint', 'Floor', 'Main door & lock', 'Windows', 'Lights & switches', 'Fans', 'TV unit / shelves'],
  },
  { match: /balcony|terrace/i, items: ['Floor', 'Railing', 'Walls', 'Lights', 'Drainage'] },
];

export function checklistFor(roomName: string): string[] {
  return BY_TYPE.find((t) => t.match.test(roomName))?.items ?? GENERIC;
}
