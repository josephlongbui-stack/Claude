/**
 * Illustrative ROI arithmetic. Every output is derived from the inputs shown — no external statistics.
 * Value comes only from extra rider capacity that demand actually uses.
 */
export interface RoiInputs {
  annualSubscription: number;
  installationCost: number;
  attractions: number;
  operatingDays: number;
  operatingHours: number;
  baselineDwellSec: number;
  secondsSavedPerCycle: number;
  seatsPerDispatch: number;
  loadFactor: number;
  demandCaptureRate: number;
  valuePerRecoveredRider: number;
}

export interface RoiResult {
  annualCost: number;
  firstYearCost: number;
  extraCyclesPerDay: number;
  recoveredRidersPerYear: number;
  annualValue: number;
  netFirstYear: number;
  paybackMonths: number | null;
  steps: { label: string; formula: string; value: string }[];
}

const money = (v: number): string => `$${Math.round(v).toLocaleString('en-US')}`;
const int = (v: number): string => Math.round(v).toLocaleString('en-US');

export function computeRoi(i: RoiInputs): RoiResult {
  const secondsPerDay = i.operatingHours * 3600;
  const baselineCycles = i.baselineDwellSec > 0 ? secondsPerDay / i.baselineDwellSec : 0;
  const assistedCycles = secondsPerDay / Math.max(1, i.baselineDwellSec - i.secondsSavedPerCycle);
  const extraCyclesPerDay = Math.max(0, assistedCycles - baselineCycles);
  const ridersPerDay = extraCyclesPerDay * i.seatsPerDispatch * i.loadFactor * i.demandCaptureRate;
  const recoveredRidersPerYear = ridersPerDay * i.operatingDays * i.attractions;
  const annualValue = recoveredRidersPerYear * i.valuePerRecoveredRider;
  const firstYearCost = i.annualSubscription + i.installationCost;
  const paybackMonths = annualValue > 0 ? firstYearCost / (annualValue / 12) : null;
  return {
    annualCost: i.annualSubscription,
    firstYearCost,
    extraCyclesPerDay,
    recoveredRidersPerYear,
    annualValue,
    netFirstYear: annualValue - firstYearCost,
    paybackMonths,
    steps: [
      { label: 'Extra dispatches per day, per ride', formula: `${i.operatingHours} h × 3600 ÷ (${i.baselineDwellSec} − ${i.secondsSavedPerCycle}) s − ${i.operatingHours} h × 3600 ÷ ${i.baselineDwellSec} s`, value: extraCyclesPerDay.toFixed(1) },
      { label: 'Extra riders per day, per ride', formula: `${extraCyclesPerDay.toFixed(1)} × ${i.seatsPerDispatch} seats × ${Math.round(i.loadFactor * 100)}% full × ${Math.round(i.demandCaptureRate * 100)}% used`, value: int(ridersPerDay) },
      { label: 'Extra riders per year', formula: `${int(ridersPerDay)} × ${i.operatingDays} days × ${i.attractions} rides`, value: int(recoveredRidersPerYear) },
      { label: 'Value per year', formula: `${int(recoveredRidersPerYear)} × $${i.valuePerRecoveredRider}`, value: money(annualValue) },
      { label: 'First-year cost', formula: `${money(i.annualSubscription)} subscription + ${money(i.installationCost)} install`, value: money(firstYearCost) },
      { label: 'Payback', formula: 'first-year cost ÷ monthly value', value: paybackMonths === null ? 'n/a' : `${paybackMonths.toFixed(1)} months` },
    ],
  };
}

export const DEFAULT_ROI: RoiInputs = {
  annualSubscription: 150000,
  installationCost: 60000,
  attractions: 4,
  operatingDays: 220,
  operatingHours: 10,
  baselineDwellSec: 120,
  secondsSavedPerCycle: 15,
  seatsPerDispatch: 24,
  loadFactor: 0.85,
  demandCaptureRate: 0.35,
  valuePerRecoveredRider: 1.1,
};
