document.addEventListener('DOMContentLoaded', () => {
  const priceGrid = document.getElementById('priceGrid');
  const originalCards = Array.from(priceGrid.querySelectorAll('.price-card'));
  
  const state = new MarketState(originalCards);
  const renderer = new MarketRenderer();
  const controller = new MarketController(state, renderer);
  
  controller.init();
});
