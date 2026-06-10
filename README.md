# Cat Burglar

A first-person cat-catching game. Five cats are loose in a procedurally
generated house — find them, sneak up, and grab them all as fast as you can.

**▶ Play it now: https://mshade.github.io/catburglar/** — desktop or
phone/tablet (touch controls included). Deployed automatically from `main`
by GitHub Actions.

## Play locally

    npm install
    npm run dev

Open http://localhost:5173 (any modern macOS browser).

**Controls:** WASD move · mouse look · Shift sprint · E grab · M mute · Esc pause

**Tips:** Cats hear you — sprinting flushes them out, walking slowly lets you
sneak into grab range. Listen for meows to find hidden cats, and chase runners
into dead-end rooms to corner them.

## Play on a phone or iPad

    npm run dev -- --host

Then open `http://<your-mac-lan-ip>:5173` on the phone (same Wi-Fi network —
the dev server prints the address). Landscape is recommended.

**Touch controls:** left joystick to move — push gently to sneak quietly,
push to the edge to sprint loudly · drag anywhere else to look · tap 🐾 to
grab when it appears · ⏸ pauses · 🔊 mutes.

## Develop

    npm test        # vitest unit tests (generation, pathfinding, AI, collision)
    npm run build   # static production build in dist/
