import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function MapViewFallback(props: { style?: any; children?: React.ReactNode }) {
  return (
    <View style={[styles.container, props.style]}>
      <Ionicons name="map-outline" size={48} color="#9AA6B2" />
      <Text style={styles.text}>Maps are only available on mobile devices</Text>
    </View>
  );
}

export const Marker = (_props: any) => null;
export const Circle = (_props: any) => null;
export const Heatmap = (_props: any) => null;
export const PROVIDER_GOOGLE = 'google';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8ECF0',
    gap: 12,
  },
  text: {
    fontSize: 16,
    color: '#5A6675',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});
