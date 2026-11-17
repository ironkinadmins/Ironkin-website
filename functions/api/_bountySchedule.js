// Bounty schedules are stored on each tracked drop, independently of the event.
// Legacy items without a schedule remain enabled until staff configure dates.
export function isBountyItemActive(drop, now = Date.now()) {
  if (!drop || drop.bountyEnabled === false) return false;
  for (const [field, isStart] of [["bountyStartsAt", true], ["bountyEndsAt", false]]) {
    if (!drop[field]) continue;
    const time = Date.parse(drop[field]);
    if (!Number.isFinite(time)) return false;
    if (isStart ? now < time : now >= time) return false;
  }
  return true;
}
export function validateBountySchedule(start, end) {
  for (const value of [start, end]) {
    if (value && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)))) return false;
  }
  return !(start && end && Date.parse(start) >= Date.parse(end));
}
