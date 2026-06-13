// Extension dynamique de app.json — permet d'injecter EXPO_BASE_URL
// à la compilation (utilisé par GitHub Pages pour le chemin /repo-name).
module.exports = ({ config }) => ({
  ...config,
  experiments: {
    ...config.experiments,
    baseUrl: process.env.EXPO_BASE_URL ?? '',
  },
});
