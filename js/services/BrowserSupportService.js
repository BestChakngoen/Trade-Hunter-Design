/**
 * BrowserSupportService.js
 * บริการตรวจสอบความเข้ากันได้ของเว็บเบราว์เซอร์ (Browser Compatibility Checker)
 * ตรวจสอบคุณสมบัติสำคัญที่เกม Trade Hunter จำเป็นต้องใช้ (WebSocket, Storage, Fetch, Crypto)
 * และแสดงการแจ้งเตือนหากเบราว์เซอร์ไม่รองรับ
 * 
 * ปฏิบัติตาม Single Responsibility Principle (SRP)
 */
import { AlertModalService } from './AlertModalService.js';

export class BrowserSupportService {
  /**
   * ตรวจสอบว่า storage (localStorage / sessionStorage) สามารถใช้งานได้จริง
   * @param {'localStorage' | 'sessionStorage'} type 
   * @param {Object} [targetWindow=null]
   * @returns {boolean}
   */
  static isStorageAvailable(type, targetWindow = null) {
    const win = targetWindow || (typeof window !== 'undefined' ? window : null);
    if (!win || !(type in win)) return false;
    try {
      const storage = win[type];
      const testKey = '__th_browser_support_test__';
      storage.setItem(testKey, testKey);
      storage.removeItem(testKey);
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * ตรวจสอบคุณสมบัติทั้งหมดที่จำเป็นสำหรับระบบ Trade Hunter
   * @param {Object} [targetWindow=null]
   * @returns {{ isSupported: boolean, missingFeatures: string[] }}
   */
  static checkSupport(targetWindow = null) {
    const win = targetWindow || (typeof window !== 'undefined' ? window : null);
    if (!win) {
      return { isSupported: true, missingFeatures: [] };
    }

    const missingFeatures = [];

    // 1. WebSocket (จำเป็นสำหรับการรับส่งข้อมูลเกม Real-time)
    if (!('WebSocket' in win)) {
      missingFeatures.push('WebSocket (การเชื่อมต่อแบบเรียลไทม์)');
    }

    // 2. Storage APIs (จำเป็นสำหรับระบบเซสชันผู้เล่นและพอร์ตโฟลิโอ)
    if (!this.isStorageAvailable('localStorage', win)) {
      missingFeatures.push('LocalStorage (การจัดเก็บข้อมูล)');
    }
    if (!this.isStorageAvailable('sessionStorage', win)) {
      missingFeatures.push('SessionStorage (การจัดเก็บเซสชัน)');
    }

    // 3. Fetch API & Promises (จำเป็นสำหรับการเชื่อมต่อ API และฐานข้อมูล)
    if (typeof win.fetch !== 'function' || typeof win.Promise !== 'function') {
      missingFeatures.push('Fetch & Promise APIs');
    }

    // 4. Crypto API (จำเป็นสำหรับการสร้าง Secure Session Token)
    if (!win.crypto || typeof win.crypto.getRandomValues !== 'function') {
      missingFeatures.push('Web Crypto API');
    }

    // 5. Modern ES Standards (Object.entries, Set, Array.prototype.find)
    if (typeof Object.entries !== 'function' || typeof Set !== 'function' || typeof Array.prototype.find !== 'function') {
      missingFeatures.push('Modern ECMAScript Standard');
    }

    return {
      isSupported: missingFeatures.length === 0,
      missingFeatures
    };
  }

  /**
   * แสดงการแจ้งเตือนหากเบราว์เซอร์ไม่รองรับคุณสมบัติที่จำเป็น
   * @param {Object} [renderer=null]
   * @returns {boolean} true ถ้าเบราว์เซอร์รองรับ, false ถ้าไม่รองรับ
   */
  static notifyIfUnsupported(renderer = null) {
    const { isSupported, missingFeatures } = this.checkSupport();
    if (isSupported) {
      return true;
    }

    console.warn("[BrowserSupportService] Unsupported browser features detected:", missingFeatures);

    const title = "เบราว์เซอร์ไม่รองรับ";
    const message = "เบราว์เซอร์ที่คุณกำลังใช้งานไม่รองรับคุณสมบัติที่จำเป็นสำหรับเกม Trade Hunter กรุณาเปิดใช้งานผ่าน Google Chrome, Safari, Microsoft Edge หรือ Firefox เวอร์ชันล่าสุด เพื่อประสิทธิภาพและความปลอดภัยในการเล่นเกม";

    // 1. ใช้ Renderer / AlertModalService ถ้ามี
    if (renderer && typeof renderer.showErrorAlert === 'function') {
      renderer.showErrorAlert(title, message);
    } else {
      AlertModalService.showErrorAlert(title, message);
    }

    // 2. Fallback Banner เผื่อกรณี SweetAlert หรือ External Script ไม่ทำงานในเบราว์เซอร์รุ่นเก่ามาก
    this.renderFallbackBannerIfNeeded(title, message, missingFeatures);

    return false;
  }

  /**
   * สร้าง Fallback Banner แจ้งเตือนบน DOM สำหรับเบราว์เซอร์รุ่นเก่าที่โหลดสคริปต์ไม่สมบูรณ์
   */
  static renderFallbackBannerIfNeeded(title, message, missingFeatures = []) {
    if (typeof document === 'undefined') return;
    if (document.getElementById('unsupportedBrowserBanner')) return;

    try {
      const banner = document.createElement('div');
      banner.id = 'unsupportedBrowserBanner';
      banner.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        z-index: 999999;
        background: #ef4444;
        color: #ffffff;
        padding: 14px 20px;
        text-align: center;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 13px;
        line-height: 1.5;
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
      `;
      banner.innerHTML = `
        <strong>⚠️ ${title}:</strong> ${message}
      `;
      document.body.prepend(banner);
    } catch (e) {
      console.error("[BrowserSupportService] Error rendering fallback banner:", e);
    }
  }
}
