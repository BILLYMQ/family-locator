const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Résolution des extensions .web.* en priorité sur le web
config.resolver.platforms = ['web', 'ios', 'android', 'native'];

// Stubs pour les modules non disponibles sur web
config.resolver.extraNodeModules = {
  '@opentelemetry/api': path.resolve(__dirname, 'src/stubs/opentelemetry.js'),
};

module.exports = config;
