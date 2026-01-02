import { createApp } from 'vue'
import { Quasar, Notify, Dialog } from 'quasar'
import '@quasar/extras/material-icons/material-icons.css'
import 'quasar/dist/quasar.css'
import App from './App.vue'

const myApp = createApp(App)

myApp.use(Quasar, {
    plugins: {
        Notify,
        Dialog
    }, // import Quasar plugins and add here
})

myApp.mount('#app')
