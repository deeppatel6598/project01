/**
 * Pilot seed data for Roast & Toast.
 *
 * The menu is the real one, pulled from the cafe's reviews. **The prices are
 * estimates** — every one of them needs the owner's confirmation before this
 * goes live on a table. The admin's menu page repeats that warning where the
 * prices are edited.
 *
 * Menu imagery ships with the repo as flat monochrome artwork in
 * `public/menu/`, drawn in the Modernist idiom rather than fetched. Two
 * reasons: the guest menu then paints completely with zero external requests
 * on cafe wifi, and a deployment cannot end up with a menu full of empty
 * frames because someone's image CDN is unreachable.
 *
 * `imageId` remains for the day the cafe supplies real photographs — set it
 * and the item renders the remote shot instead, through the same grayscale
 * treatment. See docs/DEPLOYMENT.md.
 */

export interface SeedItem {
  slug: string;
  name: string;
  /** Rupees. Converted to integer paise on insert. */
  price: number;
  description?: string;
  /**
   * Remote photograph id (Unsplash), e.g. "1513558161293-cdaf765ed2fd".
   * Wins over the category artwork when set — this is where the cafe's own
   * shots go once they have them. Left unset so a fresh install ships with
   * no external image dependency at all.
   */
  imageId?: string;
  badge?: string;
  /** Seeded sold out so the guest menu's unavailable state is visible. */
  soldOut?: boolean;
}

export interface SeedCategory {
  name: string;
  /** The bundled artwork every item in this category falls back to. */
  art: string;
  items: SeedItem[];
}

export const SEED_MENU: SeedCategory[] = [
  {
    name: "Coffee",
    art: "/menu/coffee.svg",
    items: [
      {
        slug: "cold-brew-tonic",
        name: "Cold Brew Tonic",
        price: 260,
        description: "Their signature — cold brew over tonic and ice",
        badge: "Signature",
      },
      {
        slug: "java-chip",
        name: "Java Chip Frappe",
        price: 290,
        description: "Blended, chocolate chip, whipped top",
      },
      { slug: "mocha", name: "Café Mocha (hot)", price: 230 },
      { slug: "cold-coffee", name: "Cold Coffee", price: 220 },
      { slug: "cappuccino", name: "Cappuccino", price: 200 },
      { slug: "espresso", name: "Espresso", price: 150 },
    ],
  },
  {
    name: "Cold Pressed",
    art: "/menu/cold-pressed.svg",
    items: [
      {
        slug: "ginger-orange",
        name: "Ginger Orange Juice",
        price: 190,
        description: "Pressed to order",
      },
    ],
  },
  {
    name: "Toast & Small Plates",
    art: "/menu/toast.svg",
    items: [
      {
        slug: "avocado-toast",
        name: "Avocado Toast",
        price: 320,
        description: "Sourdough, chilli flakes, lemon",
      },
      { slug: "garlic-bread", name: "Garlic Bread", price: 190 },
      {
        slug: "nachos",
        name: "Loaded Nachos",
        price: 320,
        description: "Cheese, beans, jalapeño",
        soldOut: true,
      },
    ],
  },
  {
    name: 'Pizza — 12"',
    art: "/menu/pizza.svg",
    items: [
      {
        slug: "farm-house",
        name: "Farm House Pizza",
        price: 450,
        description: "Capsicum, onion, corn, mushroom",
        badge: "Most ordered",
      },
      { slug: "margherita", name: "Margherita", price: 380 },
    ],
  },
  {
    name: "Pasta",
    art: "/menu/pasta.svg",
    items: [
      {
        slug: "ravioli",
        name: "Ravioli in Pink Sauce",
        price: 420,
      },
      {
        slug: "spaghetti",
        name: "Butter Garlic Spaghetti",
        price: 360,
      },
    ],
  },
  {
    name: "Desserts",
    art: "/menu/dessert.svg",
    items: [
      {
        slug: "cheesecake",
        name: "New York Cheesecake",
        price: 280,
        badge: "Made in house",
      },
      {
        slug: "brownie",
        name: "Chocolate Brownie",
        price: 240,
        description: "Served warm",
      },
    ],
  },
];

export const SEED_TABLES = [
  "Table 01",
  "Table 02",
  "Table 03",
  "Table 04",
  "Table 05",
  "Table 06",
  "Table 07",
  "Table 08",
  "Table 09",
  "Table 10",
  "Terrace 1",
  "Terrace 2",
];

export const SEED_RESTAURANT = {
  name: "Roast & Toast",
  slug: "roast-and-toast",
  address:
    "Shop 3–4, Ground Floor, Synergy Space, Sarkhej–Gandhinagar Hwy, Sargasan, Gandhinagar, Gujarat 382419",
  phone: "",
  hoursLabel: "11:00–23:00",
  heroArt: "/menu/hero.svg",
  /** Set to use a real photograph of the room instead of the drawn hero. */
  heroImageId: "",
};

/** Build an Unsplash URL at a given width. */
export function unsplashUrl(id: string, width: number): string {
  return `https://images.unsplash.com/photo-${id}?w=${width}&q=75&auto=format&fit=crop`;
}
