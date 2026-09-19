/**
 * InAppBrowserService.js
 * บริการตรวจจับและจัดการ In-App Browser (LINE, Facebook, Instagram, Messenger)
 * ช่วยนำทางผู้ใช้ไปยังเบราว์เซอร์หลัก (Safari / Chrome) เพื่อความเสถียรสูงสุดในการเล่นเกม
 */
export class InAppBrowserService {
  constructor() {
    this.ua = typeof navigator !== 'undefined' ? (navigator.userAgent || navigator.vendor || window.opera || '') : '';
    this.detection = this.detect();
  }

  detect() {
    const ua = this.ua;
    const isLine = /Line/i.test(ua);
    const isFacebook = /FBAN|FBAV|FB_IAB/i.test(ua);
    const isInstagram = /Instagram/i.test(ua);
    const isOtherIAB = /Twitter|BytedanceWebview|Snapchat|MicroMessenger/i.test(ua);
    const isAndroid = /Android/i.test(ua);
    const isIOS = /iPhone|iPad|iPod/i.test(ua);

    let appName = '';
    if (isLine) appName = 'LINE';
    else if (isFacebook) appName = 'Facebook';
    else if (isInstagram) appName = 'Instagram';
    else if (isOtherIAB) appName = 'In-App Browser';

    return {
      isInApp: isLine || isFacebook || isInstagram || isOtherIAB,
      isLine,
      isFacebook,
      isInstagram,
      isAndroid,
      isIOS,
      appName
    };
  }

  init() {
    if (!this.detection.isInApp) {
      return;
    }

    // 1. จัดการกรณี LINE: บังคับเปิดเบราว์เซอร์ภายนอกอัตโนมัติด้วย ?openExternalBrowser=1
    if (this.detection.isLine) {
      const url = new URL(window.location.href);
      if (url.searchParams.get('openExternalBrowser') !== '1') {
        try {
          if (!sessionStorage.getItem('th_line_redirect_attempted')) {
            sessionStorage.setItem('th_line_redirect_attempted', '1');
            url.searchParams.set('openExternalBrowser', '1');
            window.location.replace(url.toString());
            return;
          }
        } catch (e) {
          // หาก sessionStorage โดนบล็อก ให้ข้ามไปแสดงแบนเนอร์แทน
        }
      }
    }

    // 2. ตรวจสอบว่าผู้ใช้เคยกดปิดแบนเนอร์ในเซสชันนี้หรือไม่
    try {
      if (sessionStorage.getItem('th_iab_banner_dismissed') === '1') {
        return;
      }
    } catch (e) {}

    // 3. แสดงแบนเนอร์แนะนำผู้ใช้
    this.renderBanner();
  }

  renderBanner() {
    if (document.getElementById('iabGuideBanner')) {
      return;
    }

    const banner = document.createElement('div');
    banner.id = 'iabGuideBanner';
    banner.className = 'iab-guide-banner';
    banner.setAttribute('role', 'alert');

    const isAndroid = this.detection.isAndroid;
    const isIOS = this.detection.isIOS;
    const appName = this.detection.appName || 'แอป';

    // สร้าง Intent URL สำหรับ Android Chrome
    const currentUrl = window.location.href;
    const chromeIntentUrl = `intent://${window.location.host}${window.location.pathname}${window.location.search}#Intent;scheme=https;package=com.android.chrome;end`;

    let actionBtnHtml = '';
    if (isAndroid) {
      actionBtnHtml = `
        <a href="${chromeIntentUrl}" class="iab-btn-primary" id="iabOpenChromeBtn">
          เปิดใน Chrome 🚀
        </a>
      `;
    } else {
      actionBtnHtml = `
        <button type="button" class="iab-btn-primary" id="iabCopyLinkBtn">
          คัดลอกลิงก์ 📋
        </button>
      `;
    }

    banner.innerHTML = `
      <div class="iab-content">
        <div class="iab-icon-box">
          <svg xmlns="http://www.w3.org/2000/svg" style="width: 20px; height: 20px;" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div class="iab-text-area">
          <div class="iab-title">
            เปิดผ่าน ${appName} <span class="iab-top-arrow">↗️</span>
          </div>
          <p class="iab-desc">
            ${isIOS 
              ? "เพื่อการเล่นเกมแบบไม่สะดุด แตะปุ่ม <b>⋯</b> ที่มุมขวาบน แล้วเลือก <b>'เปิดใน Safari'</b>" 
              : "เพื่อการเล่นเกมแบบไม่สะดุด แนะนำให้เปิดด้วยเบราว์เซอร์หลัก (Chrome / Safari)"}
          </p>
        </div>
        <div class="iab-actions">
          ${actionBtnHtml}
          <button type="button" class="iab-btn-close" id="iabDismissBtn" aria-label="ปิดการแจ้งเตือน">
            <svg xmlns="http://www.w3.org/2000/svg" style="width: 18px; height: 18px;" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    `;

    document.body.prepend(banner);
    document.body.classList.add('has-iab-banner');

    // Event listener สำหรับปุ่มคัดลอกลิงก์
    const copyBtn = document.getElementById('iabCopyLinkBtn');
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(currentUrl);
          } else {
            // Fallback คัดลอกแบบ execCommand
            const textarea = document.createElement('textarea');
            textarea.value = currentUrl;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
          }
          copyBtn.textContent = 'คัดลอกแล้ว! ✅';
          setTimeout(() => {
            if (copyBtn) copyBtn.textContent = 'คัดลอกลิงก์ 📋';
          }, 2500);
        } catch (err) {
          copyBtn.textContent = 'คัดลอกไม่สำเร็จ ⚠️';
        }
      });
    }

    // Event listener สำหรับปุ่มปิดแบนเนอร์
    const dismissBtn = document.getElementById('iabDismissBtn');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => {
        document.body.classList.remove('has-iab-banner');
        banner.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
        banner.style.opacity = '0';
        banner.style.transform = 'translateY(-100%)';
        setTimeout(() => {
          if (banner.parentNode) {
            banner.parentNode.removeChild(banner);
          }
        }, 260);

        try {
          sessionStorage.setItem('th_iab_banner_dismissed', '1');
        } catch (e) {}
      });
    }
  }
}
