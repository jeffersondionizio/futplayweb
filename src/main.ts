import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './rotas'
import { i18n } from './servicos/idioma'
import './estilo/tema.css'
import './estilo/cartoes.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(i18n)
app.mount('#app')
