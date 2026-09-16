import { appsInToss } from '@apps-in-toss/framework/plugins';
import { defineConfig } from '@granite-js/react-native/config';

export default defineConfig({
  scheme: 'intoss',
  appName: 'babynest',
  build: {
    esbuild: {
      define: {
        'process.env.FIREBASE_WEB_API_KEY': JSON.stringify(
          process.env.FIREBASE_WEB_API_KEY ?? '',
        ),
        'process.env.AIT_REWARDED_AD_GROUP_ID': JSON.stringify(
          process.env.AIT_REWARDED_AD_GROUP_ID ?? '',
        ),
        'process.env.APP_VERSION': JSON.stringify(
          process.env.APP_VERSION ?? '',
        ),
      },
    },
  },
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
