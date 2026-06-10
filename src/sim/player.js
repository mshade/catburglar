export const WALK_SPEED = 3, SPRINT_SPEED = 6;
export const PLAYER_RADIUS = 0.3, GRAB_RANGE = 1.7, EYE_HEIGHT = 1.6;
export const NOISE_IDLE = 2, NOISE_WALK = 4, NOISE_SPRINT = 12;

export function createPlayer(spawnCell) {
  return {
    x: spawnCell.x + 0.5,
    z: spawnCell.y + 0.5,
    yaw: 0,
    pitch: 0,
    speed: 0,
    noiseRadius: NOISE_IDLE,
  };
}

function blockedAt(grid, x, z, r) {
  for (let cy = Math.floor(z - r); cy <= Math.floor(z + r); cy++) {
    for (let cx = Math.floor(x - r); cx <= Math.floor(x + r); cx++) {
      if (grid.walkable(cx, cy)) continue;
      // circle vs cell AABB
      const nx = Math.max(cx, Math.min(x, cx + 1));
      const nz = Math.max(cy, Math.min(z, cy + 1));
      if ((nx - x) ** 2 + (nz - z) ** 2 < r * r) return true;
    }
  }
  return false;
}

// Per-axis resolution gives wall sliding for free.
export function resolveMove(grid, x, z, nx, nz, r = PLAYER_RADIUS) {
  const rx = blockedAt(grid, nx, z, r) ? x : nx;
  const rz = blockedAt(grid, rx, nz, r) ? z : nz;
  return { x: rx, z: rz };
}

export function updatePlayer(player, input, grid, dt) {
  let mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let mz = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
  const len = Math.hypot(mx, mz);
  if (len > 0) {
    mx /= len; mz /= len;
    const speed = input.sprint ? SPRINT_SPEED : WALK_SPEED;
    const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
    // forward = (-sin, -cos), right = (cos, -sin) in the x/z plane
    const wx = mz * -sin + mx * cos;
    const wz = mz * -cos + mx * -sin;
    const next = resolveMove(grid, player.x, player.z,
      player.x + wx * speed * dt, player.z + wz * speed * dt);
    player.x = next.x;
    player.z = next.z;
    player.speed = speed;
    player.noiseRadius = input.sprint ? NOISE_SPRINT : NOISE_WALK;
  } else {
    player.speed = 0;
    player.noiseRadius = NOISE_IDLE;
  }
}

// Nearest non-caught cat within GRAB_RANGE that the player is roughly facing.
export function grabbableCat(player, cats) {
  let best = null, bestD = GRAB_RANGE;
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
  for (const c of cats) {
    if (c.state === 'caught') continue;
    const dx = c.x - player.x, dz = c.z - player.z;
    const d = Math.hypot(dx, dz);
    if (d > bestD) continue;
    if (d > 0.3 && (dx * fx + dz * fz) / d < 0.25) continue;
    best = c;
    bestD = d;
  }
  return best;
}
