import { copy } from "@/lib/copy";
import { getRestaurant } from "@/lib/menu";

import { AcceptingSwitch } from "../accepting-switch";
import { SettingsForm } from "./settings-form";

export const dynamic = "force-dynamic";

/** `/admin/settings` — cafe details and the accepting-orders kill switch. */
export default async function AdminSettingsPage() {
  const restaurant = getRestaurant();

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1
        className="m-0"
        style={{
          fontFamily: "var(--font-heading)",
          fontWeight: 900,
          fontSize: 34,
          letterSpacing: "-0.03em",
          textTransform: "uppercase",
        }}
      >
        {copy.admin.nav.settings}
      </h1>

      <section className="p-4" style={{ border: "2px solid var(--color-text)" }}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2
              className="m-0"
              style={{
                fontFamily: "var(--font-heading)",
                fontWeight: 900,
                fontSize: 16,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
              }}
            >
              {copy.admin.acceptingOrders}
            </h2>
            <p
              className="m-0 mt-2"
              style={{ fontSize: 13, color: "var(--color-neutral-700)", textWrap: "pretty" }}
            >
              {copy.admin.acceptingOrdersHelp}
            </p>
          </div>
          <AcceptingSwitch accepting={restaurant.isAcceptingOrders} />
        </div>
      </section>

      <SettingsForm restaurant={restaurant} />
    </div>
  );
}
