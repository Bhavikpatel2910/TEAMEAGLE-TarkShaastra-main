exports.generateAlert = (pressure) => {
  if (pressure > 85) {
    return { level: 'CRITICAL', message: 'Crush risk imminent' };
  } else if (pressure > 70) {
    return { level: 'WARNING', message: 'High crowd density' };
  }
  return null;
};