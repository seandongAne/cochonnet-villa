const loadingElement = document.querySelector(".loading");

if (loadingElement) {
  loadingElement.textContent = "Starting the Cochonnet Villa editor...";
}

try {
  const { default: CMS } = await import("decap-cms-app");
  CMS.init();

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      loadingElement?.remove();
    });
  });
} catch (error) {
  console.error("Failed to load Decap CMS", error);

  if (loadingElement) {
    loadingElement.innerHTML = `
      <div>
        <p><strong>The editor could not finish loading.</strong></p>
        <p>Try refreshing the page once. If it still fails, let me know and I will keep fixing it.</p>
      </div>
    `;
  }
}
