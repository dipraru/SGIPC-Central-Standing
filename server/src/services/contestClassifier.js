/**
 * contestClassifier.js
 * Fuzzy Logic AI Classifier for Contest Difficulty Distribution
 *
 * Categorizes contests into 3 distinct categories:
 *  1. standard:    Difficulty is evenly distributed in a gradual progression.
 *  2. spike:       Some problems are super easy and others are too hard (sharp cliff/gap).
 *  3. equilibrium: All problems have nearly the same difficulty (no too hard, no too easy).
 */

function fuzzyLow(x, a, b) {
  if (x <= a) return 1.0;
  if (x >= b) return 0.0;
  return (b - x) / (b - a);
}

function fuzzyHigh(x, a, b) {
  if (x <= a) return 0.0;
  if (x >= b) return 1.0;
  return (x - a) / (b - a);
}

function fuzzyMedium(x, a, b, c, d) {
  if (x <= a || x >= d) return 0.0;
  if (x >= b && x <= c) return 1.0;
  if (x > a && x < b) return (x - a) / (b - a);
  return (d - x) / (d - c);
}

export function classifyContestSolves(solves = []) {
  const cleanSolves = solves
    .map((s) => Number(s))
    .filter((s) => !isNaN(s) && s >= 0)
    .sort((a, b) => b - a);

  const n = cleanSolves.length;
  const totalSolves = cleanSolves.reduce((acc, v) => acc + v, 0);

  // Edge cases: <3 problems or <5 total solves
  if (n < 3 || totalSolves < 5) {
    return {
      category: "standard",
      scores: { standard: 0.8, spike: 0.1, equilibrium: 0.1 },
      explanation:
        "Default standard categorization (insufficient problem count or solves to evaluate distribution)",
    };
  }

  // Statistical feature extraction
  const mu = totalSolves / n;
  const variance =
    cleanSolves.reduce((acc, x) => acc + Math.pow(x - mu, 2), 0) / n;
  const sigma = Math.sqrt(variance);
  const cv = sigma / (mu + 1e-6);

  const sMax = cleanSolves[0];
  const sMin = cleanSolves[n - 1];

  // Median
  const mid = Math.floor(n / 2);
  const sMed =
    n % 2 === 1
      ? cleanSolves[mid]
      : (cleanSolves[mid - 1] + cleanSolves[mid]) / 2.0;

  const ratioMaxMin = sMax / (sMin + 1);
  const ratioMaxMed = sMax / (sMed + 1);

  // Consecutive drops
  const dropRatios = [];
  const drops = [];
  for (let i = 0; i < n - 1; i++) {
    dropRatios.push((cleanSolves[i] + 1) / (cleanSolves[i + 1] + 1));
    drops.push(cleanSolves[i] - cleanSolves[i + 1]);
  }

  const maxDropRatio = dropRatios.length > 0 ? Math.max(...dropRatios) : 1.0;
  const sRange = sMax - sMin;
  const maxGap = drops.length > 0 ? Math.max(...drops) : 0;
  const maxGapPct = sRange > 0 ? maxGap / (sRange + 1e-6) : 0.0;

  // Top solve concentration
  const k = Math.max(1, Math.min(2, Math.floor(n / 3)));
  const topKPct =
    cleanSolves.slice(0, k).reduce((acc, v) => acc + v, 0) / (totalSolves + 1e-6);

  // Drop variance
  const meanGap =
    drops.length > 0
      ? drops.reduce((a, b) => a + b, 0) / drops.length
      : 1.0;
  const gapVariance =
    drops.length > 0
      ? drops.reduce((acc, g) => acc + Math.pow(g - meanGap, 2), 0) /
        drops.length
      : 0.0;
  const gapCv = Math.sqrt(gapVariance) / (meanGap + 1e-6);

  // --- FUZZY INFERENCE RULES ---
  // 1. Equilibrium: uniform difficulty
  const eqCv = fuzzyLow(cv, 0.35, 0.55);
  const eqRatioMed = fuzzyLow(ratioMaxMed, 1.5, 2.1);
  const eqRatioMin = fuzzyLow(ratioMaxMin, 3.0, 7.0);
  const eqDrop = fuzzyLow(maxDropRatio, 1.6, 2.3);
  const muEq =
    0.35 * eqCv + 0.25 * eqRatioMed + 0.25 * eqRatioMin + 0.15 * eqDrop;

  // 2. Spike: sharp disparity / cliff
  const spDrop = fuzzyHigh(maxDropRatio, 2.4, 4.2);
  const spRatioMed = fuzzyHigh(ratioMaxMed, 2.5, 4.5);
  const spGap = fuzzyHigh(maxGapPct, 0.28, 0.5);
  const spTopPct = fuzzyHigh(topKPct, 0.4, 0.65);
  const spCv = fuzzyHigh(cv, 0.7, 1.1);
  const muSp =
    0.3 * spDrop +
    0.25 * spRatioMed +
    0.2 * spGap +
    0.15 * spTopPct +
    0.1 * spCv;

  // 3. Standard: gradual progression
  const stdCv = fuzzyMedium(cv, 0.38, 0.48, 0.72, 0.98);
  const stdRatioMed = fuzzyMedium(ratioMaxMed, 1.7, 2.2, 3.2, 4.5);
  const stdGap = fuzzyLow(gapCv, 0.6, 1.6);
  const muStd = 0.4 * stdCv + 0.35 * stdRatioMed + 0.25 * stdGap;

  // Normalization
  const totalMu = muEq + muSp + muStd;
  let scores = { standard: 0.6, spike: 0.2, equilibrium: 0.2 };
  if (totalMu > 0) {
    scores = {
      standard: Number((muStd / totalMu).toFixed(3)),
      spike: Number((muSp / totalMu).toFixed(3)),
      equilibrium: Number((muEq / totalMu).toFixed(3)),
    };
  }

  let bestCat = "standard";
  if (scores.spike > scores.standard && scores.spike > scores.equilibrium) {
    bestCat = "spike";
  } else if (
    scores.equilibrium > scores.standard &&
    scores.equilibrium > scores.spike
  ) {
    bestCat = "equilibrium";
  }

  let explanation = "";
  if (bestCat === "equilibrium") {
    explanation = `Uniform difficulty across problems (CV=${cv.toFixed(
      2
    )}, max/min=${ratioMaxMin.toFixed(1)}x, max drop=${maxDropRatio.toFixed(1)}x)`;
  } else if (bestCat === "spike") {
    explanation = `Sharp disparity: easiest problem has ${ratioMaxMed.toFixed(
      1
    )}x median solves, with a max drop of ${maxDropRatio.toFixed(1)}x`;
  } else {
    explanation = `Evenly distributed progressive difficulty decay (CV=${cv.toFixed(
      2
    )}, max/med=${ratioMaxMed.toFixed(1)}x)`;
  }

  return {
    category: bestCat,
    scores,
    explanation,
  };
}
