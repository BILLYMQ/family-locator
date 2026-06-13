const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const config = getDefaultConfig(__dirname, { isCSSEnabled: true });

config.resolver.platforms = ['web', 'ios', 'android', 'native'];

config.resolver.extraNodeModules = {
  '@opentelemetry/api': path.resolve(__dirname, 'src/stubs/opentelemetry.js'),
};

module.exports = withNativeWind(config, { input: './global.css' });
