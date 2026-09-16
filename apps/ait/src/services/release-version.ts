const configuredVersion = process.env.APP_VERSION?.trim();

// Release builds inject the selected tag/build version through Granite.
// The fallback exists only for local development and tests.
export const AIT_APP_VERSION = configuredVersion || '0.1.0';
