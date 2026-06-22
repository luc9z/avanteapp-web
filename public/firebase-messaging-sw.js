importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js')

firebase.initializeApp({
  apiKey: 'AIzaSyDan_QxlM3cPtRiJIEr0IkFBAHNkR5Yblw',
  authDomain: 'avante-pro.firebaseapp.com',
  projectId: 'avante-pro',
  storageBucket: 'avante-pro.firebasestorage.app',
  messagingSenderId: '615728091811',
  appId: '1:615728091811:web:33d8fe3eae3bca0d3ca516',
})

const messaging = firebase.messaging()

messaging.onBackgroundMessage(payload => {
  const { title, body, icon } = payload.notification || {}
  self.registration.showNotification(title || 'Avante', {
    body: body || '',
    icon: icon || '/icon-192.png',
    badge: '/icon-192.png',
  })
})
