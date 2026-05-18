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
