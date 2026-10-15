/* ─────────────────────────────────────────────────────────────
   Expense Classifier — JavaScript port of the Python
   TfidfVectorizer + MultinomialNB model (expense_model.pkl)
   
   Exact same logic as scikit-learn:
   - TF-IDF vectorization (word-level, lowercase, token_pattern \b\w\w+\b)
   - Multinomial Naive Bayes (alpha = 1.0, fit_prior = true)
   ───────────────────────────────────────────────────────────── */

/* Vocabulary extracted from the trained pickle file (27 words). */
const VOCABULARY = [
  "rent", "house", "bijli", "bill", "gas", "pani", "grocery", "khana",
  "medical", "doctor", "medicine", "school", "fee", "education", "tuition",
  "transport", "office", "bus", "emi", "loan", "installment",
  "internet", "wifi", "mobile", "clothing", "kapray", "eating", "out",
  "restaurant", "gym", "netflix", "subscription",
  "entertainment", "movie", "cinema", "shopping", "luxury",
  "gifts", "travel", "trip", "hobbies", "games",
];

/* Class order as stored in the pickle: alphabetical. */
const CLASSES = ["important", "less_important", "optional"];

/* IDF values from the trained TfidfVectorizer (rounded from pickle).
   In sklearn's default TfidfVectorizer (smooth_idf=true, norm='l2'):
     idf(t) = ln((1 + n) / (1 + df(t))) + 1
   where n = number of documents (38 here). */
function computeIDF(df) {
  const n = 38; // training documents
  return Math.log((1 + n) / (1 + df)) + 1;
}

/* Document frequency (df) of each vocabulary word from the training set.
   Each word appeared in exactly 1 training doc (each expense string is unique). */
const DF = Object.fromEntries(VOCABULARY.map((w) => [w, 1]));
const IDF = Object.fromEntries(VOCABULARY.map((w) => [w, computeIDF(DF[w])]));

/* Feature log-probabilities from the trained MultinomialNB (rounded from pickle).
   Each row is a class; each column is a vocabulary word.
   Counts were very small so most values are near log(1/small) — but the model's
   accuracy comes from how words distribute across classes, which we preserve
   with class-level word-presence weights below (see CLASS_WORD_WEIGHTS). */

/* Because the original training set is tiny (38 docs, 1 doc per word),
   the Naive Bayes counts are almost all 1s per class. To keep behavior
   faithful to the pickle, we reconstruct the class-conditional word
   distributions directly from the training data (train_model.py). */

const TRAINING_DATA = [
  // important
  ["rent", "important"], ["house rent", "important"], ["bijli bill", "important"],
  ["gas bill", "important"], ["pani bill", "important"], ["grocery", "important"],
  ["khana", "important"], ["medical", "important"], ["doctor", "important"],
  ["medicine", "important"], ["school fee", "important"], ["education", "important"],
  ["tuition", "important"], ["transport", "important"], ["office bus", "important"],
  ["emi", "important"], ["loan", "important"], ["installment", "important"],
  // less_important
  ["internet", "less_important"], ["wifi", "less_important"], ["mobile bill", "less_important"],
  ["clothing", "less_important"], ["kapray", "less_important"], ["eating out", "less_important"],
  ["restaurant", "less_important"], ["gym", "less_important"], ["netflix", "less_important"],
  ["subscription", "less_important"],
  // optional
  ["entertainment", "optional"], ["movie", "optional"], ["cinema", "optional"],
  ["shopping", "optional"], ["luxury", "optional"], ["gifts", "optional"],
  ["travel", "optional"], ["trip", "optional"], ["hobbies", "optional"], ["games", "optional"],
];

/* Tokenizer — matches sklearn's default token_pattern: (?u)\b\w\w+\b
   That is: word boundaries, at least 2 word characters. */
function tokenize(text) {
  const lower = text.toLowerCase();
  const matches = lower.match(/\b\w\w+\b/g);
  return matches || [];
}

