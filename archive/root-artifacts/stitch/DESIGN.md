# Design System Document

## 1. Overview & Creative North Star
### The Digital Curator
This design system is built upon the concept of **"The Digital Curator."** It rejects the cold, clinical nature of standard data-heavy applications in favor of a warm, editorialized, and anime-inspired aesthetic. The goal is to make cataloging and tier-list creation feel like flipping through a high-end art book or a premium fan magazine.

The system breaks the "template" look through **Intentional Asymmetry** and **Tonal Depth**. By utilizing a warm cream canvas and soft red accents, we create a playground that is both playful and sophisticated. Layouts should prioritize breathing room and "floating" elements, ensuring that even dense catalogs feel light, inviting, and human.

---

## 2. Colors
Our palette is rooted in a warm, organic base with high-energy accents.

*   **Primary (#c31c45):** A sophisticated, deep pink-red used for brand presence and key actions.
*   **Secondary (#a73f69):** A muted berry tone for secondary interactive elements.
*   **Tertiary (#7150b9):** A soft violet used for special categories (e.g., "Legendary" or "Special Edition" items).
*   **Neutral (Surface & Background):** We use a warm cream (`#fffbff`) rather than pure white to reduce eye strain and maintain the "premium paper" feel.

### The "No-Line" Rule
**Explicit Instruction:** Prohibit the use of 1px solid borders for sectioning. Structural boundaries must be defined solely through background color shifts. For instance, a search bar should be defined by its `surface_container_low` background against a `surface` background, not by a stroke.

### Surface Hierarchy & Nesting
Treat the UI as a series of physical layers. Use the Material tiers to define depth:
*   **Surface:** The base "tabletop."
*   **Surface-Container-Low:** Subtle nesting for secondary groups.
*   **Surface-Container-Highest:** Active, floating states or high-importance cards.

### The Glass & Gradient Rule
To achieve a signature look, floating navigations and "hovering" cards should utilize **Glassmorphism**. Use semi-transparent versions of `surface_variant` with a `backdrop-blur` of 12px-20px. For main CTAs, apply a subtle linear gradient from `primary` to `primary_container` (top-left to bottom-right) to inject "soul" into the component.

---

## 3. Typography
The typography system uses a pairing of **Plus Jakarta Sans** for headers (Modern/Playful) and **Be Vietnam Pro** for body text (Clean/Functional).

*   **Display & Headline (Plus Jakarta Sans):** These are the "personality" weights. Use `display-lg` (3.5rem) and `headline-md` (1.75rem) with tighter letter spacing (-0.02em) to create an authoritative, editorial feel.
*   **Title & Body (Be Vietnam Pro):** Focused on readability. `title-md` (1.125rem) provides clear labeling for cards, while `body-md` (0.875rem) handles descriptions with generous line height (1.6) to ensure the anime-inspired content remains the star.
*   **Labels:** Use `label-sm` (0.6875rem) in all-caps with increased letter spacing (+0.05em) for metadata like "EPISODES" or "YEAR."

---

## 4. Elevation & Depth
Depth is achieved through **Tonal Layering** and ambient light simulations, never through harsh structural lines.

*   **The Layering Principle:** Place a `surface_container_lowest` card on a `surface_container_low` section to create a soft, natural lift. This "paper-on-paper" look is central to the anime-editorial aesthetic.
*   **Ambient Shadows:** For floating elements (like the tier-selection bar), use extra-diffused shadows.
    *   *Spec:* `Box-shadow: 0 8px 32px rgba(57, 56, 52, 0.06);` (Using a tint of `on_surface` rather than black).
*   **The "Ghost Border" Fallback:** If a border is required for accessibility, use the `outline_variant` token at **20% opacity**.
*   **Backdrop Blurs:** Use blurs on modal backgrounds and navigation bars to allow the vibrant colors of the anime posters to bleed through, integrating the UI with the content.

---

## 5. Components

### Buttons
*   **Primary:** Rounded `full` (pill-shaped). Background: Gradient `primary` to `primary_container`. Text: `on_primary`. 
*   **Secondary:** Rounded `md` (0.75rem). Background: `secondary_container`. Text: `on_secondary_container`. No shadow.

### Cards (The "Poster" Card)
*   **Shape:** `xl` (1.5rem) rounded corners.
*   **Treatment:** Forbid divider lines. Separate title from metadata using vertical spacing `2` (0.5rem). The card itself should have no border; its shape is defined by the image content or a `surface_container_highest` background.

### Input Fields
*   **Style:** Rounded `md` (0.75rem). 
*   **Color:** `surface_container_low`. 
*   **State:** On focus, transition background to `surface_container_lowest` and apply a 2px "Ghost Border" using `primary` at 40% opacity.

### Chips (Category Tags)
*   **Style:** `label-md` typography inside a `full` rounded container. 
*   **Logic:** Use `tertiary_container` for anime genres to provide a distinct visual "pop" against the red primary theme.

---

## 6. Do's and Don'ts

### Do
*   **Do** use asymmetrical layouts. Let title text hang over the edge of a container to create a "zine" feel.
*   **Do** use high-contrast typography scales. A massive `display-lg` headline next to a small `body-sm` metadata label creates visual interest.
*   **Do** embrace white space. Use the `spacing-12` (3rem) and `spacing-16` (4rem) tokens generously between sections.

### Don't
*   **Don't** use 1px solid black or grey borders. This instantly kills the "Digital Curator" aesthetic.
*   **Don't** use standard "drop shadows" (e.g., 0px 2px 4px black). Shadows must be wide, soft, and tinted.
*   **Don't** crowd the interface. If a screen feels busy, increase the background "cream" space rather than adding more containers.
*   **Don't** use pure white backgrounds. Always stick to the `surface` (`#fffbff`) or `surface_container` tokens to maintain warmth.