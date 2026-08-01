import type { Category } from "./types";

/**
 * A URL-safe anchor id for a menu category.
 *
 * Deterministic, so the id the server renders onto a section and the id the
 * client's scroll-spy queries for are the same string. Kept free of any
 * database import so the guest's client bundle can use it.
 */
export function categoryAnchor(category: Pick<Category, "id" | "name">): string {
  const slug = category.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  // Falls back to the id for a category named entirely in a non-Latin script,
  // which would otherwise slug down to an empty string.
  return `cat-${slug || category.id}`;
}
