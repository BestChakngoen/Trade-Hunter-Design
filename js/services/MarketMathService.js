/**
 * MarketMathService - Pure mathematical and financial formulas for Trade Hunter.
 * Contains price normalization and Exponential Beta volatility pricing calculations.
 */

/**
 * Normalizes stock price to full hundreds (e.g. 5238 -> 5200, 5265 -> 5300)
 * Minimum floor price is 100.
 * @param {number|string} price 
 * @returns {number}
 */
export function normalizePriceToHundreds(price) {
  if (price === null || price === undefined) return 100;
  const cleanPrice = typeof price === 'string' ? parseFloat(price.replace(/,/g, '')) : Number(price);
  if (isNaN(cleanPrice) || cleanPrice < 100) return 100;
  return Math.max(100, Math.round(cleanPrice / 100) * 100);
}

/**
 * Calculates next price using exponential movement scaled by Beta volatility.
 * @param {number|string} currentPrice - Current price S_t
 * @param {number} beta - Stock Beta factor
 * @param {number} direction - Direction: +1 for Up, -1 for Down
 * @param {number} baseReturn - Base step return rate (default 0.05 = 5%)
 * @returns {number}
 */
export function calculateExponentialBetaPrice(currentPrice, beta = 1.0, direction = 1, baseReturn = 0.05) {
  const cleanPrice = normalizePriceToHundreds(currentPrice);
  const effectiveBeta = Number(beta) || 1.0;
  const logReturn = direction * effectiveBeta * baseReturn;
  const rawNextPrice = cleanPrice * Math.exp(logReturn);
  let nextPrice = normalizePriceToHundreds(rawNextPrice);

  // Ensure price moves by at least 100 in the target direction when rounded
  if (direction > 0 && nextPrice <= cleanPrice) {
    nextPrice = cleanPrice + 100;
  } else if (direction < 0 && nextPrice >= cleanPrice) {
    nextPrice = Math.max(100, cleanPrice - 100);
  }

  return nextPrice;
}

/**
 * Computes next up-tick state for a single stock.
 * @param {Object} stock - current stock item from boardStocks
 * @param {Object} master - masterStock entry
 * @param {number} beta - stock beta
 * @param {Array<number>} [currentHistory] - existing price history
 * @returns {Object|null}
 */
export function calculateStockStepUp(stock, master, beta = 1.0, currentHistory = null) {
  if (!stock || !master) return null;

  const currentStep = (typeof stock.step === 'number' && !isNaN(stock.step)) ? stock.step : 0;
  const nextStep = currentStep + 1;
  const curVal = normalizePriceToHundreds(stock.value);
  const nextValue = calculateExponentialBetaPrice(curVal, beta, 1, 0.16);
  if (isNaN(nextValue) || nextValue < 100) return null;

  const startPrice = master ? normalizePriceToHundreds(master.steps[master.startStep - 1]) : curVal;
  const history = Array.isArray(stock.history) ? stock.history : (currentHistory || [startPrice]);
  const newHistory = [...history, nextValue];

  return {
    ...stock,
    step: nextStep,
    value: nextValue,
    oldValue: curVal,
    direction: 'up',
    history: newHistory,
    updatedAt: Date.now()
  };
}

/**
 * Computes next down-tick state for a single stock.
 * @param {Object} stock - current stock item from boardStocks
 * @param {Object} master - masterStock entry
 * @param {number} beta - stock beta
 * @param {Array<number>} [currentHistory] - existing price history
 * @returns {Object|null}
 */
export function calculateStockStepDown(stock, master, beta = 1.0, currentHistory = null) {
  if (!stock || !master) return null;

  const currentStep = (typeof stock.step === 'number' && !isNaN(stock.step)) ? stock.step : 0;
  let prevStep = currentStep - 1;
  if (prevStep < 0) {
    prevStep = 0;
  }

  const curVal = normalizePriceToHundreds(stock.value);
  const nextValue = Math.max(100, calculateExponentialBetaPrice(curVal, beta, -1, 0.16));
  if (isNaN(nextValue) || nextValue < 100) return null;

  const startPrice = master ? normalizePriceToHundreds(master.steps[master.startStep - 1]) : curVal;
  const history = Array.isArray(stock.history) ? stock.history : (currentHistory || [startPrice]);
  const newHistory = (nextValue !== curVal) ? [...history, nextValue] : history;

  return {
    ...stock,
    step: prevStep,
    value: nextValue,
    oldValue: curVal,
    direction: 'down',
    history: newHistory,
    updatedAt: Date.now()
  };
}

/**
 * Computes reset state for an array of stocks.
 * @param {Array<Object>} boardStocksArray
 * @param {Object} masterStocks
 * @returns {Array<Object>}
 */
export function calculateResetStocks(boardStocksArray, masterStocks = {}) {
  if (!Array.isArray(boardStocksArray)) return [];
  return boardStocksArray.map(s => {
    const master = masterStocks[s.name];
    if (!master) return s;
    const startIdx = master.startStep - 1;
    const startPrice = normalizePriceToHundreds(master.steps[startIdx]);
    return {
      ...s,
      step: startIdx,
      value: startPrice,
      oldValue: null,
      direction: null,
      history: [startPrice],
      updatedAt: Date.now()
    };
  });
}
