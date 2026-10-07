import type { Minutes } from './timeline';

const MINUS = '−';

// 90 -> "1:30", used for clock offsets from the anchor.
const clock = (minutes: Minutes) => {
  const abs = Math.abs(minutes);
  return `${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, '0')}`;
};

// Offset from the anchor without the "T": "+1:00", "−0:30", "0".
export const offset = (minutes: Minutes) => {
  if (minutes === 0) return '0';
  return `${minutes < 0 ? MINUS : '+'}${clock(minutes)}`;
};

// Time from day start, for days without an anchor: 28 -> "0:28", -480 -> "−8:00".
export const elapsed = (minutes: Minutes) => `${minutes < 0 ? MINUS : ''}${clock(minutes)}`;

// 480 -> "8 h", 30 -> "30 min", 105 -> "1 h 45 min", 0 -> "0".
export const duration = (minutes: Minutes) => {
  if (minutes === 0) return '0';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return [hours && `${hours} h`, rest && `${rest} min`].filter(Boolean).join(' ');
};
