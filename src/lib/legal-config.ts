// Single place for the facts the Privacy Policy and Terms pages quote.
// Replace every [PLACEHOLDER] before deploying.
export const LEGAL = {
  operatorName: 'Gona Janardhan Reddy',
  city: 'Jammalamadugu, Andhra Pradesh',
  supportEmail: 'itsreddygona@gmail.com',
  lastUpdated: '3 October 2026',
};

if (process.env.NODE_ENV === 'production' && Object.values(LEGAL).some(v => v.startsWith('['))) {
  console.warn('legal-config: placeholders still present in src/lib/legal-config.ts');
}
