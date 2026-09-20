/**
 * GMHandoverService - Manages GM role transfer operations and player data backup/restoration.
 * 
 * Follows Single Responsibility Principle (SRP):
 * Only handles the logic and state transitions of GM role transfers.
 */
export class GMHandoverService {
  /**
   * Filters and formats active players eligible to receive GM role.
   * Excludes the current GM.
   * @param {Object} members Room members dictionary
   * @param {string} currentGmUid Current GM user id
   * @returns {Array<Object>} List of eligible player objects
   */
  static getEligiblePlayers(members, currentGmUid) {
    if (!members) return [];
    return Object.entries(members)
      .filter(([uid, data]) => uid !== currentGmUid && data && data.role === 'player')
      .map(([uid, data]) => ({
        uid,
        displayName: data.displayName || 'Player',
        cash: data.portfolio?.cash ?? 20000,
        stocks: data.portfolio?.stocks || {},
        debt: data.portfolio?.debt || {},
        joinedAt: data.joinedAt || 0
      }));
  }

  /**
   * Generates next available player name if original GM transitions into player mode.
   * @param {Object} members 
   * @returns {string} e.g. "Player_2"
   */
  static getNextAvailablePlayerName(members) {
    const existingNames = new Set(
      Object.values(members || {})
        .filter(m => m && m.role === 'player' && m.displayName)
        .map(m => m.displayName)
    );
    let nextIndex = 1;
    while (existingNames.has(`Player_${nextIndex}`)) {
      nextIndex++;
    }
    return `Player_${nextIndex}`;
  }
}
