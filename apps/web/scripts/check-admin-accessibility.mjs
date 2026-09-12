import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const modal = readFileSync(new URL("../src/components/ui/Modal.tsx", import.meta.url), "utf8");
const layout = readFileSync(new URL("../src/app/admin/(panel)/layout.tsx", import.meta.url), "utf8");
const preferences = readFileSync(new URL("../src/components/features/admin/accessibility/AdminAccessibilityPreferences.tsx", import.meta.url), "utf8");
for (const token of ["aria-modal", "aria-labelledby", "aria-describedby", "focusableSelector", "previousFocusRef", "useEffectEvent", "e.key !== 'Tab'"]) assert.ok(modal.includes(token), `Modal erişilebilirlik koruması eksik: ${token}`);
assert.ok(layout.includes("adminCopy.product.tenants"));
assert.ok(layout.includes("AdminAccessibilityPreferences"));
for (const token of ["aria-live", "aria-expanded", "highContrast", "reduceMotion", "density", "clearPreferences"]) assert.ok(preferences.includes(token), `Tercih kontrolü eksik: ${token}`);
console.log("Admin accessibility static checks: OK (dialog focus, terminology, persistent controls)");
