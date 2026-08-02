export function createInteractionHud({ world, camera, panel }) {
  const title = panel.querySelector("[data-interaction-title]");
  const body = panel.querySelector("[data-interaction-body]");
  let activeId = "";

  function update() {
    const nearest = findNearestInteraction(world.interactions, camera.position);

    if (!nearest) {
      activeId = "";
      panel.hidden = true;
      return;
    }

    if (activeId !== nearest.id) {
      activeId = nearest.id;
      title.textContent = nearest.title;
      body.textContent = nearest.body;
    }

    panel.hidden = false;
  }

  return { update };
}

export function findNearestInteraction(interactions, position) {
  let nearest = null;
  let nearestDistance = Infinity;
  const playerY = position.y ?? 1.6;

  interactions.forEach((interaction) => {
    // Y-floor filter — keeps upstairs hotspots from triggering while standing
    // on the ground floor (and vice versa). 2.0 tolerance preserves all the
    // existing outdoor markers (player y ≈ 1.6, markers y ≈ 1.x).
    const markerY = interaction.position.y ?? 1.4;
    if (Math.abs(markerY - playerY) > 2.0) return;

    const dx = interaction.position.x - position.x;
    const dz = interaction.position.z - position.z;
    const distance = Math.hypot(dx, dz);

    if (distance <= interaction.radius && distance < nearestDistance) {
      nearest = interaction;
      nearestDistance = distance;
    }
  });

  return nearest;
}

// Hidden interactions should feel attached to their physical control rather
// than fire merely because the player wandered into a broad HUD radius. This
// treats the view direction as a ray and requires it to pass through a small
// world-space target around the interaction marker. A fixed radius tracks the
// switch's real 0.4 x 0.6 m plate better than a cone that widens with distance.
export function isInteractionTargeted(
  interaction,
  position,
  direction,
  aimRadius = 0.32
) {
  if (!interaction || !position || !direction || aimRadius <= 0) {
    return false;
  }

  const markerY = interaction.position.y ?? 1.4;
  const playerY = position.y ?? 1.6;
  if (Math.abs(markerY - playerY) > 2.0) {
    return false;
  }

  const dx = interaction.position.x - position.x;
  const dy = markerY - playerY;
  const dz = interaction.position.z - position.z;
  if (Math.hypot(dx, dz) > interaction.radius) {
    return false;
  }

  const directionLength = Math.hypot(direction.x, direction.y, direction.z);
  const targetDistanceSquared = dx * dx + dy * dy + dz * dz;
  if (directionLength === 0 || targetDistanceSquared === 0) {
    return false;
  }

  const projection = (
    dx * direction.x + dy * direction.y + dz * direction.z
  ) / directionLength;
  if (projection <= 0) {
    return false;
  }

  const perpendicularDistanceSquared = Math.max(
    0,
    targetDistanceSquared - projection * projection
  );
  return perpendicularDistanceSquared <= aimRadius * aimRadius;
}
