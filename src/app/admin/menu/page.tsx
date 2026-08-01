import { copy } from "@/lib/copy";
import { getFullMenu, getRestaurant } from "@/lib/menu";

import { MenuRow } from "./menu-row";

export const dynamic = "force-dynamic";

/** `/admin/menu` — availability toggles and prices. */
export default async function AdminMenuPage() {
  const restaurant = getRestaurant();
  const sections = getFullMenu(restaurant.id);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1
          className="m-0"
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: 34,
            
          }}
        >
          {copy.admin.nav.menu}
        </h1>
        <p
          className="label label-tight mt-2 mb-0"
          style={{ color: "var(--color-accent-700)" }}
        >
          {copy.admin.priceHelp}
        </p>
      </div>

      {sections.map((section) => (
        <section key={section.category.id}>
          <h2
            className="m-0"
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 16,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
            }}
          >
            {section.category.name}
          </h2>

          <div className="hr" />

          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th style={{ width: 160 }}>Price (₹)</th>
                  <th style={{ width: 160 }}>Availability</th>
                </tr>
              </thead>
              <tbody>
                {section.items.map((item) => (
                  <MenuRow key={item.id} item={item} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
