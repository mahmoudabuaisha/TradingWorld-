/**
 * Risk / position-size math shared by the web calculators, the journal and the API.
 * Pure functions, no side effects, fully unit-testable.
 */
export interface RiskInput {
  balance: number;
  riskPercent: number; // e.g. 1 = 1%
  entry: number;
  stopLoss: number;
  takeProfit?: number;
  pipSize: number; // instrument pip/point size
  pipValuePerLot: number; // account-currency value of one pip for one standard lot
  direction?: "long" | "short";
  maxRiskPercent?: number; // user-defined ceiling for warnings
}

export interface RiskResult {
  direction: "long" | "short";
  riskAmount: number;
  stopDistance: number;
  stopDistancePips: number;
  targetDistance: number | null;
  targetDistancePips: number | null;
  positionSizeLots: number;
  potentialLoss: number;
  potentialProfit: number | null;
  rMultiple: number | null;
  riskReward: string | null;
  warnings: string[];
}

export function calculateRisk(i: RiskInput): RiskResult {
  const direction = i.direction ?? (i.stopLoss < i.entry ? "long" : "short");
  const riskAmount = (i.balance * i.riskPercent) / 100;
  const stopDistance = Math.abs(i.entry - i.stopLoss);
  const stopDistancePips = stopDistance / i.pipSize;
  const positionSizeLots = stopDistancePips > 0 ? riskAmount / (stopDistancePips * i.pipValuePerLot) : 0;
  const potentialLoss = positionSizeLots * stopDistancePips * i.pipValuePerLot;

  let targetDistance: number | null = null;
  let targetDistancePips: number | null = null;
  let potentialProfit: number | null = null;
  let rMultiple: number | null = null;
  if (i.takeProfit !== undefined) {
    targetDistance = Math.abs(i.takeProfit - i.entry);
    targetDistancePips = targetDistance / i.pipSize;
    potentialProfit = positionSizeLots * targetDistancePips * i.pipValuePerLot;
    rMultiple = stopDistance > 0 ? targetDistance / stopDistance : null;
  }

  const warnings: string[] = [];
  if (i.maxRiskPercent !== undefined && i.riskPercent > i.maxRiskPercent) warnings.push("RISK_ABOVE_LIMIT");
  if (direction === "long" && i.stopLoss >= i.entry) warnings.push("STOP_ON_WRONG_SIDE");
  if (direction === "short" && i.stopLoss <= i.entry) warnings.push("STOP_ON_WRONG_SIDE");
  if (i.takeProfit !== undefined) {
    if (direction === "long" && i.takeProfit <= i.entry) warnings.push("TARGET_ON_WRONG_SIDE");
    if (direction === "short" && i.takeProfit >= i.entry) warnings.push("TARGET_ON_WRONG_SIDE");
  }
  if (rMultiple !== null && rMultiple < 1) warnings.push("RR_BELOW_ONE");

  return {
    direction,
    riskAmount: round(riskAmount, 2),
    stopDistance: round(stopDistance, 6),
    stopDistancePips: round(stopDistancePips, 2),
    targetDistance: targetDistance === null ? null : round(targetDistance, 6),
    targetDistancePips: targetDistancePips === null ? null : round(targetDistancePips, 2),
    positionSizeLots: round(positionSizeLots, 4),
    potentialLoss: round(potentialLoss, 2),
    potentialProfit: potentialProfit === null ? null : round(potentialProfit, 2),
    rMultiple: rMultiple === null ? null : round(rMultiple, 2),
    riskReward: rMultiple === null ? null : `${round(rMultiple, 2)}:1`,
    warnings,
  };
}

/** R-multiple realised on a closed trade. */
export function realizedR(entry: number, stopLoss: number, exit: number, direction: "long" | "short"): number {
  const risk = Math.abs(entry - stopLoss);
  if (risk === 0) return 0;
  const pnl = direction === "long" ? exit - entry : entry - exit;
  return round(pnl / risk, 2);
}

export function round(n: number, d: number): number {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}
