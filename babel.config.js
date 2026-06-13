module.exports = function (api) {
  // api.caller() gère le cache implicitement selon la plateforme —
  // ne pas appeler api.cache() en même temps (conflit de configuration)
  const isWeb = api.caller(
    caller => !!(caller && caller.name === 'metro' && caller.platform === 'web')
  );

  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      // nativewind/babel requiert react-native-worklets, absent sur web
      ...(isWeb ? [] : ['nativewind/babel']),
    ],
  };
};
