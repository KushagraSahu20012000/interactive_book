
# Brainy Books — Neubrutalist Kids' Learning App

A bold, colorful educational web app with thick black borders, hard offset shadows, chunky typography, and playful primary colors. Live updates powered by Lovable Cloud realtime.

## Tech & Setup
- **Backend:** Lovable Cloud (Postgres + Realtime WebSocket + Storage for book images)
- **3D:** `@react-three/fiber@^8.18` + `@react-three/drei@^9.122.0` for the mascot
- **Fonts:** Chunky display font (Archivo Black / Bungee) + rounded body (Nunito)
- **Routing:** React Router (already installed)

## Design System (Neubrutalist + Kids)
- Backgrounds: cream/off-white base with vibrant accent panels
- Palette: hot pink, electric yellow, sky blue, lime green, coral — all paired with pure black
- Every card/button: 3–4px solid black border + hard offset shadow (e.g. `8px 8px 0 #000`)
- Hover: shadow collapses + element nudges down/right (classic neubrutalist press)
- No gradients, no soft shadows, no rounded-pill softness — slight rounding only

## Top Navigation Bar (persistent)
- Chunky logo + two route buttons: **Home** / **Books**
- Sticky, bold black bottom border, color-block background
- Live "👀 N kids reading now" pill on the right (realtime presence count)

## Page 1 — Introduction (`/`)
1. **Hero:** Huge stacked headline ("LEARN LOUD. THINK BIG.") + subhead. Right side hosts an **interactive 3D mascot**: a chunky low-poly friendly robot/owl character that idles with a bob animation and follows the cursor with its eyes/head. Drag to rotate. Built with React Three Fiber.
2. **Feature blocks** (5 colored neubrutalist cards in a staggered grid, each a different accent color with a big emoji/icon):
   - 🎂 Age-Based Learning
   - 🤖 Post-AI Learning
   - 🧩 Neurodivergent Friendly
   - 🎯 Adaptive
   - 🧠 Real Cognitive Skills
3. **About the Creator / How it's Made:** Two-column block — short story of the creator on the left, "How it's built" stack/process on the right (kid-friendly icons: brain → idea → book).

## Page 2 — Books (`/books`)
- Responsive grid of book cards (image with title overlay, thick black border, hard shadow, rotated slightly for personality)
- **Live:** new books inserted to the DB appear instantly via Supabase Realtime — no refresh
- Click a card → navigates to `/books/:id`

## Page 3 — Book Detail (`/books/:id`)
- **Non-scrollable** single-screen layout (fits viewport, content scales)
- Big chunky **title bar at top** with back button
- Below: **3 zigzag rows**, each row = image + text block:
  - Row 1: image LEFT, text RIGHT
  - Row 2: image RIGHT, text LEFT
  - Row 3: image LEFT, text RIGHT
- Each image and text block in its own bordered neubrutalist panel with alternating accent colors
- Live: if the book's content updates in DB, the page reflects it instantly

## Database (Lovable Cloud / Postgres)
**`books` table**
- id, title, cover_image_url, created_at
**`book_sections` table** (3 rows per book)
- id, book_id, position (1/2/3), image_url, text_content
**`presence` (realtime channel)**
- Tracks active viewers per page → drives "kids reading now" counter in nav and on each book card

## Realtime / WebSocket Behavior
- Books list page: subscribes to `books` table changes → live add/remove/edit
- Book detail page: subscribes to that book's `book_sections` → live content edits
- Presence channel: live viewer count in top bar + per-book "👀 watching" badge

## Seed Data
4–6 sample kids' books pre-loaded (e.g. "The Curious Cloud", "Robo & The Rainbow", "Maya Counts the Stars", "The Brave Little Bug"), each with cover + 3 sections of placeholder image + paragraph text, so the app is alive on first load.

## Out of Scope (this round)
- Admin UI to add/edit books (can be added next; for now seed via DB or I can add a simple form if needed)
- Auth (open access — appropriate for a kids' demo)
- MongoDB (replaced with Lovable Cloud per your confirmation; same "data in a database" outcome with native realtime)
