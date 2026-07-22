import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { NavigationTracker, OnRamp } from '@onramp-sdk/react-native'

type Routes = { Welcome: undefined; Profile: undefined; FirstAction: { name: string }; Complete: undefined }
const Stack = createNativeStackNavigator<Routes>()
const apiKey = process.env.EXPO_PUBLIC_ONRAMP_API_KEY

function Button({ children, onPress }: { children: string; onPress: () => void }) {
  return <Pressable style={styles.button} onPress={onPress}><Text style={styles.buttonText}>{children}</Text></Pressable>
}

function Page({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return <View style={styles.page}><Text style={styles.title}>{title}</Text><Text style={styles.body}>{body}</Text>{children}</View>
}

function Welcome({ navigation }: any) {
  return <Page title="Welcome to Trail Notes" body="This small app tracks meaningful onboarding milestones, not every tap."><Button onPress={() => { OnRamp.step('account_created', { properties: { source: 'expo_example' } }); navigation.navigate('Profile') }}>Create an account</Button></Page>
}

function Profile({ navigation }: any) {
  const [name, setName] = useState('')
  return <Page title="Set up your profile" body="Profile completion is the next funnel milestone."><TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Your name" /><Button onPress={() => { const value = name.trim() || 'Explorer'; OnRamp.identify({ userId: `example_${value.toLowerCase().replace(/\\s+/g, '_')}` }); OnRamp.step('profile_completed', { properties: { source: 'expo_example' } }); navigation.navigate('FirstAction', { name: value }) }}>Save profile</Button></Page>
}

function FirstAction({ navigation, route }: any) {
  return <Page title={`Choose your first trail, ${route.params.name}`} body="A first value action is usually the right endpoint for an onboarding funnel."><Button onPress={() => { OnRamp.step('first_trail_saved', { properties: { trail_type: 'coastal', source: 'expo_example' } }); navigation.navigate('Complete') }}>Save a trail</Button></Page>
}

function Complete() {
  return <Page title="You are ready to explore" body="Create a funnel in OnRamp: account_created → profile_completed → first_trail_saved." />
}

export default function App() {
  useEffect(() => {
    if (!apiKey) return console.warn('Set EXPO_PUBLIC_ONRAMP_API_KEY before running this example.')
    void OnRamp.init({ apiKey, appVersion: '1.0.0' })
  }, [])
  return <NavigationTracker><NavigationContainer><StatusBar style="dark" /><Stack.Navigator screenOptions={{ headerShadowVisible: false }}><Stack.Screen name="Welcome" component={Welcome} /><Stack.Screen name="Profile" component={Profile} /><Stack.Screen name="FirstAction" component={FirstAction} options={{ title: 'Your first trail' }} /><Stack.Screen name="Complete" component={Complete} /></Stack.Navigator></NavigationContainer></NavigationTracker>
}

const styles = StyleSheet.create({
  page: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fffaf7' },
  title: { color: '#1f1714', fontSize: 30, fontWeight: '700' },
  body: { color: '#6c5d55', fontSize: 16, lineHeight: 24, marginTop: 12, marginBottom: 28 },
  input: { borderColor: '#daccc4', borderWidth: 1, borderRadius: 10, backgroundColor: '#fff', fontSize: 16, marginBottom: 12, padding: 14 },
  button: { alignItems: 'center', borderRadius: 10, backgroundColor: '#c45a2a', padding: 14 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
})
