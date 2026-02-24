import { initializeApp } from "firebase/app";

const firebaseConfig = {
  apiKey: "AIzaSyD03iVYEZQ1RgPu17vyKLxEEakV8zmjfOE",
  authDomain: "ridemanager-pwa.firebaseapp.com",
  projectId: "ridemanager-pwa",
  storageBucket: "ridemanager-pwa.firebasestorage.app",
  messagingSenderId: "736502211722",
  appId: "1:736502211722:web:d1de8dd9e8e3bfae8a7973"
};

export const firebaseApp = initializeApp(firebaseConfig);
