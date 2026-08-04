import { appsInToss } from '@apps-in-toss/framework/plugins';
import { defineConfig } from '@granite-js/react-native/config';

export default defineConfig({
  scheme: 'intoss',
  appName: 'babynest',
  plugins: [
    appsInToss({
      brand: {
        displayName: '함께봄: 아기돌봄 기록',
        primaryColor: '#5FB49C',
        icon: 'https://static.toss.im/appsintoss/38345/ceacbe07-dffd-4218-8417-5c1f2a1694a0.png',
      },
      permissions: [],
    }),
  ],
});
