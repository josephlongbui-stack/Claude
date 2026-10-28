/** Illustrative ROI arithmetic. Every output is derived from the inputs shown — no external statistics. */
export interface RoiInputs {
  annualSubscription: number;
  installationCost: number;
  attractions: number;
  operatingDays: number;
  operatingHours: number;
  secondsSavedPerCycle: number;
  baselineDwellSec: number;
  loadFactor: number;
  trainCapacity: number;
  laborCostPerHour: number;
  staffHoursSavedPerDay: number;
  valuePerRecoveredRider: number;
  demandCaptureRate: number;
}

export interface RoiResult {
  annualSoftwareCost: number;
  firstYearCost: number;
  cyclesPerDayBaseline: number;
  cyclesPerDayAssisted: number;
  extraCyclesPerDay: number;
  recoveredRidersPerDay: number;
  recoveredRidersPerYear: number;
  capacityValue: number;
  laborSavings: number;
  annualValue: number;
  netFirstYear: number;
  paybackMonths: number | null;
  steps: { label: string; formula: string; value: string }[];
}

const money = (v: number): string => `$${Math.round(v).toLocaleString('en-US')}`;

export function computeRoi(i: RoiInputs): RoiResult {
  const secondsPerDay = i.operatingHours * 3600;
  const cyclesPerDayBaseline = i.baselineDwellSec > 0 ? secondsPerDay / i.baselineDwellSec : 0;
  const assistedDwell = Math.max(1, i.baselineDwellSec - i.secondsSavedPerCycle);
  const cyclesPerDayAssisted = secondsPerDay / assistedDwell;
  const extraCyclesPerDay = Math.max(0, cyclesPerDayAssisted - cyclesPerDayBaseline);
  const recoveredRidersPerDay = extraCyclesPerDay * i.trainCapacity * i.loadFactor * i.demandCaptureRate;
  const recoveredRidersPerYear = recoveredRidersPerDay * i.operatingDays * i.attractions;
  const capacityValue = recoveredRidersPerYear * i.valuePerRecoveredRider;
  const laborSavings = i.staffHoursSavedPerDay * i.laborCostPerHour * i.operatingDays * i.attractions;
  const annualValue = capacityValue + laborSavings;
  const annualSoftwareCost = i.annualSubscription;
  const firstYearCost = i.annualSubscription + i.installationCost;
  const netFirstYear = annualValue - firstYearCost;
  const monthlyValue = annualValue / 12;
  const paybackMonths = monthlyValue > 0 ? firstYearCost / monthlyValue : null;
  return {
    annualSoftwareCost,
    firstYearCost,
    cyclesPerDayBaseline,
    cyclesPerDayAssisted,
    extraCyclesPerDay,
    recoveredRidersPerDay,
    recoveredRidersPerYear,
    capacityValue,
    laborSavings,
    annualValue,
    netFirstYear,
    paybackMonths,
    steps: [
      { label: 'Baseline cycles / day / attraction', formula: `${i.operatingHours}h × 3600 ÷ ${i.baselineDwellSec}s`, value: cyclesPerDayBaseline.toFixed(1) },
      { label: 'Assisted cycles / day / attraction', formula: `${i.operatingHours}h × 3600 ÷ (${i.baselineDwellSec} − ${i.secondsSavedPerCycle})s`, value: cyclesPerDayAssisted.toFixed(1) },
      { label: 'Recovered riders / day / attraction', formula: `${extraCyclesPerDay.toFixed(1)} extra cycles × ${i.trainCapacity} seats × ${(i.loadFactor * 100).toFixed(0)}% × ${(i.demandCaptureRate * 100).toFixed(0)}% demand capture`, value: recoveredRidersPerDay.toFixed(0) },
      { label: 'Recovered riders / year', formula: `${recoveredRidersPerDay.toFixed(0)} × ${i.operatingDays} days × ${i.attractions} attractions`, value: Math.round(recoveredRidersPerYear).toLocaleString('en-US') },
      { label: 'Recovered capacity value', formula: `${Math.round(recoveredRidersPerYear).toLocaleString('en-US')} × $${i.valuePerRecoveredRider}`, value: money(capacityValue) },
      { label: 'Operating (labor) savings', formula: `${i.staffHoursSavedPerDay}h × $${i.laborCostPerHour} × ${i.operatingDays} × ${i.attractions}`, value: money(laborSavings) },
      { label: 'Illustrative annual value', formula: 'capacity value + labor savings', value: money(annualValue) },
      { label: 'First-year cost', formula: `$${i.annualSubscription.toLocaleString('en-US')} subscription + $${i.installationCost.toLocaleString('en-US')} install`, value: money(firstYearCost) },
      { label: 'Payback period', formula: 'first-year cost ÷ (annual value ÷ 12)', value: paybackMonths === null ? 'n/a' : `${paybackMonths.toFixed(1)} months` },
    ],
  };
}

export const DEFAULT_ROI: RoiInputs = {
  annualSubscription: 150000,
  installationCost: 60000,
  attractions: 4,
  operatingDays: 220,
  operatingHours: 10,
  secondsSavedPerCycle: 15,
  baselineDwellSec: 120,
  loadFactor: 0.85,
  trainCapacity: 24,
  laborCostPerHour: 24,
  staffHoursSavedPerDay: 1.5,
  valuePerRecoveredRider: 1.1,
  demandCaptureRate: 0.35,
};
