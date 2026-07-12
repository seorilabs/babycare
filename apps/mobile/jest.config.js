module.exports = {
  preset: '@react-native/jest-preset',
  transformIgnorePatterns: [
    '<rootDir>/../../node_modules/.pnpm/(?!(?:@react-native\\+jest-preset|@react-native\\+js-polyfills|react-native)@)',
    'node_modules/(?!.pnpm|@react-native|react-native)',
  ],
};
