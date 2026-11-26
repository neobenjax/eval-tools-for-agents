export const dashboardView = () => {
  const root = document.querySelector('[data-view]');
  return root ? root.getAttribute('data-view') : null;
};
