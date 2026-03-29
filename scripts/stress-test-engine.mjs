
import { performance } from 'perf_hooks';

// จำลองระบบ Scoring จาก recommend.js แบบย่อเพื่อทำ Stress Test
function scoreQuality(title) {
  const s = Number(title.score || 0);
  const pop = Number(title.popularity || 0);
  const qualityScore = s > 0 ? Math.max(0, Math.min((s - 60) / 35, 1)) : 0.25;
  const popularityScore = pop > 0 ? Math.min(Math.log10(pop + 1) / 6, 1) : 0;
  return qualityScore * 0.6 + popularityScore * 0.4;
}

function scoreFreshness(title) {
  const year = Number(title.year || 0);
  if (!year) return 0.35;
  const currentYear = new Date().getFullYear();
  const age = Math.max(0, currentYear - year);
  return Math.max(0.2, Math.exp(-age / 12));
}

function runStressTest(count) {
  console.log(`\n--- Running Stress Test with ${count.toLocaleString()} items ---`);
  
  // 1. Generate Mock Data
  const startGen = performance.now();
  const mockCatalog = Array.from({ length: count }, (_, i) => ({
    id: i,
    title_en: `Title ${i}`,
    score: Math.floor(Math.random() * 40) + 60,
    popularity: Math.floor(Math.random() * 100000),
    year: Math.floor(Math.random() * 20) + 2005,
    genres: ['Action', 'Romance', 'Comedy'].slice(0, Math.floor(Math.random() * 3) + 1),
    moods: ['happy', 'sad', 'exciting'].slice(0, Math.floor(Math.random() * 2) + 1),
  }));
  const endGen = performance.now();
  console.log(`Mock Data Generation: ${(endGen - startGen).toFixed(2)}ms`);

  // 2. Heavy Calculation (Simulating recommend() function)
  const startCalc = performance.now();
  const scored = mockCatalog.map(title => {
    const q = scoreQuality(title);
    const f = scoreFreshness(title);
    return { ...title, _total: q * 0.6 + f * 0.4 };
  });
  
  // 3. Sorting (The most expensive part)
  scored.sort((a, b) => b._total - a._total);
  const endCalc = performance.now();
  
  const totalTime = endCalc - startCalc;
  console.log(`Recommendation Calculation & Sort: ${totalTime.toFixed(2)}ms`);
  
  // 4. Memory Usage
  const used = process.memoryUsage().heapUsed / 1024 / 1024;
  console.log(`Memory Usage: ~${used.toFixed(2)} MB`);
  
  if (totalTime > 100) {
    console.log(`⚠️ WARNING: UI JANK DETECTED (>100ms). User will feel the lag.`);
  } else {
    console.log(`✅ PERFORMANCE OK: Below 100ms threshold.`);
  }
}

console.log("Starting Non-destructive Stress Test...");
runStressTest(1000);   // Baseline
runStressTest(10000);  // Target Phase 3
runStressTest(50000);  // Stress Level (Phase 4)
runStressTest(100000); // Extreme Scale
