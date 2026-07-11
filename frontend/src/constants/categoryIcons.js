// Curated icon set for category creation/editing. Mostly Bootstrap Icons
// (already bundled); a handful of Font Awesome solid icons fill gaps
// Bootstrap Icons doesn't have (pets, kids, fitness, clothing).
export const ICON_OPTIONS = [
  { value: 'bi-basket2', label: 'Groceries' },
  { value: 'bi-cup-hot', label: 'Dining' },
  { value: 'bi-fuel-pump', label: 'Gasoline' },
  { value: 'bi-car-front', label: 'Car' },
  { value: 'bi-bus-front', label: 'Commute' },
  { value: 'bi-bicycle', label: 'Bike' },
  { value: 'bi-house', label: 'Housing' },
  { value: 'bi-lightning-charge', label: 'Utilities' },
  { value: 'bi-wifi', label: 'Internet' },
  { value: 'bi-phone', label: 'Phone' },
  { value: 'bi-shield-check', label: 'Insurance' },
  { value: 'bi-heart-pulse', label: 'Health' },
  { value: 'fa-solid fa-tooth', label: 'Dentist' },
  { value: 'fa-solid fa-dumbbell', label: 'Fitness' },
  { value: 'fa-solid fa-child', label: 'Kids' },
  { value: 'fa-solid fa-baby', label: 'Baby' },
  { value: 'fa-solid fa-paw', label: 'Pets' },
  { value: 'bi-controller', label: 'Fun' },
  { value: 'bi-film', label: 'Entertainment' },
  { value: 'bi-music-note-beamed', label: 'Music' },
  { value: 'bi-airplane', label: 'Travel' },
  { value: 'bi-suitcase2', label: 'Vacations' },
  { value: 'bi-bag', label: 'Shopping' },
  { value: 'fa-solid fa-shirt', label: 'Clothing' },
  { value: 'bi-laptop', label: 'Electronics' },
  { value: 'bi-gift', label: 'Gifts' },
  { value: 'bi-mortarboard', label: 'Education' },
  { value: 'bi-book', label: 'Books' },
  { value: 'bi-droplet', label: 'Personal care' },
  { value: 'bi-piggy-bank', label: 'Savings' },
  { value: 'bi-graph-up-arrow', label: 'Investments' },
  { value: 'bi-sunset', label: 'Retirement' },
  { value: 'bi-cash-stack', label: 'Salary' },
  { value: 'bi-arrow-left-right', label: 'Transfer' },
  { value: 'bi-credit-card', label: 'Card payment' },
  { value: 'bi-file-earmark-text', label: 'Taxes' },
  { value: 'bi-heart-fill', label: 'Charity' },
  { value: 'bi-tools', label: 'Repairs' },
];

export const DEFAULT_ICON = 'bi-dot';

// Bootstrap Icons need the `bi` base class; Font Awesome icons already
// carry their own `fa-solid` family class as part of the stored value.
export function iconClassName(icon) {
  const value = icon || DEFAULT_ICON;
  return value.startsWith('fa-') || value.startsWith('fa ') ? value : `bi ${value}`;
}
