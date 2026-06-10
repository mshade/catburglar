# Cat Burglar

A first-person cat-catching game. Five cats are loose in a procedurally
generated house — find them, sneak up, and grab them all as fast as you can.

## Play

    npm install
    npm run dev

Open http://localhost:5173 (any modern macOS browser).

**Controls:** WASD move · mouse look · Shift sprint · E grab · M mute · Esc pause

**Tips:** Cats hear you — sprinting flushes them out, walking slowly lets you
sneak into grab range. Listen for meows to find hidden cats, and chase runners
into dead-end rooms to corner them.

## Develop

    npm test        # vitest unit tests (generation, pathfinding, AI, collision)
    npm run build   # static production build in dist/
