import { initializeApp } from "firebase/app";
import { getAnalytics, logEvent } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyBD-4-5Uvt9NEwFsubK-uGRHmCiz9EXbt8",
  authDomain: "ai-song-writing.firebaseapp.com",
  projectId: "ai-song-writing",
  storageBucket: "ai-song-writing.firebasestorage.app",
  messagingSenderId: "506680846805",
  appId: "1:506680846805:web:3fe12807f8976f7955b55c",
  measurementId: "G-T7PXP4P534"
};

const app = initializeApp(firebaseConfig);
export const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;

export const logForgeEvent = (eventName: string, params?: any) => {
  if (analytics) {
    logEvent(analytics, eventName, params);
  }
};
