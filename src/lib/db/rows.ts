import type {
  Category,
  DiningTable,
  MenuItem,
  Order,
  OrderLine,
  OrderStatus,
  Restaurant,
  StaffMember,
  StaffRole,
} from "../types";

/**
 * The only place snake_case database columns and camelCase domain objects
 * meet. Everything above this file speaks the domain types; everything below
 * it speaks SQL.
 *
 * SQLite has no boolean type, so `0`/`1` integers are converted here rather
 * than leaking truthiness bugs into the UI — `is_available = 0` is falsy by
 * accident, but `isAvailable === false` is falsy on purpose.
 */

const bool = (value: number): boolean => value === 1;
export const toInt = (value: boolean): 0 | 1 => (value ? 1 : 0);

export interface RestaurantRow {
  id: string;
  name: string;
  slug: string;
  address: string;
  phone: string;
  currency: string;
  logo_url: string | null;
  hero_image_url: string | null;
  hours_label: string;
  is_accepting_orders: number;
}

export function toRestaurant(row: RestaurantRow): Restaurant {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    address: row.address,
    phone: row.phone,
    currency: row.currency,
    logoUrl: row.logo_url,
    heroImageUrl: row.hero_image_url,
    hoursLabel: row.hours_label,
    isAcceptingOrders: bool(row.is_accepting_orders),
  };
}

export interface DiningTableRow {
  id: string;
  restaurant_id: string;
  label: string;
  code: string;
  seats: number | null;
  is_active: number;
}

export function toDiningTable(row: DiningTableRow): DiningTable {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    label: row.label,
    code: row.code,
    seats: row.seats,
    isActive: bool(row.is_active),
  };
}

export interface CategoryRow {
  id: string;
  restaurant_id: string;
  name: string;
  sort_order: number;
  is_active: number;
}

export function toCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    name: row.name,
    sortOrder: row.sort_order,
    isActive: bool(row.is_active),
  };
}

export interface MenuItemRow {
  id: string;
  restaurant_id: string;
  category_id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  badge: string | null;
  is_veg: number;
  is_available: number;
  sort_order: number;
}

export function toMenuItem(row: MenuItemRow): MenuItem {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    categoryId: row.category_id,
    name: row.name,
    description: row.description,
    price: row.price,
    imageUrl: row.image_url,
    badge: row.badge,
    isVeg: bool(row.is_veg),
    isAvailable: bool(row.is_available),
    sortOrder: row.sort_order,
  };
}

export interface OrderRow {
  id: string;
  restaurant_id: string;
  table_id: string;
  table_label: string;
  order_code: string;
  guest_name: string;
  guest_phone: string | null;
  note: string | null;
  status: OrderStatus;
  subtotal: number;
  total: number;
  public_token: string;
  placed_at: number;
  accepted_at: number | null;
  served_at: number | null;
}

export interface OrderItemRow {
  id: string;
  order_id: string;
  menu_item_id: string;
  name_snapshot: string;
  price_snapshot: number;
  image_url_snapshot: string | null;
  qty: number;
  line_total: number;
}

export function toOrderLine(row: OrderItemRow): OrderLine {
  return {
    id: row.id,
    orderId: row.order_id,
    menuItemId: row.menu_item_id,
    nameSnapshot: row.name_snapshot,
    priceSnapshot: row.price_snapshot,
    imageUrlSnapshot: row.image_url_snapshot,
    qty: row.qty,
    lineTotal: row.line_total,
  };
}

export function toOrder(row: OrderRow, lines: OrderItemRow[]): Order {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    tableId: row.table_id,
    tableLabel: row.table_label,
    orderCode: row.order_code,
    guestName: row.guest_name,
    guestPhone: row.guest_phone,
    note: row.note,
    status: row.status,
    subtotal: row.subtotal,
    total: row.total,
    placedAt: row.placed_at,
    acceptedAt: row.accepted_at,
    servedAt: row.served_at,
    lines: lines.map(toOrderLine),
  };
}

export interface StaffMemberRow {
  id: string;
  restaurant_id: string;
  email: string;
  password_hash: string;
  role: StaffRole;
}

export function toStaffMember(row: StaffMemberRow): StaffMember {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    email: row.email,
    role: row.role,
  };
}
