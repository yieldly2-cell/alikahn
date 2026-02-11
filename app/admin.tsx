import { useEffect } from 'react';
import { Platform, View, Text, StyleSheet, ActivityIndicator } from 'react-native';

export default function AdminRedirect() {
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const loc = window.location;
      let adminUrl: string;
      if (loc.hostname === 'localhost' || loc.hostname === '127.0.0.1') {
        adminUrl = 'http://localhost:5000/admin';
      } else {
        adminUrl = `${loc.protocol}//${loc.hostname}:5000/admin`;
      }
      window.location.href = adminUrl;
    }
  }, []);

  return (
    <View style={styles.container}>
      {Platform.OS === 'web' ? (
        <>
          <ActivityIndicator size="large" color="#00C853" />
          <Text style={styles.text}>Redirecting to admin panel...</Text>
        </>
      ) : (
        <Text style={styles.text}>Admin panel is only accessible via web browser</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#121212',
    gap: 16,
  },
  text: {
    color: '#E5E7EB',
    fontSize: 16,
    fontFamily: 'DMSans_400Regular',
  },
});
