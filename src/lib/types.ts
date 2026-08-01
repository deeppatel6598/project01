import type { Paise } from "./money";

/**
 * The domain types. These mirror the database columns exactly, in camelCase —
 * the row mappers in `db/rows.ts` are the only place the two spellings meet.
 */

export type OrderStatus = "new" | "preparing" | "served" | "cancelled";

/** Statuses a docket can be moved *to*, in order. `cancelled` is not a stage. */
export const ORDER_STAGES = ["new", "preparing", "served"] as const;
export type OrderStage = (typeof ORDER_STAGES)[number];

export type StaffRole = "owner" | "staff";

export interface Restaurant {
  id: string;
  name: string;
  slug: string;
  address: string;
  phone: string;
  currency: string;
  logoUrl: string | null;
  heroImageUrl: string | null;
  hoursLabel: string;
  isAcceptingOrders: boolean;
}

export interface DiningTable {
  id: string;
  restaurantId: string;
  label: string;
  code: string;
  seats: number | null;
  isActive: boolean;
}

export interface Category {
  id: string;
  restaurantId: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

export interface MenuItem {
  id: string;
  restaurantId: string;
  categoryId: string;
  name: string;
  description: string | null;
  /** Integer paise. Never a float — see `lib/money.ts`. */
  price: Paise;
  imageUrl: string | null;
  badge: string | null;
  isVeg: boolean;
  isAvailable: boolean;
  sortOrder: number;
}

/** A category with its items, as the guest menu renders it. */
export interface MenuSection {
  category: Category;
  items: MenuItem[];
}

export interface OrderLine {
  id: string;
  orderId: string;
  menuItemId: string;
  /**
   * Snapshots, not joins. If the owner raises the cappuccino price on
   * Tuesday, last week's docket must still show what the guest actually
   * agreed to pay. Never resolve an old order through `menu_items`.
   */
  nameSnapshot: string;
  priceSnapshot: Paise;
  imageUrlSnapshot: string | null;
  qty: number;
  lineTotal: Paise;
}

export interface Order {
  id: string;
  restaurantId: string;
  tableId: string;
  tableLabel: string;
  orderCode: string;
  guestName: string;
  guestPhone: string | null;
  note: string | null;
  status: OrderStatus;
  subtotal: Paise;
  total: Paise;
  placedAt: number;
  acceptedAt: number | null;
  servedAt: number | null;
  lines: OrderLine[];
}

/**
 * What a guest is allowed to learn about their own order. Deliberately
 * narrower than `Order`: no other table's name, no phone number, no internal
 * ids beyond the one they already hold a token for.
 */
export interface GuestOrderView {
  id: string;
  /**
   * The token that unlocked this order, echoed back.
   *
   * Safe to return: the client just presented it, so this tells them nothing
   * they did not already know. It saves them tracking which of their tokens
   * maps to which order, which is the kind of bookkeeping that goes wrong
   * quietly.
   */
  token: string;
  orderCode: string;
  tableLabel: string;
  status: OrderStatus;
  note: string | null;
  total: Paise;
  placedAt: number;
  lines: Array<{
    menuItemId: string;
    name: string;
    qty: number;
    price: Paise;
    lineTotal: Paise;
    imageUrl: string | null;
  }>;
}

export interface StaffMember {
  id: string;
  restaurantId: string;
  email: string;
  role: StaffRole;
}

/** The guest's basket, before it becomes an order. */
export type Cart = Record<string, number>;

export interface CartRequestLine {
  menuItemId: string;
  qty: number;
}
