import { isHoliday } from 'japanese-holidays';
import { addDays, isWeekend, getMonth, getDate } from 'date-fns';

/**
 * Checks if a given date is a bank holiday in Japan.
 * Bank holidays include:
 * - Weekends (Saturday, Sunday)
 * - Public holidays
 * - New Year holidays (December 31st to January 3rd)
 */
export const isBankHoliday = (date: Date): boolean => {
  // 1. Check if it's a weekend
  if (isWeekend(date)) {
    return true;
  }

  // 2. Check if it's a public holiday using japanese-holidays
  if (isHoliday(date)) {
    return true;
  }

  // 3. Check for New Year holidays (Dec 31, Jan 1, Jan 2, Jan 3)
  const month = getMonth(date); // 0-indexed (0 = Jan, 11 = Dec)
  const day = getDate(date);
  
  if (month === 11 && day === 31) return true;
  if (month === 0 && (day === 1 || day === 2 || day === 3)) return true;

  return false;
};

/**
 * Gets the next business day if the given date is a bank holiday.
 * If the given date is already a business day, it returns the same date.
 */
export const getNextBusinessDay = (date: Date): Date => {
  let currentDate = new Date(date);
  
  while (isBankHoliday(currentDate)) {
    currentDate = addDays(currentDate, 1);
  }
  
  return currentDate;
};
