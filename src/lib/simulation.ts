/**
 * Assumptions
 * - The interest rate is constant
 * - The yearly savings is constant, and is added gradually throughout the year
 * - The tax is constant
 * - The tax is paid yearly
 *
 */

export interface YearState {
	year: number;
	age: number;
	iskSavings: number;
	compoundedInflation: number;
	cashFlow: number;
	incomePensionRights: number;
	premiumPensionRights: number;
	//servicePensionSavings: number;
}

export interface Parameters {
	inflationRate: number;
	iskInterestRate: number;
	iskTax: number;
	cashFlows: TimeBoundCashFlow[];
	countyTaxRate: number;
	churchTax: boolean;
	churchTaxRate: number;
	stateTaxRate: number;
	stateTaxThreshold: number;
	taxFreeThreshold: number;
	publicPensionContributionThreshold: number;
	incomePensionContributionRate: number;
	incomePensionRate: number;
	premiumPensionContributionRate: number;
	premiumPensionRate: number;
	statePensionAge: number;
	generalLifeExpectancy: number;

}

export interface TimeBoundCashFlow {
	startYear: number; // Inclusive
	endYear?: number; // Exclusive
	yearlyCashFlow: number;
	kind: 'GrossTaxableEarnedIncome' | 'NetExpense';
	publicPensionContributing: boolean; // Only used for GrossTaxableEarnedIncome
	//servicePensionContribution: number;
}

export interface Scenario {
	parameters: Parameters;
	startState: YearState;
	endYear: number;
}

export function defaultScenario(): Scenario {
	const currentYear = new Date().getFullYear();
	return {
		parameters: {
			inflationRate: 0.025,
			iskInterestRate: 0.08,
			iskTax: 0.01086,
			countyTaxRate: 0.325, // Strängnäs:0.325, GBG: 0.326
			churchTax: false,
			churchTaxRate: 0.01045,
			stateTaxRate: 0.2,
			stateTaxThreshold: 52000 * 12,
			taxFreeThreshold: 24238,
			publicPensionContributionThreshold: 571500,
			incomePensionContributionRate: 0.16,
			incomePensionRate: 0.033,
			premiumPensionContributionRate: 0.025,
			premiumPensionRate: 0.074,
			statePensionAge: 70,
			generalLifeExpectancy: 80,
			cashFlows: [
				{
					startYear: currentYear,
					endYear: currentYear + 9,
					yearlyCashFlow: 52000 * 12,
					kind: 'GrossTaxableEarnedIncome',
					publicPensionContributing: true
					// servicePensionContribution: 4.5
				},
				{
					startYear: currentYear,
					endYear: undefined,
					yearlyCashFlow: 15000 * 12,
					kind: 'NetExpense',
					publicPensionContributing: false
					// publicPensionContributing: false,
					// servicePensionContribution: 0
				}
			]
		},
		startState: {
			year: currentYear,
			age: 30,
			iskSavings: 1000000,
			compoundedInflation: 1,
			cashFlow: 0,
			premiumPensionRights: 0,
			incomePensionRights: 0
		},
		endYear: 2080
	};
}

