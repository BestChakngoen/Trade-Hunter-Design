import { FirebaseService } from './FirebaseService.js';
import { MarketState } from './MarketState.js';
import { MarketRenderer } from './MarketRenderer.js';
import { MarketController } from './MarketController.js';
import { InAppBrowserService } from './services/InAppBrowserService.js';

document.addEventListener('DOMContentLoaded', async () => {
  // Initialize In-App Browser detection & guidance for LINE, Facebook, Instagram
  const inAppBrowserService = new InAppBrowserService();
  inAppBrowserService.init();

  const priceGrid = document.getElementById('priceGrid');
  const originalCards = Array.from(priceGrid.querySelectorAll('.price-card'));
  
  const firebaseService = new FirebaseService();
  const state = new MarketState(originalCards);
  const renderer = new MarketRenderer();
  const controller = new MarketController(state, renderer, firebaseService);
  
  // Show lobby screen immediately on page load
  renderer.showLobby();

  try {
    await firebaseService.init();
    await controller.init();
  } catch (error) {
    console.error("Initialization error:", error);
    renderer.showErrorAlert("การเชื่อมต่อล้มเหลว", "ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์หลักของ Firebase ได้");
  }
});
