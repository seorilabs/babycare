import { setup } from '@granite-js/react-native/jest';

process.env.FIREBASE_WEB_API_KEY ??= 'test-firebase-api-key';

setup({ rootDir: __filename });