function simulateYear(state: YearState, params: Parameters): YearState {
	const newYear = state.year + 1;
	const newAge = state.age + 1;

	const compoundedInflation = state.compoundedInflation * (1 + params.inflationRate);
	const compoundedInflationYearlyAverage =
		state.compoundedInflation * (1 + params.inflationRate / 2);

	const thisYearsStateTaxThreshold = params.stateTaxThreshold * compoundedInflationYearlyAverage;
	const thisYearsTaxFreeThreshold = params.taxFreeThreshold * compoundedInflationYearlyAverage;

	const yearlyCashFlows = params.cashFlows.filter(({ startYear, endYear }) => {
		if (startYear > newYear) return false;
		if (endYear === undefined) return true;
		return endYear > newYear;
	});

	const yearlyGrossPublicPensionContributingIncomePostInflation =
		Math.min(
			yearlyCashFlows
				.filter(
					({ kind, publicPensionContributing }) =>
						kind === 'GrossTaxableEarnedIncome' && publicPensionContributing
				)
				.reduce((acc, cf) => acc + cf.yearlyCashFlow, 0),
			params.publicPensionContributionThreshold
		) * compoundedInflationYearlyAverage;

	const incomePensionContributionPostInflation =
		yearlyGrossPublicPensionContributingIncomePostInflation * params.incomePensionContributionRate;
	const premiumPensionContributionPostInflation =
		yearlyGrossPublicPensionContributingIncomePostInflation * params.premiumPensionContributionRate;

	// Simplification: No new pension rights after pension age
	const incomePensionRights = newAge <= params.statePensionAge ?
		(state.incomePensionRights + incomePensionContributionPostInflation / 2) *
			(1 + params.incomePensionRate) +
		incomePensionContributionPostInflation / 2 : state.incomePensionRights;
	const premiumPensionRights = newAge <= params.statePensionAge ?
		(state.premiumPensionRights + premiumPensionContributionPostInflation / 2) *
			(1 + params.premiumPensionRate) +
			premiumPensionContributionPostInflation / 2 : state.premiumPensionRights;

	// Simplification: arvsvinst: https://www.pensionsmyndigheten.se/statistik/publikationer/orange-rapport-2021/a-berakningsfaktorer.html
	// Current we instead simulate arvsvinst by pretending that the pension is paid out based on life expectancy

	// Jobbskatteavdrag: https://www.bjornlunden.se/skatt/jobbskatteavdrag__196

	// grundavdrag https://www4.skatteverket.se/rattsligvagledning/27071.html?date=2024-01-01#section63-3
	// api grundavdrag: https://skatteverket.entryscape.net/rowstore/dataset/ebbd8d70-9b9c-4327-b2ce-a371ee66744c/html

	// Simplification: state pension payout is taxed as normal income
	const accumulatedPensionRights = state.incomePensionRights + state.premiumPensionRights;
	const grossPensionPayout = newAge > params.statePensionAge ? accumulatedPensionRights / (params.generalLifeExpectancy - params.statePensionAge): 0;


	const yearlyGrossTaxableEarnedIncomePostInflation =
		yearlyCashFlows
			.filter(({ kind }) => kind === 'GrossTaxableEarnedIncome')
			.reduce((acc, cf) => acc + cf.yearlyCashFlow, 0) * compoundedInflationYearlyAverage + grossPensionPayout;

	const thisYearCountyTaxBracketRate =
		params.countyTaxRate + (params.churchTax ? params.churchTaxRate : 0);
	const thisYearCountyTaxBracket =
		Math.max(
			Math.min(yearlyGrossTaxableEarnedIncomePostInflation, thisYearsStateTaxThreshold) -
				thisYearsTaxFreeThreshold,
			0
		) * thisYearCountyTaxBracketRate;

	const thisYearStateTaxBracketRate = thisYearCountyTaxBracketRate + params.stateTaxRate;
	const thisYearStateTaxBracket =
		(Math.max(yearlyGrossTaxableEarnedIncomePostInflation, thisYearsStateTaxThreshold) -
			thisYearsStateTaxThreshold) *
		thisYearStateTaxBracketRate;

	const yearlyNetIncomePostInflation =
		yearlyGrossTaxableEarnedIncomePostInflation -
		thisYearCountyTaxBracket -
		thisYearStateTaxBracket;

	const yearlyNetExpensePostInflation =
		yearlyCashFlows
			.filter(({ kind }) => kind === 'NetExpense')
			.reduce((acc, cf) => acc + cf.yearlyCashFlow, 0) * compoundedInflationYearlyAverage;

	const yearlyNetCashFlowPostInflation =
		yearlyNetIncomePostInflation - yearlyNetExpensePostInflation;

	// const publicPensionContributingCashFlows = yearlyCashFlows.filter(cf => cf.publicPensionContributing);
	// const publicPensionContributingCashFlow = publicPensionContributingCashFlows.reduce((acc, cf) => acc + cf.yearlyNetCashFlow, 0);

	// const yearlyIncomePensionRights = publicPensionContributingCashFlow * 0.16; // TODO: This should be calculated
	// const yearlyPremiumPensionRights = publicPensionContributingCashFlow * 0.025;

	const iskSavingsYearlyAverage = state.iskSavings + yearlyNetCashFlowPostInflation / 2;
	const iskInterest = iskSavingsYearlyAverage * params.iskInterestRate;
	const iskTax = iskSavingsYearlyAverage * params.iskTax;
	const newSavings = state.iskSavings + yearlyNetCashFlowPostInflation + iskInterest - iskTax;

	return {
		year: newYear,
		age: newAge,
		iskSavings: Math.floor(newSavings),
		compoundedInflation: compoundedInflation,
		cashFlow: yearlyNetCashFlowPostInflation,
		incomePensionRights: incomePensionRights,
		premiumPensionRights: premiumPensionRights
		// servicePensionSavings: state.servicePensionSavings,
	};
}

export function simulate({ endYear, startState, parameters }: Scenario): YearState[] {
	const results = [startState];
	for (let i = 0; i + startState.year < endYear; i++) {
		const newState = simulateYear(results[i], parameters);
		results.push(newState);
	}
	return results;
}
