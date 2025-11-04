import { View, StyleSheet } from 'react-native';
import { ChatInterface } from '@/components/ChatInterface';
import { colors } from '@/lib/colors';

export default function HealthCoachScreen() {
  return (
    <View style={styles.container}>
      <ChatInterface assistantType="health_coach" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
