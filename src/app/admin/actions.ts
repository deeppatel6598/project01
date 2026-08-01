"use server";

import { revalidatePath } from "next/cache";

import { requireOwner } from "@/lib/auth";
import { getRestaurant, setItemAvailability, updateMenuItem, updateRestaurant } from "@/lib/menu";
import { parseRupeeInput } from "@/lib/money";
import { createTable, rotateTableCode, updateTable } from "@/lib/tables";

/**
 * Admin writes.
 *
 * Every one of these starts with `requireOwner()`. Server actions are POST
 * endpoints with generated ids — they are reachable by anyone who can read
 * the page source, so the layout's redirect is a convenience for humans and
 * this line is the actual control.
 */

export async function toggleItemAvailability(itemId: string, isAvailable: boolean): Promise<void> {
  await requireOwner();
  setItemAvailability(itemId, isAvailable);
  // The guest menu is rendered per-request but revalidating keeps any cached
  // segment honest, which is what "disappears within one refresh" needs.
  revalidatePath("/admin/menu");
  revalidatePath("/t/[code]", "page");
}

export interface FieldState {
  error: string | null;
  ok: boolean;
}

export async function saveItemPrice(_previous: FieldState, formData: FormData): Promise<FieldState> {
  await requireOwner();

  const itemId = String(formData.get("itemId") ?? "");
  const raw = String(formData.get("price") ?? "");
  const price = parseRupeeInput(raw);

  if (!itemId || price === null) {
    return { error: "Enter a price like 260 or 260.50.", ok: false };
  }

  updateMenuItem(itemId, { price });
  revalidatePath("/admin/menu");
  revalidatePath("/t/[code]", "page");
  return { error: null, ok: true };
}

export async function addTable(_previous: FieldState, formData: FormData): Promise<FieldState> {
  await requireOwner();

  const label = String(formData.get("label") ?? "").trim();
  if (!label) return { error: "Give the table a label, like “Table 13”.", ok: false };

  const seatsRaw = String(formData.get("seats") ?? "").trim();
  const seats = seatsRaw === "" ? null : Number.parseInt(seatsRaw, 10);

  const restaurant = getRestaurant();
  createTable(restaurant.id, label, Number.isFinite(seats) ? seats : null);

  revalidatePath("/admin/tables");
  return { error: null, ok: true };
}

export async function setTableActive(tableId: string, isActive: boolean): Promise<void> {
  await requireOwner();
  updateTable(tableId, { isActive });
  revalidatePath("/admin/tables");
}

/**
 * Issue a new code for a table.
 *
 * The reason this exists: a sticker gets photographed and posted, or moved to
 * a different table. Rotating the code dead-ends the old URL immediately —
 * but it also invalidates the printed sticker, so the UI says so before it
 * happens.
 */
export async function rotateCode(tableId: string): Promise<void> {
  await requireOwner();
  rotateTableCode(tableId);
  revalidatePath("/admin/tables");
}

export async function setAcceptingOrders(isAccepting: boolean): Promise<void> {
  await requireOwner();
  const restaurant = getRestaurant();
  updateRestaurant(restaurant.id, { isAcceptingOrders: isAccepting });
  revalidatePath("/admin");
  revalidatePath("/admin/settings");
  revalidatePath("/t/[code]", "page");
}

export async function saveSettings(_previous: FieldState, formData: FormData): Promise<FieldState> {
  await requireOwner();

  const restaurant = getRestaurant();
  const name = String(formData.get("name") ?? "").trim();

  if (!name) return { error: "The cafe needs a name.", ok: false };

  updateRestaurant(restaurant.id, {
    name,
    address: String(formData.get("address") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
    hoursLabel: String(formData.get("hoursLabel") ?? "").trim() || "11:00–23:00",
  });

  revalidatePath("/admin/settings");
  revalidatePath("/t/[code]", "page");
  return { error: null, ok: true };
}
