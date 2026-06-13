// Stub vide pour @opentelemetry/api — non utilisé dans FamilyLocator
// Supabase l'importe dynamiquement pour le tracing optionnel
module.exports = {
  trace: { getTracer: () => ({ startSpan: () => ({}) }) },
  context: {},
  SpanStatusCode: {},
};
