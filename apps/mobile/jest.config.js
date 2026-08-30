module.exports = {
  preset: '@react-native/jest-preset',
  transformIgnorePatterns: [
    '<rootDir>/../../node_modules/.pnpm/(?!(?:@react-native\\+jest-preset|@react-native\\+js-polyfills|@seorilabs\\+platform-sdk|react-native)@)',
    'node_modules/(?!.pnpm|@react-native|@seorilabs|react-native)',
  ],
};
