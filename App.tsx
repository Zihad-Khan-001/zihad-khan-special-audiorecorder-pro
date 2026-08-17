import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, SafeAreaView, ScrollView, Alert } from 'react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';

export default function App() {
  const [activeTab, setActiveTab] = useState<'studio' | 'dsp'>('studio');
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordTime, setRecordTime] = useState('00:00.000');
  
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playPosition, setPlayPosition] = useState('00:00.000');
  const [audioMode, setAudioMode] = useState<'RAW' | 'MASTERED'>('RAW');
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    return () => {
      if (sound) sound.unloadAsync();
    };
  }, [sound]);

  // ১. রেকর্ডিং শুরু ও বন্ধের লজিক
  async function startRecording() {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('অনুমতি প্রয়োজন', 'মাইক্রোফোন ব্যবহারের অনুমতি দিন');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      setRecording(recording);
      setIsRecording(true);
      startTimeRef.current = Date.now();

      timerRef.current = setInterval(() => {
        const millis = Date.now() - startTimeRef.current;
        const seconds = Math.floor((millis / 1000) % 60);
        const minutes = Math.floor((millis / (1000 * 60)) % 60);
        const ms = Math.floor((millis % 1000) / 10);
        setRecordTime(
          `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
        );
      }, 50);

    } catch (err) {
      Alert.alert('এরর', 'রেকর্ডিং শুরু করা যায়নি');
    }
  }

  async function stopRecording() {
    if (!recording) return;
    setIsRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);

    await recording.stopAndUnloadAsync();
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

    const uri = recording.getURI();
    setAudioUri(uri);
    setRecording(null);
  }

  // ২. অডিও প্লেব্যাক ও মোড সুইচ (RAW / MASTERED)
  async function playPauseAudio() {
    if (!audioUri) return;

    if (sound) {
      if (isPlaying) {
        await sound.pauseAsync();
        setIsPlaying(false);
      } else {
        await sound.playAsync();
        setIsPlaying(true);
      }
    } else {
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: audioUri },
        { shouldPlay: true }
      );
      setSound(newSound);
      setIsPlaying(true);

      newSound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded) {
          const millis = status.positionMillis;
          const seconds = Math.floor((millis / 1000) % 60);
          const minutes = Math.floor((millis / (1000 * 60)) % 60);
          setPlayPosition(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
          
          if (status.didJustFinish) {
            setIsPlaying(false);
            setPlayPosition('00:00.000');
          }
        }
      });
    }
  }

  // ৩. মোবাইলের গ্যালারি/মেমরিতে এক্সপোর্ট
  async function exportAudio() {
    if (!audioUri) {
      Alert.alert('সংকেত', 'প্রথমে একটি অডিও রেকর্ড করুন');
      return;
    }

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(audioUri, {
        mimeType: 'audio/wav',
        dialogTitle: 'Save Audio File',
      });
    } else {
      Alert.alert('এরর', 'ফাইল শেয়ার বা সেভ করার সুবিধা টি ডিভাইসে উপলব্ধ নয়');
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Studio</Text>
        <Text style={styles.subtitle}>Naishabda Voice Engine • 48 kHz session</Text>
      </View>

      {activeTab === 'studio' ? (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.card}>
            <Text style={styles.statusText}>{isRecording ? '🔴 RECORDING — LIVE INPUT' : 'READY TO RECORD'}</Text>
            <Text style={styles.timer}>{isRecording ? recordTime : '00:00.000'}</Text>
          </View>

          <View style={styles.controlsContainer}>
            {!isRecording ? (
              <TouchableOpacity style={styles.recordButton} onPress={startRecording}>
                <Ionicons name="mic" size={40} color="#fff" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={[styles.recordButton, styles.stopButton]} onPress={stopRecording}>
                <Ionicons name="square" size={35} color="#fff" />
              </TouchableOpacity>
            )}
          </View>

          {audioUri && (
            <View style={styles.playbackCard}>
              <Text style={styles.takeTitle}>Poetry Take 1</Text>
              
              <View style={styles.modeToggleContainer}>
                <TouchableOpacity 
                  style={[styles.modeBtn, audioMode === 'RAW' && styles.activeModeBtn]}
                  onPress={() => setAudioMode('RAW')}
                >
                  <Text style={styles.modeBtnText}>RAW</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.modeBtn, audioMode === 'MASTERED' && styles.activeModeBtn]}
                  onPress={() => setAudioMode('MASTERED')}
                >
                  <Text style={styles.modeBtnText}>✨ MASTERED</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.playTimer}>{playPosition}</Text>

              <View style={styles.playRow}>
                <TouchableOpacity style={styles.playBtn} onPress={playPauseAudio}>
                  <Ionicons name={isPlaying ? "pause" : "play"} size={32} color="#fff" />
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={styles.exportBtn} onPress={exportAudio}>
                <Ionicons name="download-outline" size={20} color="#fff" style={{marginRight: 8}} />
                <Text style={styles.exportText}>Export WAV</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      ) : (
        <View style={styles.content}>
          <Text style={{color: '#fff', textAlign: 'center', marginTop: 50}}>DSP Lab Controls Loaded Active</Text>
        </View>
      )}

      {/* বটম নেভিগেশন বার */}
      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab('studio')}>
          <Ionicons name="mic" size={24} color={activeTab === 'studio' ? '#ff4757' : '#888'} />
          <Text style={[styles.navText, { color: activeTab === 'studio' ? '#ff4757' : '#888' }]}>STUDIO</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab('dsp')}>
          <Ionicons name="options" size={24} color={activeTab === 'dsp' ? '#ff4757' : '#888'} />
          <Text style={[styles.navText, { color: activeTab === 'dsp' ? '#ff4757' : '#888' }]}>DSP LAB</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121214' },
  header: { padding: 20, paddingTop: 40 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#ffffff' },
  subtitle: { fontSize: 13, color: '#888888', marginTop: 4 },
  content: { padding: 20, alignment: 'center' },
  card: { backgroundColor: '#1e1e24', padding: 25, borderRadius: 16, alignItems: 'center', marginBottom: 20 },
  statusText: { color: '#ff4757', fontWeight: 'bold', fontSize: 12, marginBottom: 10 },
  timer: { color: '#ffffff', fontSize: 36, fontWeight: 'bold' },
  controlsContainer: { alignItems: 'center', marginVertical: 10 },
  recordButton: { backgroundColor: '#ff4757', width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center' },
  stopButton: { backgroundColor: '#2ed573' },
  playbackCard: { backgroundColor: '#1e1e24', padding: 20, borderRadius: 16, marginTop: 15 },
  takeTitle: { color: '#ffffff', fontSize: 18, fontWeight: 'bold', marginBottom: 15 },
  modeToggleContainer: { flexDirection: 'row', backgroundColor: '#121214', borderRadius: 8, padding: 4, marginBottom: 15 },
  modeBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 6 },
  activeModeBtn: { backgroundColor: '#ff4757' },
  modeBtnText: { color: '#ffffff', fontWeight: 'bold', fontSize: 12 },
  playTimer: { color: '#ff4757', fontSize: 20, textAlign: 'center', marginVertical: 10, fontWeight: 'bold' },
  playRow: { alignItems: 'center', marginVertical: 10 },
  playBtn: { backgroundColor: '#1e90ff', width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center' },
  exportBtn: { flexDirection: 'row', backgroundColor: '#2ed573', padding: 14, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginTop: 15 },
  exportText: { color: '#ffffff', fontWeight: 'bold', fontSize: 16 },
  bottomNav: { flexDirection: 'row', backgroundColor: '#18181c', borderTopWidth: 1, borderTopColor: '#222', paddingVertical: 12 },
  navItem: { flex: 1, alignItems: 'center' },
  navText: { fontSize: 11, fontWeight: 'bold', marginTop: 4 }
});
