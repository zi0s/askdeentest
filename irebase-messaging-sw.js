importScripts('https://www.gstatic.com/firebasejs/12.9.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.9.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyChRjGYjYyI4yKp6XAgkbdCWHZnkrtkpE0",
  authDomain: "askdeen-21529.firebaseapp.com",
  projectId: "askdeen-21529",
  messagingSenderId: "483496063721",
  appId: "1:483496063721:web:22c8eb9efa098750557678"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  self.registration.showNotification(payload.notification.title, {
    body: payload.notification.body,
    icon: "/icon.png"
  });
});