/**
 * SoundService - Handles sound effects playback with audio caching and error handling.
 */
export class SoundService {
  constructor() {
    this.soundPaths = {
      approve: 'Assets/Sounds/Approve.mp3',
      reject: 'Assets/Sounds/Reject.mp3',
      receiveMoney: 'Assets/Sounds/Receive_money.mp3',
      warning: 'Assets/Sounds/Warning.mp3',
      raisePrice: 'Assets/Sounds/Raise_price.mp3',
      downPrice: 'Assets/Sounds/Down_price.mp3'
    };

    this.audioPool = {};
    this.isMuted = false;
  }

  /**
   * Helper to safely play a sound from path.
   * Creates or clones an Audio element so overlapping sounds can play simultaneously.
   * @param {string} key - The key in this.soundPaths
   */
  playSound(key) {
    if (this.isMuted) return;
    const path = this.soundPaths[key];
    if (!path) return;

    try {
      const audio = new Audio(path);
      audio.currentTime = 0;
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          // Gracefully suppress autoplay policy or missing file errors
          console.warn(`[SoundService] Could not play sound "${key}":`, err.message);
        });
      }
    } catch (err) {
      console.warn(`[SoundService] Audio error on "${key}":`, err);
    }
  }

  playApprove() {
    this.playSound('approve');
  }

  playReject() {
    this.playSound('reject');
  }

  playReceiveMoney() {
    this.playSound('receiveMoney');
  }

  playWarning() {
    this.playSound('warning');
  }

  playRaisePrice() {
    this.playSound('raisePrice');
  }

  playDownPrice() {
    this.playSound('downPrice');
  }
}
