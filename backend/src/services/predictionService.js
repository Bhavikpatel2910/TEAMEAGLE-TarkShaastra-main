exports.predictRisk = (history) => {
  const last = history[history.length - 1];

  const trend = history.length > 1
    ? last - history[history.length - 2]
    : 0;

  const future = last + trend * 10;

  return {
    predictedPressure: future,
    risk: future > 80 ? 'HIGH' : 'LOW',
    minutesToBreach: trend > 0 ? Math.round((80 - last) / trend) : null
  };
};