"use client";

/** `window.print` needs the browser, so this one control is a client island. */
export function PrintButton() {
  return (
    <button type="button" className="btn btn-primary" onClick={() => window.print()}>
      Print
    </button>
  );
}
