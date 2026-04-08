# Design System Document: Ground Promotion Reward Ecosystem

## 1. Overview & Creative North Star
**Creative North Star: "The Kinetic Authority"**

This design system is engineered to transform a standard "Ground Promotion Reward System" into a high-stakes, editorial-grade digital experience. We are moving away from the generic utility of "blue boxes" toward a system that feels like a high-end fintech dashboard—authoritative yet pulsating with the energy of a physical reward event.

The system breaks the "template" look by utilizing **intentional asymmetry** and **tonal layering**. We emphasize the momentum of promotion through oversized, sophisticated typography and overlapping visual elements that suggest a forward-moving flow. By leveraging "Organic Brutalism"—large type scales paired with soft, rounded containers—we create a space that feels both trustworthy for the Admin and exhilarating for the User.

---

## 2. Colors & Visual Soul
The color palette balances the reliability of **Action Blue** (`primary`) with the vibrant urgency of **Success Orange** (`secondary`). This is not a flat palette; it is a system of depth.

### The "No-Line" Rule
To achieve a premium editorial feel, **1px solid borders are strictly prohibited for sectioning.** Boundaries must be defined solely through background color shifts.
*   *Implementation:* Use `surface-container-low` to define a section sitting on a `surface` background. The transition of color alone is your divider.

### Surface Hierarchy & Nesting
Treat the UI as physical layers of fine paper or frosted glass.
*   **Base:** `background` (#f8f5ff)
*   **Deepest Layer:** `surface-container-lowest` (#ffffff) for primary content cards.
*   **Elevated Nesting:** An "Amount Earned" chip inside a card should use `surface-container-high` to create a "recessed" or "stacked" look without a single stroke.

### The "Glass & Gradient" Rule
For floating elements like "Reward Popups" or "Role Switchers," use **Glassmorphism**:
*   **Token:** `primary-container` at 70% opacity + 20px backdrop-blur.
*   **CTAs:** Use subtle linear gradients (e.g., `primary` to `primary-dim`) to give buttons a tactile, "clickable" soul that flat colors cannot replicate.

---

## 3. Typography: The Editorial Voice
We use a dual-font strategy to balance character with extreme readability.

*   **Display & Headlines (Plus Jakarta Sans):** These are your "vibe" setters. They are wide, geometric, and authoritative. Use `display-lg` (3.5rem) for massive reward numbers to trigger dopamine.
*   **Body & Labels (Manrope):** Chosen for its high x-height and exceptional clarity on mobile screens. Manrope ensures that even the smallest legal "Terms & Conditions" remain legible under direct sunlight during ground promotion.

**Hierarchy as Identity:**
*   **Promoter View:** Bold `headline-md` for "Total Commissions" to instill pride.
*   **User View:** `title-lg` for "Scan to Win" to ensure immediate action.

---

## 4. Elevation & Depth: Tonal Layering
Traditional shadows and borders are replaced by light-theory and layering.

*   **The Layering Principle:** Depth is achieved by stacking. A `surface-container-lowest` card placed on a `surface-container-low` background creates a natural, soft lift.
*   **Ambient Shadows:** If a card must "float" (e.g., a critical Action Sheet), use an extra-diffused shadow:
    *   *Values:* `0px 20px 40px` with 6% opacity using the `on-surface` color. This mimics natural ambient light rather than a harsh digital drop shadow.
*   **The "Ghost Border" Fallback:** If a container lacks contrast (e.g., white on white for accessibility), use the `outline-variant` at **10% opacity**. It should be felt, not seen.
*   **Glassmorphism:** Use `surface-tint` with transparency for mobile navigation bars to allow the energetic "Success Orange" of the content to bleed through as the user scrolls.

---

## 5. Components: Editorial Primitives

### Buttons (The Kinetic Drivers)
*   **Primary:** High-pill (`rounded-full`) using a gradient of `primary` to `primary-dim`. No border. White `on-primary` text in `title-sm` weight.
*   **Secondary:** `surface-container-highest` background with `primary` text. This creates a sophisticated, low-contrast alternative for "View History" actions.

### Cards (The Information Vessel)
*   **Rules:** Forbid divider lines. Use `body-sm` text in `on-surface-variant` to create a label, and `title-md` for the value. Separate segments using **Vertical White Space** (1.5rem minimum).
*   **Shape:** Use `rounded-xl` (1.5rem) for main cards to maintain a friendly, modern mobile feel.

### Input Fields (The Trust Anchor)
*   **Style:** `surface-container-low` background with a `rounded-md` corner.
*   **Focus State:** Instead of a thick border, use a 2px "Ghost Border" of `primary` at 40% opacity and a subtle `surface-tint` glow.

### Reward Chips (The Motivation)
*   **Action Chips:** Use `secondary_container` with `on_secondary_container` text. These should look like physical tokens or coins.

### Relevant Custom Components
*   **The "Commission Pulse" List:** A list where the leading element (icon) sits on a glassmorphic circle, and the trailing element (amount) uses `headline-sm` in `secondary`.
*   **Role-Based Dashboards:** The Admin uses a more structured `surface-dim` grid, while the User/Promoter experience uses wide, sweeping `surface-container` blocks.

---

## 6. Do's and Don'ts

### Do:
*   **Do** use `display-lg` for numeric rewards. The bigger the number, the higher the motivation.
*   **Do** use `rounded-full` for all status indicators (Live, Pending, Success) to maintain the "friendly" brand promise.
*   **Do** rely on the `surface` tokens to separate content. If the screen feels cluttered, change the background color of the section, don't add a line.

### Don'ts:
*   **Don't** use pure black (#000000) for text. Always use `on-surface` (#272c51) to keep the "Action Blue" DNA present in the shadows.
*   **Don't** use 1px solid borders. It breaks the "high-end" editorial illusion and makes the app look like a template.
*   **Don't** use standard "drop shadows." If it looks like a 2010 web app, the shadow is too dark and the blur is too small.
*   **Don't** crowd the edges. Respect the `xl` roundedness by providing at least 24px of internal padding (Gutter) in every card.