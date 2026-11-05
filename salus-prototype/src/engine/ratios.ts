import type { Coverage, FxRate, ItvRatio, PmlRatio, Ratio, Thresholds } from './types';
import { DEFAULT_THRESHOLDS } from './types';
import { toSgd } from './fx';

export type ItvOptions = {
  /** Required when the coverage is not denominated in SGD. */
  fx?: FxRate[];
  refDate?: string;
  thresholds?: Thresholds;
};

/**
 * Insurance-to-value: `sumInsured / tivSgd`.
 *
 * `sumInsured` is in the coverage's own currency. For a non-SGD coverage the
 * caller must pass `fx` and `refDate`, because this function has no portfolio
 * to read a valuation date from.
 */
export function itv(coverage: Coverage, tivSgd: number, options: ItvOptions = {}): ItvRatio {
  const thresholds = options.thresholds ?? DEFAULT_THRESHOLDS;
  if (!(tivSgd > 0)) {
    throw new Error(`itv requires a positive TIV, received ${tivSgd}`);
  }

  let insuredSgd = coverage.sumInsured;
  if (coverage.currency !== 'SGD') {
    if (options.fx === undefined || options.refDate === undefined) {
      throw new Error(
        `itv needs fx and refDate to convert a ${coverage.currency} coverage (${coverage.id})`,
      );
    }
    insuredSgd = toSgd(coverage.sumInsured, coverage.currency, options.fx, options.refDate);
  }

  const value = insuredSgd / tivSgd;
  const flag = value < thresholds.itvUnder ? 'under' : value > thresholds.itvOver ? 'over' : 'ok';

  return {
    value,
    numerator: insuredSgd,
    denominator: tivSgd,
    formula: 'sumInsured (SGD) / tivSgd',
    flag,
  };
}

/** Per-occurrence limit against PML. Anything below 1.0 leaves a retention gap. */
export function limitToPml(limitOccSgd: number, pmlSgd: number): PmlRatio {
  if (!(pmlSgd > 0)) {
    throw new Error(`limitToPml requires a positive PML, received ${pmlSgd}`);
  }
  const value = limitOccSgd / pmlSgd;
  return {
    value,
    numerator: limitOccSgd,
    denominator: pmlSgd,
    formula: 'limitOcc (SGD) / pmlSgd',
    flag: value < 1 ? 'below' : 'ok',
  };
}

/**
 * Uninsured share of TIV, floored at 0. The numerator is floored as well so
 * `numerator / denominator` always equals `value` for over-insured sites.
 */
export function coverageGapPct(tivSgd: number, sumInsuredSgd: number): Ratio {
  if (!(tivSgd > 0)) {
    throw new Error(`coverageGapPct requires a positive TIV, received ${tivSgd}`);
  }
  const gap = tivSgd - sumInsuredSgd;
  const numerator = gap > 0 ? gap : 0;
  return {
    value: numerator / tivSgd,
    numerator,
    denominator: tivSgd,
    formula: 'max(0, tivSgd - sumInsuredSgd) / tivSgd',
  };
}

/**
 * Business-interruption adequacy: `biSumInsured / annualGrossProfit`.
 * Returns null when either input is missing so the UI can say "not assessed"
 * instead of showing a misleading zero.
 */
export function biAdequacy(coverage: Coverage): Ratio | null {
  if (coverage.biSumInsured === undefined || coverage.annualGrossProfit === undefined) {
    return null;
  }
  if (!(coverage.annualGrossProfit > 0)) {
    return null;
  }
  return {
    value: coverage.biSumInsured / coverage.annualGrossProfit,
    numerator: coverage.biSumInsured,
    denominator: coverage.annualGrossProfit,
    formula: 'biSumInsured / annualGrossProfit',
  };
}
