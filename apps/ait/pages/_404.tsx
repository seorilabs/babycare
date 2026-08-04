import React from 'react';
import { Text, View } from 'react-native';

export default function NotFoundPage() {
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text>페이지를 찾을 수 없어요.</Text>
    </View>
  );
}
