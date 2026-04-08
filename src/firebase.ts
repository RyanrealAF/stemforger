import { initializeApp } from "firebase/app";
import { getAnalytics, logEvent, Analytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const app = initializeApp(firebaseConfig);
let analytics: Analytics | null = null;

const getAnalyticsInstance = () => {
  if (!analytics && typeof window !== 'undefined') {
    analytics = getAnalytics(app);
  }
  return analytics;
}

export const logForgeEvent = (eventName: string, params?: any) => {
  const analyticsInstance = getAnalyticsInstance();
  if (analyticsInstance) {
    logEvent(analyticsInstance, eventName, params);
  }
};
