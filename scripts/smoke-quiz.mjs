const base = process.env.APP_URL;
if (!base) throw new Error('APP_URL is required.');

const origin = new URL(base).origin;
const capability = await fetch(`${origin}/api/quiz`, { headers: { accept: 'application/json' } });
if (!capability.ok) throw new Error(`Quiz capability check failed with status ${capability.status}.`);
const { available } = await capability.json();

if (!available) {
  console.log('Quiz smoke test skipped: no OpenAI API key is available to the local service.');
  process.exit(0);
}

const response = await fetch(`${origin}/api/quiz`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    origin,
    'sec-fetch-site': 'same-origin',
    'x-speed-read-client': crypto.randomUUID(),
  },
  body: JSON.stringify({
    title: 'Attention and deliberate reading',
    text: [
      'Attention is not a switch that stays on by force. It is a limited resource that improves when distractions are made less convenient.',
      'A stable page helps because the reader can choose a pace without also tracking a moving layout. The boundary can advance while the text itself stays still.',
      'Comprehension matters more than a peak speed. A useful practice session therefore ends with recall, giving the reader evidence about what actually stayed.',
    ].join('\n\n'),
  }),
});

if (!response.ok) throw new Error(`Quiz request failed with status ${response.status}.`);
const quiz = await response.json();
if (!Array.isArray(quiz.questions) || quiz.questions.length !== 4) {
  throw new Error('Quiz response did not contain four questions.');
}
if (!quiz.questions.every((question) => Array.isArray(question.choices) && question.choices.length === 4)) {
  throw new Error('Quiz response choices were not structured correctly.');
}

console.log('Quiz smoke test passed: four structured questions returned through the local Pages runtime.');
