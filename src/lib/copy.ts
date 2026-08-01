/**
 * Every user-facing string in the product, in one place.
 *
 * Hindi and Gujarati are a v2 item. Keeping the strings here means that ships
 * as a swap, not a hunt through JSX. Nothing outside this file should contain
 * a sentence a guest or a staff member will read.
 */

export const copy = {
  brand: {
    product: "Tablekit",
    tagline: "QR table ordering",
  },

  guest: {
    scanStrip: "Scan · Order · Sit tight",
    menuTitle: ["All day", "menu"],
    myOrders: "My orders",
    payAtCounter: "Pay at the counter · 11:00–23:00",
    payAtCounterShort: "Pay at the counter when you leave",
    reviewOrder: "Review order",
    yourOrder: "Your order",
    total: "Total",
    nameLabel: "Your name",
    namePlaceholder: "So we know whose table",
    noteLabel: "Note for the kitchen",
    notePlaceholder: "Less spicy, no onion…",
    placeOrder: (amount: string) => `Place order · ${amount}`,
    kitchenPaused: "Kitchen is paused",
    placing: "Sending to the kitchen…",
    add: "Add",
    soldOut: "Sold out",
    ordersTitle: "Your orders",
    nothingOrdered: "Nothing ordered yet",
    backToMenu: "Back to the menu",
    orderSomethingElse: "Order something else",
    trackOrder: "Track this order",
    placedTitle: ["Order", "placed"],
    placedSub: "It's on the pass. Same docket the kitchen sees.",
    sentToKitchen: "Sent to kitchen",
    editableUntil: "Editable until the kitchen starts",
    lockedPreparing: "The kitchen has started this one — it can't be changed now.",
    lockedServed: "Served. Hope it was good.",
    placedAt: (clock: string) => `Placed ${clock}`,
    itemCount: (n: number) => `${n} ${n === 1 ? "item" : "items"}`,
    categoryCount: (n: number) => `${n} ${n === 1 ? "item" : "items"}`,
    open: (hours: string) => `Open · ${hours}`,
    closed: "Kitchen paused",
    stages: ["Ordered", "Preparing", "Served"] as const,
    veg: "Veg",
    nonVeg: "Non-veg",
  },

  kitchen: {
    kicker: "Staff — /kitchen",
    title: "The pass",
    columns: {
      new: "New",
      preparing: "Preparing",
      served: "Served",
    },
    empty: {
      new: "Nothing waiting",
      preparing: "Nothing on the pass",
      served: "Cleared",
    },
    start: "Start",
    markServed: "Mark served",
    served: "Served",
    cancel: "Cancel order",
    confirmCancel: (code: string) => `Cancel ${code}? The guest is not told — walk over and say so.`,
    total: "Total",
    soundOn: "Turn on sound",
    soundOff: "Sound on",
    signOut: "Sign out",
  },

  connection: {
    live: "Realtime · live",
    polling: "Polling · 20s",
    offline: "Offline",
  },

  admin: {
    title: "Admin",
    today: "Today at a glance",
    nav: {
      overview: "Overview",
      menu: "Menu",
      tables: "Tables",
      orders: "Orders",
      settings: "Settings",
    },
    signOut: "Sign out",
    save: "Save",
    saving: "Saving…",
    saved: "Saved",
    add: "Add",
    remove: "Remove",
    available: "Available",
    soldOut: "Sold out",
    printSheet: "Print QR sheet",
    downloadPng: "Download PNG",
    exportCsv: "Export CSV",
    acceptingOrders: "Accepting orders",
    acceptingOrdersHelp:
      "The kill switch. Turn this off when the kitchen is slammed — the menu stays readable but nobody can place an order.",
    priceHelp: "Seed prices are estimates pulled from reviews. Confirm each one before launch.",
  },

  errors: {
    tableNotLinked: "This QR isn't linked to a table yet. Show it to the counter.",
    tableNotLinkedTitle: "Not linked",
    notAccepting: "The kitchen has paused orders for a moment. Ask at the counter.",
    emptyBasket: "Nothing in the basket yet.",
    tooManyLines: "That's more than one order can hold — split it into two.",
    itemUnavailable: (name: string) => `${name} just sold out. Take it out and try again.`,
    rateLimited: "That's a lot of orders very fast. Give it a minute.",
    orderLocked: "The kitchen has already started this order.",
    generic: "That didn't go through. Try again.",
    signInFailed: "That email and password don't match.",
    notFound: "Not found.",
    forbidden: "You don't have access to that.",
  },
} as const;
