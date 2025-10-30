// firebase-messaging-sw.js
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyDW80ZbwOB7QHHW76kSL9cqlzMoyPFZ7nI",
  authDomain: "ylearn-fe1fa.firebaseapp.com",
  projectId: "ylearn-fe1fa",
  messagingSenderId: "1092852055944",
  appId: "1:1092852055944:web:85c3df7cf4c0cbcdca043d"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function (payload) {
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: "/logo.png"
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});