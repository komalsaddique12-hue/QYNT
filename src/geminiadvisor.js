const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

export async function getAdvice(transactions, currency) {
  // 1. Transactions ko summary mein convert karein
  const income = transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const expense = -transactions.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0);
  const byCategory = {};
  transactions.filter(t => t.amount < 0).forEach(t => {
    byCategory[t.head] = (byCategory[t.head] || 0) + Math.abs(t.amount);
  });

  // 2. Prompt banayein
  const prompt = `You are a personal finance advisor. Analyze this user's spending and give 3 specific, actionable tips in simple English. Be encouraging, not judgmental.

Financial summary:
- Total income: ${income} ${currency}
- Total expenses: ${expense} ${currency}
- Net savings: ${income - expense} ${currency}
- Spending by category: ${JSON.stringify(byCategory, null, 2)}

Give 3 short paragraphs, each starting with a number and a bold headline.`;

  // 3. API call karein
  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    })
  });

  if (!res.ok) throw new Error("Gemini API call failed");
  const data = await res.json();
  return data.candidates[0].content.parts[0].text;
}