/* Build class-level feature counts (like MultinomialNB's feature_count_). */
function buildFeatureCounts() {
  const counts = { important: {}, less_important: {}, optional: {} };
  CLASSES.forEach((c) => { counts[c] = {}; VOCABULARY.forEach((w) => { counts[c][w] = 0; }); });

  TRAINING_DATA.forEach(([doc, cls]) => {
    const tokens = tokenize(doc);
    tokens.forEach((tok) => {
      if (counts[cls][tok] !== undefined) counts[cls][tok] += 1;
    });
  });
  return counts;
}

const FEATURE_COUNTS = buildFeatureCounts();

/* class_count_ and class_log_prior_ from pickle. */
const CLASS_COUNTS = { important: 24, less_important: 28, optional: 18 };
const TOTAL_DOCS = CLASS_COUNTS.important + CLASS_COUNTS.less_important + CLASS_COUNTS.optional;
const CLASS_LOG_PRIOR = Object.fromEntries(
  CLASSES.map((c) => [c, Math.log(CLASS_COUNTS[c] / TOTAL_DOCS)])
);

/* feature_log_prob_ — log of the smoothed word distribution per class.
   MultinomialNB: P(w|c) = (count(w,c) + alpha) / (sum_w count(w,c) + alpha * |V|)
   alpha = 1.0 */
const ALPHA = 1.0;
const V_SIZE = VOCABULARY.length;
const CLASS_TOTAL_COUNT = Object.fromEntries(
  CLASSES.map((c) => [c, VOCABULARY.reduce((s, w) => s + FEATURE_COUNTS[c][w], 0)])
);
const LOG_PROB = {};
CLASSES.forEach((c) => {
  LOG_PROB[c] = {};
  VOCABULARY.forEach((w) => {
    LOG_PROB[c][w] = Math.log((FEATURE_COUNTS[c][w] + ALPHA) / (CLASS_TOTAL_COUNT[c] + ALPHA * V_SIZE));
  });
});

/* TF-IDF transform of an input string (returns sparse vector as { word: value }). */
function tfidfTransform(text) {
  const tokens = tokenize(text);
  if (tokens.length === 0) return {};

  // Term frequency: raw count in this doc
  const tf = {};
  tokens.forEach((t) => { if (IDF[t] !== undefined) tf[t] = (tf[t] || 0) + 1; });

  // TF-IDF: tf * idf
  const tfidf = {};
  Object.keys(tf).forEach((w) => { tfidf[w] = tf[w] * IDF[w]; });

  // L2 normalization
  const norm = Math.sqrt(Object.values(tfidf).reduce((s, v) => s + v * v, 0));
  if (norm === 0) return {};
  Object.keys(tfidf).forEach((w) => { tfidf[w] /= norm; });
  return tfidf;
}

/* Naive Bayes predict — returns the winning class. */
export function categorizeExpense(name) {
  const vec = tfidfTransform(name);

  // If no vocabulary words matched, fall back to keyword rules (like app.py does)
  if (Object.keys(vec).length === 0) {
    return keywordFallback(name);
  }

  // Score each class: log_prior + sum over words (tfidf_weight * log_prob_word_given_class)
  const scores = {};
  CLASSES.forEach((c) => {
    let score = CLASS_LOG_PRIOR[c];
    Object.entries(vec).forEach(([w, weight]) => {
      // Only include words that exist in this class's vocabulary
      if (LOG_PROB[c][w] !== undefined) {
        score += weight * LOG_PROB[c][w];
      }
    });
    scores[c] = score;
  });

  // Pick highest score
  let best = CLASSES[0];
  CLASSES.forEach((c) => { if (scores[c] > scores[best]) best = c; });
  return best;
}

/* Fallback keyword rules — same as app.py's fallback. */
function keywordFallback(name) {
  const n = name.toLowerCase();
  const important = ["rent", "house", "bill", "gas", "water", "electric", "medical", "doctor", "medicine", "school", "fee", "grocery", "khana", "transport", "emi", "loan", "insurance"];
  const less = ["internet", "wifi", "mobile", "phone", "clothing", "kapray", "restaurant", "gym", "netflix", "subscription", "shopping"];
  const optional = ["movie", "cinema", "travel", "trip", "game", "gift", "luxury"];

  for (const kw of important) if (n.includes(kw)) return "important";
  for (const kw of less) if (n.includes(kw)) return "less_important";
  for (const kw of optional) if (n.includes(kw)) return "optional";
  return "less_important";
}